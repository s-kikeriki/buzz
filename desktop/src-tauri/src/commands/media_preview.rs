//! In-app preview of a relay `/media/` attachment.
//!
//! Two commands sit beside the download path in [`super::media_download`] and
//! deliberately reuse its gate rather than growing a second one:
//!
//! - [`fetch_preview_bytes`] returns the bytes in memory so the frontend can
//!   render them. Nothing touches the disk.
//! - [`open_file_in_default_app`] is the escape hatch for a type we cannot
//!   render. It is the only path here that writes a file, and it writes it to a
//!   fresh temporary directory, never to a user-visible location.
//!
//! Both go through [`resolve_download_url`] — the same predecessor-origin
//! rewrite and the same SSRF gate as `download_file` — and both fetch what that
//! function returned rather than the URL they were handed.

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::app_state::AppState;
use crate::commands::media::detect_and_validate_mime;
use crate::commands::media_download::{
    fetch_blob_bytes_with_cap, resolve_download_url, MAX_DOWNLOAD_BYTES,
};
use crate::commands::media_filename::sanitize_filename;
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

/// A filename safe to join onto a directory we control.
///
/// [`sanitize_filename`] strips path separators, which is all the save dialog
/// needs — the dialog only ever treats the result as a suggestion the user can
/// overwrite. Here the name is joined onto a real path, and `.` and `..` survive
/// that sanitizer intact: `dir.join("..")` is the parent directory, not a file
/// inside `dir`. Collapse those to a neutral name.
fn temp_filename(name: &str) -> String {
    let sanitized = sanitize_filename(name);
    if sanitized == "." || sanitized == ".." {
        "file".to_string()
    } else {
        sanitized
    }
}

/// Fetch an attachment and hand it to the OS default application.
///
/// The fallback for a type the app cannot render. This is the one preview-side
/// path that writes to disk, and it is explicit in the UI: the user asked for
/// another application to open the file, which can only be done through a file.
///
/// The file goes into a freshly created temporary directory — one per open, so
/// two opens of the same filename cannot collide and nothing lands next to the
/// user's own documents. The directory is deliberately leaked rather than
/// deleted on return: the external application is still starting up and needs
/// the file to exist after this command returns. The OS reclaims the temporary
/// directory; we never put a second copy anywhere else.
#[tauri::command]
pub async fn open_file_in_default_app(
    url: String,
    filename: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let relay_base = relay_api_base_url_with_override(&state);
    let url = resolve_download_url(&url, &relay_base)?;

    // The download cap, not the preview cap: this is a download in everything
    // but the destination, and no renderer holds a second copy.
    let bytes = fetch_blob_bytes_with_cap(&url, &state, MAX_DOWNLOAD_BYTES, None).await?;
    detect_and_validate_mime(&bytes)?;

    let dir = tempfile::Builder::new()
        .prefix("buzz-open-")
        .tempdir()
        .map_err(|e| format!("could not create a temporary directory: {e}"))?
        // Keep the directory after this scope: the file must still exist when
        // the external application gets round to reading it.
        .keep();
    let path = dir.join(temp_filename(&filename));
    std::fs::write(&path, &bytes)
        .map_err(|e| format!("could not write the temporary file: {e}"))?;

    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("could not open the file: {e}"))
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

    #[test]
    fn temp_filename_cannot_climb_out_of_its_directory() {
        // `sanitize_filename` leaves these intact because they contain no
        // separator; joined onto a directory they are not files in it.
        assert_eq!(temp_filename(".."), "file");
        assert_eq!(temp_filename("."), "file");
        assert_eq!(temp_filename("../../etc/passwd"), "passwd");
        assert_eq!(temp_filename("report.pdf"), "report.pdf");
        assert_eq!(temp_filename(""), "file");
    }

    #[test]
    fn temp_filename_output_is_always_a_single_component() {
        for name in [
            "..",
            ".",
            "",
            "/",
            "../../etc/passwd",
            r"..\..\windows\system32\drivers\etc\hosts",
            "minutes 2026-10.docx",
        ] {
            let resolved = temp_filename(name);
            let path = std::path::Path::new(&resolved);
            assert_eq!(
                path.components().count(),
                1,
                "{name:?} resolved to {resolved:?}, which is not a single path component",
            );
            assert!(
                path.file_name().is_some(),
                "{name:?} resolved to {resolved:?}, which has no file name",
            );
        }
    }
}
