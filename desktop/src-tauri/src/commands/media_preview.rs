//! In-app preview of a relay `/media/` attachment.
//!
//! Two commands sit beside the download path in [`super::media_download`] and
//! deliberately reuse its gate rather than growing a second one:
//!
//! - [`fetch_preview_bytes`] returns the bytes in memory so the frontend can
//!   render them. Nothing touches the disk.
//! - [`open_file_in_default_app`] is the escape hatch for a type we cannot
//!   render. It is the only path here that writes a file, and it writes it to a
//!   fresh temporary directory, never to a user-visible location. What may be
//!   handed to the OS at all is [`crate::external_open_policy`]'s decision, and
//!   the directory's removal is [`super::external_open_temp`]'s.
//!
//! Both go through [`resolve_download_url`] — the same predecessor-origin
//! rewrite and the same SSRF gate as `download_file` — and both fetch what that
//! function returned rather than the URL they were handed.

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::app_state::AppState;
use crate::commands::external_open_temp::{
    create_external_open_dir, seal_external_open_file, write_external_open_file,
};
use crate::commands::media::detect_and_validate_mime;
use crate::commands::media_download::{
    fetch_blob_bytes_with_cap, resolve_download_url, MAX_DOWNLOAD_BYTES,
};
use crate::external_open_policy::ApprovedOpenName;
use crate::relay::relay_api_base_url_with_override;

/// Maximum size of an attachment we will pull into memory to preview: 25 MiB.
///
/// Lower than [`MAX_DOWNLOAD_BYTES`] on purpose. A download streams to a file
/// the user chose; a preview holds the whole blob in the webview and hands a
/// copy to a PDF rasteriser, so the same 50 MiB would be charged twice against
/// the renderer process. Exceeding it is not an error the user has to work
/// around — the frontend falls back to offering the download.
pub(super) const MAX_PREVIEW_BYTES: u64 = 25 * 1024 * 1024;

/// If these two ever converge, the preview path has quietly taken on the
/// download path's whole memory budget — twice over, since the renderer holds
/// its own copy. A compile-time assertion, so it cannot be merged, not merely
/// a test that would have to be run.
const _: () = assert!(MAX_PREVIEW_BYTES < MAX_DOWNLOAD_BYTES);

/// What the frontend expects the bytes to be, chosen from the message's imeta
/// before anything is fetched.
///
/// Carried into the command so the bytes can be checked against it. The imeta
/// MIME and the filename are both sender-supplied, so "declared a PDF" is not
/// evidence of a PDF; without this check a mislabelled attachment would reach
/// the PDF rasteriser as arbitrary bytes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum PreviewKind {
    /// Rendered page-by-page to canvas by the frontend.
    Pdf,
    /// Handed to the existing image viewer.
    Image,
}

impl PreviewKind {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "pdf" => Ok(PreviewKind::Pdf),
            "image" => Ok(PreviewKind::Image),
            other => Err(format!(
                "\"{other}\" is not a previewable kind — expected \"pdf\" or \"image\""
            )),
        }
    }
}

/// `%PDF-`: the header every PDF starts with (ISO 32000-1 §7.5.2).
const PDF_MAGIC: &[u8; 5] = b"%PDF-";

/// Reject a metadata-declared size before opening the media stream.
///
/// `declared_size` is the imeta `size` field, absent on older attachments. When
/// it is missing the streaming cap inside [`fetch_blob_bytes_with_cap`] is the
/// only guard, which is why this is an early-out and not the enforcement point:
/// the cap is enforced on the bytes either way, and checking the declaration
/// first means an oversized file costs no request at all.
fn ensure_declared_size_previewable(declared_size: Option<u64>) -> Result<(), String> {
    match declared_size {
        Some(size) if size > MAX_PREVIEW_BYTES => Err(too_large_message()),
        _ => Ok(()),
    }
}

/// The single phrasing of the size refusal, so the pre-fetch check and the
/// streamed-byte cap cannot tell the user two different stories.
fn too_large_message() -> String {
    format!(
        "too large to preview (max {} MiB) — download it instead",
        MAX_PREVIEW_BYTES / (1024 * 1024)
    )
}

/// Verify the fetched bytes are the kind the frontend is about to render.
///
/// Returns the detected MIME on success. `detect_and_validate_mime` has already
/// applied the upload-side allow/deny policy; this narrows that to the one kind
/// the caller asked for.
fn ensure_bytes_match_kind(bytes: &[u8], kind: PreviewKind, mime: &str) -> Result<(), String> {
    match kind {
        PreviewKind::Pdf => {
            if bytes.len() >= PDF_MAGIC.len() && &bytes[..PDF_MAGIC.len()] == PDF_MAGIC {
                Ok(())
            } else {
                Err(
                    "content mismatch: the attachment is labelled a PDF but its bytes are not"
                        .to_string(),
                )
            }
        }
        PreviewKind::Image => {
            if mime.starts_with("image/") {
                Ok(())
            } else {
                Err(format!(
                    "content mismatch: the attachment is labelled an image but its bytes are {mime}"
                ))
            }
        }
    }
}

/// Fetch an attachment into memory for in-app preview.
///
/// Same relay, same predecessor-origin rewrite, same minted media auth, and the
/// same content policy as `download_file`; a lower size cap, and a magic-byte
/// check binding the bytes to the renderer the frontend picked.
///
/// Returns `tauri::ipc::Response` so the blob crosses IPC as a raw buffer
/// rather than a JSON array of numbers.
///
/// Nothing is written to disk on this path.
#[tauri::command]
pub async fn fetch_preview_bytes(
    url: String,
    kind: String,
    declared_size: Option<u64>,
    state: State<'_, AppState>,
) -> Result<tauri::ipc::Response, String> {
    let kind = PreviewKind::parse(&kind)?;
    ensure_declared_size_previewable(declared_size)?;

    let relay_base = relay_api_base_url_with_override(&state);
    let url = resolve_download_url(&url, &relay_base)?;

    let bytes = fetch_blob_bytes_with_cap(&url, &state, MAX_PREVIEW_BYTES, None).await?;
    let mime = detect_and_validate_mime(&bytes)?;
    ensure_bytes_match_kind(&bytes, kind, &mime)?;

    Ok(tauri::ipc::Response::new(bytes))
}

/// Mark the temporary copy as having come from somewhere else, best effort.
///
/// The `safe` tier says these formats are displayed rather than run. That is
/// only true because the OS hardens files whose provenance is untrusted, and
/// the hardening is keyed to a mark the *downloader* is expected to apply:
///
/// - **Windows:** a `Zone.Identifier` alternate data stream with `ZoneId=3`
///   (URLZONE_INTERNET). Office's Protected View and its "macros blocked from
///   an untrusted source" rule both test for it, so a `.doc` written without
///   one opens with macros live. Written with `std::fs::write` to
///   `<path>:Zone.Identifier`, which is how an ADS is created.
/// - **macOS:** the `com.apple.quarantine` extended attribute, which is what
///   makes LaunchServices ask before opening and what Office reads for its own
///   Protected View.
///
/// Best effort on purpose: failing to mark a file is a reduction in the OS's
/// defences, not a hole in ours, and refusing the open the user asked for
/// because an xattr would not set would be the wrong trade. The policy tiers do
/// not depend on it. It is logged rather than ignored.
///
/// Only the macOS branch has been exercised on this machine; the Windows branch
/// is written from the documented ADS format and has not been run.
fn mark_as_quarantined(path: &std::path::Path) {
    #[cfg(target_os = "windows")]
    {
        // ReferrerUrl/HostUrl are deliberately omitted: the attachment's relay
        // URL is not something to write into a file the user may share on.
        let stream = format!("{}:Zone.Identifier", path.display());
        if let Err(error) = std::fs::write(&stream, b"[ZoneTransfer]\r\nZoneId=3\r\n") {
            eprintln!(
                "buzz-desktop: could not mark {} as downloaded: {error}",
                path.display()
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::os::unix::ffi::OsStrExt;

        // Fields are flags;timestamp;agent;UUID. 0081 is "quarantined, kind
        // other" — the value a download gets before anything has approved it.
        let value = b"0081;00000000;Buzz;\0";
        let c_path = match std::ffi::CString::new(path.as_os_str().as_bytes()) {
            Ok(c_path) => c_path,
            Err(error) => {
                eprintln!("buzz-desktop: path is not representable for xattr: {error}");
                return;
            }
        };
        let name = c"com.apple.quarantine";
        // SAFETY: both pointers are valid NUL-terminated C strings living for
        // the call, and the value length matches the buffer passed.
        let result = unsafe {
            libc::setxattr(
                c_path.as_ptr(),
                name.as_ptr(),
                value.as_ptr().cast(),
                value.len(),
                0,
                0,
            )
        };
        if result != 0 {
            eprintln!(
                "buzz-desktop: could not quarantine {}: {}",
                path.display(),
                std::io::Error::last_os_error(),
            );
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux has no equivalent the desktop handlers agree on.
        let _ = path;
    }
}

/// Write the bytes into a per-open temporary directory and hand the path over.
///
/// Takes an [`ApprovedOpenName`] and nothing else. That type's contents are
/// private to [`crate::external_open_policy`], so this module cannot mint its
/// own permission — it has to be handed one, and the only way to get one is
/// through the policy. Skipping the gate here does not quietly pass the tests;
/// it does not compile.
///
/// The file is marked as downloaded-from-elsewhere before it is opened, and the
/// directory's whole lifetime — read-only copy, removal at exit, sweeping a
/// crash's leftovers — belongs to [`super::external_open_temp`].
fn write_and_open(
    app: &tauri::AppHandle,
    name: &ApprovedOpenName,
    bytes: &[u8],
) -> Result<(), String> {
    let dir = create_external_open_dir()?;
    let path = write_external_open_file(&dir, name.as_str(), bytes)?;
    // Order is load-bearing: both marks need write access to the file, and
    // sealing it removes that. Mark first, seal last, open only after.
    mark_as_quarantined(&path);
    seal_external_open_file(&path)?;

    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("could not open the file: {e}"))
}

/// Fetch an attachment and hand it to the OS default application.
///
/// The fallback for a type the app cannot render. This is the one preview-side
/// path that writes to disk, and it is explicit in the UI: the user asked for
/// another application to open the file, which can only be done through a file.
///
/// A gate the download path does not need, because a download ends at a
/// location the user chose and this ends at the operating system acting on a
/// stranger's file: [`ApprovedOpenName::approve`] on the exact name being
/// written. An extension whose handler executes the file is refused outright;
/// one we do not recognise requires `user_confirmed`.
/// `detect_and_validate_mime` cannot answer this, since a script's bytes are
/// the bytes of a text file.
///
/// `user_confirmed` is the frontend's attestation that it showed the
/// confirmation dialog for an unrecognised type. It cannot prove the user
/// clicked, but it does mean a future caller has to decide deliberately rather
/// than inherit a silent open. It is not a way past the refused tier.
#[tauri::command]
pub async fn open_file_in_default_app(
    url: String,
    filename: String,
    user_confirmed: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Decided on the written name, and before any request: a file we will not
    // open is not worth fetching. `write_and_open` takes nothing else, so this
    // step cannot be skipped without failing to compile.
    let approved = ApprovedOpenName::approve(&filename, user_confirmed)?;

    let relay_base = relay_api_base_url_with_override(&state);
    let url = resolve_download_url(&url, &relay_base)?;

    // The download cap, not the preview cap: this is a download in everything
    // but the destination, and no renderer holds a second copy.
    let bytes = fetch_blob_bytes_with_cap(&url, &state, MAX_DOWNLOAD_BYTES, None).await?;
    detect_and_validate_mime(&bytes)?;

    write_and_open(&app, &approved, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_kind_parses_only_the_two_renderable_kinds() {
        assert_eq!(PreviewKind::parse("pdf"), Ok(PreviewKind::Pdf));
        assert_eq!(PreviewKind::parse("image"), Ok(PreviewKind::Image));
        // "none" is the frontend's own classification for an unpreviewable
        // attachment; it must never reach a fetch.
        assert!(PreviewKind::parse("none").is_err());
        assert!(PreviewKind::parse("PDF").is_err());
        assert!(PreviewKind::parse("").is_err());
    }

    #[test]
    fn declared_size_over_the_preview_cap_is_refused_before_any_request() {
        assert!(ensure_declared_size_previewable(Some(MAX_PREVIEW_BYTES)).is_ok());
        let error = ensure_declared_size_previewable(Some(MAX_PREVIEW_BYTES + 1)).unwrap_err();
        assert!(
            error.contains("25 MiB") && error.contains("download"),
            "the refusal must name the limit and point at the fallback, got: {error}",
        );
    }

    #[test]
    fn a_missing_declared_size_is_not_a_refusal() {
        // Older attachments carry no imeta `size`. Those must still be
        // previewable; the streamed-byte cap is what actually bounds them.
        assert!(ensure_declared_size_previewable(None).is_ok());
    }

    #[test]
    fn pdf_bytes_satisfy_the_pdf_kind() {
        let bytes = b"%PDF-1.7\n1 0 obj\n";
        assert!(ensure_bytes_match_kind(bytes, PreviewKind::Pdf, "application/pdf").is_ok());
    }

    #[test]
    fn non_pdf_bytes_under_a_pdf_label_are_refused() {
        // The imeta MIME and filename are sender-supplied, so this is the case
        // that keeps arbitrary bytes out of the rasteriser.
        let error = ensure_bytes_match_kind(b"GIF89a", PreviewKind::Pdf, "image/gif").unwrap_err();
        assert!(error.contains("labelled a PDF"), "got: {error}");
    }

    #[test]
    fn a_pdf_header_that_is_only_a_prefix_is_refused() {
        // Truncated to fewer bytes than the magic itself: the length check must
        // come before the slice, not panic on it.
        assert!(ensure_bytes_match_kind(b"%PD", PreviewKind::Pdf, "application/pdf").is_err());
        assert!(ensure_bytes_match_kind(b"", PreviewKind::Pdf, "application/pdf").is_err());
    }

    #[test]
    fn a_pdf_header_must_be_at_the_start() {
        assert!(
            ensure_bytes_match_kind(b"\x00\x00%PDF-1.7", PreviewKind::Pdf, "application/pdf")
                .is_err()
        );
    }

    #[test]
    fn image_kind_follows_the_sniffed_mime_not_the_label() {
        assert!(ensure_bytes_match_kind(b"", PreviewKind::Image, "image/png").is_ok());
        let error = ensure_bytes_match_kind(b"%PDF-1.7", PreviewKind::Image, "application/pdf")
            .unwrap_err();
        assert!(error.contains("application/pdf"), "got: {error}");
    }

    /// The provenance mark actually lands on the file.
    ///
    /// Asserted rather than assumed because the whole justification for the
    /// `safe` tier leans on it: Protected View and Gatekeeper are keyed to this
    /// attribute, and a `setxattr` that silently failed would leave a
    /// stranger's `.doc` opening with its macros live. Only the macOS branch
    /// can be exercised here; the Windows `Zone.Identifier` stream is written
    /// from the documented format and is untested.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_temporary_copy_is_marked_as_quarantined() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("minutes.docx");
        std::fs::write(&path, b"PK\x03\x04").expect("write");

        mark_as_quarantined(&path);

        use std::os::unix::ffi::OsStrExt;
        let c_path = std::ffi::CString::new(path.as_os_str().as_bytes()).expect("path");
        let mut buffer = [0u8; 256];
        // SAFETY: a valid NUL-terminated path and name, and a buffer whose
        // length is passed alongside its pointer.
        let length = unsafe {
            libc::getxattr(
                c_path.as_ptr(),
                c"com.apple.quarantine".as_ptr(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
                0,
                0,
            )
        };
        assert!(
            length > 0,
            "com.apple.quarantine was not set: {}",
            std::io::Error::last_os_error(),
        );
        let value = String::from_utf8_lossy(&buffer[..length as usize]);
        assert!(
            value.starts_with("0081;"),
            "expected a quarantined-kind-other flag, got {value:?}",
        );
    }

    #[test]
    fn an_approved_name_is_the_one_that_gets_written() {
        // The path this command joins is `approved.as_str()` and nothing else,
        // so what the policy decided about is what lands on disk. The name
        // derivation and its edge cases live with the policy; this is the one
        // assertion that belongs here.
        let approved = ApprovedOpenName::approve("../../minutes 2026-10.docx", false)
            .expect("a docx needs no confirmation");
        assert_eq!(approved.as_str(), "minutes 2026-10.docx");
        assert_eq!(
            std::path::Path::new(approved.as_str()).components().count(),
            1,
            "an approved name must be a single path component",
        );
    }
}
