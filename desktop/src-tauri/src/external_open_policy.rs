//! Which attachments may be handed to the OS default application.
//!
//! "Open in default app" is the preview surface's escape hatch for a type the
//! app cannot render, and it is the one place where a file a stranger named and
//! filled lands on disk and is then passed to the operating system to act on.
//! On Windows that act is execution for a long tail of extensions; `.bat`,
//! `.cmd`, `.vbs`, `.hta` and friends are plain text, so the sniffed MIME says
//! `application/octet-stream` and the upload deny-list — which is written in
//! MIME terms — waves every one of them through.
//!
//! So the decision is made on the extension, in three tiers:
//!
//! - [`ExternalOpenPolicy::Allowed`] — a format whose handler displays a
//!   document. Opens with no further ceremony.
//! - [`ExternalOpenPolicy::NeedsConfirmation`] — anything we do not recognise,
//!   including a name with no extension at all. The user is told what is about
//!   to happen and has to say yes.
//! - [`ExternalOpenPolicy::Refused`] — a format whose handler runs the file.
//!   Never handed out, confirmed or not. Download still works: choosing a
//!   location for a file is a different act from asking the OS to run it.
//!
//! The table lives in `desktop/external-open-policy.json` and is shared with
//! the frontend (`shared/lib/externalOpenPolicy.ts`), which needs the same
//! answer to decide whether to hide the button, ask first, or just open. One
//! file rather than one list per language, for the same reason
//! [`crate::legacy_media_origins`] has one: when those two halves drifted, the
//! frontend knew something the backend did not and the mismatch was silent.
//!
//! This is a gate on top of the content policy, not a replacement for it.
//! `detect_and_validate_mime` still runs; this answers the question that policy
//! cannot, because the bytes of a script look like the bytes of a note.

use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

use crate::commands::media_filename::sanitize_filename;

/// The shared table, embedded at compile time.
///
/// `include_str!` rather than a runtime read, like the relay-migration table,
/// so a *missing* file fails the build rather than silently disabling the gate
/// in a shipped app.
///
/// Note what that does and does not cover: malformed JSON, or an extension
/// listed in both tiers, compiles fine and panics the first time this table is
/// touched — not at startup. What actually catches those before a release is
/// the test below, which forces initialisation, plus the same assertion in
/// `externalOpenPolicy.test.mjs`. A panic here is the backstop, not the gate.
const EXTERNAL_OPEN_POLICY_JSON: &str = include_str!("../../external-open-policy.json");

/// One tier of the table: named groups of extensions, plus a `comment` field
/// that documents the tier and is not an extension group.
#[derive(serde::Deserialize)]
struct PolicyTier {
    #[serde(flatten)]
    groups: BTreeMap<String, serde_json::Value>,
}

#[derive(serde::Deserialize)]
struct PolicyFile {
    safe: PolicyTier,
    executable: PolicyTier,
}

impl PolicyTier {
    /// Flatten every string-array group in the tier into one set.
    ///
    /// Ignores non-array values so the `comment` string inside each tier stays
    /// documentation rather than becoming an extension. Lowercased on the way
    /// in; the lookup side lowercases too, so a stray uppercase entry in the
    /// JSON cannot create an extension that never matches.
    fn extensions(&self) -> HashSet<String> {
        self.groups
            .values()
            .filter_map(|value| value.as_array())
            .flatten()
            .filter_map(|value| value.as_str())
            .map(|extension| extension.to_ascii_lowercase())
            .collect()
    }
}

struct ExtensionTables {
    safe: HashSet<String>,
    executable: HashSet<String>,
}

static TABLES: LazyLock<ExtensionTables> = LazyLock::new(|| {
    let parsed: PolicyFile = serde_json::from_str(EXTERNAL_OPEN_POLICY_JSON)
        .expect("external-open-policy.json is malformed");
    let safe = parsed.safe.extensions();
    let executable = parsed.executable.extensions();
    // An extension in both tiers would resolve by evaluation order rather than
    // by intent, and the safe reading is the dangerous one to get wrong.
    // Refusing to start is better than shipping a `.js` that opens silently.
    if let Some(both) = safe.intersection(&executable).next() {
        panic!("external-open-policy.json lists {both:?} as both safe and executable");
    }
    ExtensionTables { safe, executable }
});

/// What may be done with an attachment of a given name.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExternalOpenPolicy {
    /// Hand it to the OS.
    Allowed,
    /// Hand it to the OS only after the user has explicitly confirmed.
    NeedsConfirmation,
    /// Never hand it to the OS.
    Refused,
}

/// The extension one filename component will be dispatched on, lowercased.
///
/// Not simply "text after the last dot". Two differences, each of which is a
/// way to make a dangerous name look harmless:
///
/// - **Trailing dots and spaces are stripped first.** Win32 removes them when
///   it creates a file, so `evil.exe.` is written as `evil.exe` and run as one,
///   while a naive parse sees an empty extension.
/// - **Only the final extension counts.** `invoice.pdf.exe` is an executable;
///   the OS reads the last extension and so must we.
///
/// Returns `""` for a component with no usable extension — including a dotfile
/// like `.bashrc`, where the leading dot starts the name rather than an
/// extension. That is [`ExternalOpenPolicy::NeedsConfirmation`], not allowed.
fn component_extension(component: &str) -> String {
    let base = component.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    let Some(dot) = base.rfind('.') else {
        return String::new();
    };
    if dot == 0 || dot == base.len() - 1 {
        return String::new();
    }
    base[dot + 1..].to_ascii_lowercase()
}

fn classify_component(component: &str) -> ExternalOpenPolicy {
    let extension = component_extension(component);
    if extension.is_empty() {
        return ExternalOpenPolicy::NeedsConfirmation;
    }
    if TABLES.executable.contains(&extension) {
        return ExternalOpenPolicy::Refused;
    }
    if TABLES.safe.contains(&extension) {
        return ExternalOpenPolicy::Allowed;
    }
    ExternalOpenPolicy::NeedsConfirmation
}

/// The name an attachment will actually be written under.
///
/// [`sanitize_filename`] strips directory components, trims, removes control
/// characters and bounds the length to 255 — enough for a save dialog, which
/// only treats its result as a suggestion. Here the name is joined onto a real
/// path and then handed to the operating system, so three things it leaves
/// intact have to go as well:
///
/// - `.` and `..`, which survive it because they contain no separator.
///   `dir.join("..")` is the parent directory, not a file inside it.
/// - Trailing dots and whitespace, which Win32 removes when it creates the
///   file: `evil.exe.` would be written as `evil.exe`, so a classification of
///   the untrimmed name would not describe the file on disk.
/// - `:` and the other characters Windows reserves. A colon addresses an
///   alternate data stream, which is a second way to write to a different file
///   than the name appears to describe.
///
/// Trailing dots and whitespace are trimmed in one pass, not dots-then-spaces:
/// `evil.exe\u{a0}.` must not leave a non-breaking space exposed as the new
/// last character, or this function is not idempotent and "the name we classify
/// is the name we write" stops being true of its own output.
pub fn written_name(filename: &str) -> String {
    let sanitized = sanitize_filename(filename);
    let neutralized: String = sanitized
        .chars()
        .map(|c| {
            if matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = neutralized.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed.to_string()
    }
}

/// A filename this policy has cleared for an external open.
///
/// The gate is a type rather than a call because a call can be deleted or
/// worked around. Its contents are private to this module and
/// [`ApprovedOpenName::approve`] is the only thing that builds one, so the code
/// that writes the temporary file and hands it to the OS cannot construct its
/// own permission — it has to be given one. Skipping the check is a compile
/// error there, not a silent behaviour change that passes its tests.
///
/// It carries the written name as well as the permission, and derives that name
/// itself. Taking the raw filename and returning the sanitized one is what
/// makes "the string we classified is the string we wrote" structural: there is
/// no second name for a caller to write instead.
#[derive(Debug)]
pub struct ApprovedOpenName(String);

impl ApprovedOpenName {
    /// Decide whether this file may be handed to the operating system.
    ///
    /// Takes the sender's raw `filename` and sanitizes it internally, so the
    /// decision and the name on disk cannot describe different files.
    ///
    /// `user_confirmed` says the caller showed the confirmation dialog; it
    /// clears the [`ExternalOpenPolicy::NeedsConfirmation`] tier and nothing
    /// else, because a dialog is a thing people click through.
    ///
    /// A refusal is not a failure the user has to work around — Download is on
    /// the same card and in the same dialog — so the message points at it.
    pub fn approve(filename: &str, user_confirmed: bool) -> Result<Self, String> {
        let name = written_name(filename);
        match classify_component(&name) {
            ExternalOpenPolicy::Refused => Err(format!(
                "Buzz will not open \"{name}\" in another application: files of this type \
                 are run rather than displayed, and nothing about the name shows what this one \
                 would do. Download it if you trust the sender."
            )),
            ExternalOpenPolicy::NeedsConfirmation if !user_confirmed => Err(format!(
                "Buzz did not ask before opening \"{name}\" in another application. This \
                 file type is not one it recognises, so it needs confirmation first."
            )),
            ExternalOpenPolicy::NeedsConfirmation | ExternalOpenPolicy::Allowed => Ok(Self(name)),
        }
    }

    /// The approved name, for joining onto the directory it will be written in.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// How a raw filename would be classified, without approving it.
///
/// For the tests and for nothing else: production code goes through
/// [`ApprovedOpenName::approve`], which cannot be asked for a verdict without
/// also producing the name that verdict is about.
#[cfg(test)]
fn classify_external_open(filename: &str) -> ExternalOpenPolicy {
    classify_component(&written_name(filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shared_table_parses_and_both_tiers_are_populated() {
        // A tier that silently deserialized to nothing would make every file
        // either confirmable or openable, which is the whole failure this
        // module exists to prevent.
        assert!(TABLES.safe.len() > 20, "safe tier: {}", TABLES.safe.len());
        assert!(
            TABLES.executable.len() > 40,
            "executable tier: {}",
            TABLES.executable.len(),
        );
    }

    #[test]
    fn the_per_tier_comment_is_not_read_as_an_extension() {
        assert!(!TABLES.safe.contains("comment"));
        assert!(!TABLES.executable.contains("comment"));
    }

    #[test]
    fn documents_images_and_media_open_without_asking() {
        for name in [
            "minutes.docx",
            "report.pdf",
            "budget.xlsx",
            "deck.pptx",
            "notes.txt",
            "readme.md",
            "scan.png",
            "clip.mp4",
            "voice.m4a",
        ] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::Allowed,
                "{name} should open directly",
            );
        }
    }

    #[test]
    fn formats_whose_handler_is_not_merely_a_viewer_stay_out_of_the_safe_tier() {
        // Each of these was in the first draft of the safe list and is not a
        // document in the sense the tier claims: a spreadsheet treats a leading
        // `=` as a formula, a template runs its AutoOpen macro, an ASF
        // container can carry a URL-launch command, and an epub is rendered by
        // a browser. They are things to ask about, not to refuse — so the
        // assertion is "not Allowed", not "Refused".
        for name in [
            "rows.csv",
            "rows.tsv",
            "letterhead.dot",
            "model.xlt",
            "theme.pot",
            "clip.wmv",
            "track.wma",
            "book.epub",
        ] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::NeedsConfirmation,
                "{name} must not open without being asked about",
            );
        }
    }

    #[test]
    fn the_script_types_from_the_review_are_refused() {
        // Every one of these passes `detect_and_validate_mime`: a script is
        // text, so `infer` returns no type and the MIME deny-list never sees
        // anything it blocks.
        for name in [
            "setup.bat",
            "setup.cmd",
            "payload.vbs",
            "payload.js",
            "page.hta",
            "open me.terminal",
            "autostart.desktop",
            "tool.jar",
        ] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::Refused,
                "{name} must never be handed to the OS",
            );
        }
    }

    #[test]
    fn an_unknown_or_missing_extension_asks_first() {
        for name in [
            "drawings.zip",
            "backup.tar.gz",
            "firmware.bin",
            "README",
            "logo.svg",
            ".gitignore",
        ] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::NeedsConfirmation,
                "{name} should require confirmation",
            );
        }
    }

    #[test]
    fn only_the_final_extension_decides() {
        assert_eq!(
            classify_external_open("invoice.pdf.exe"),
            ExternalOpenPolicy::Refused,
        );
        // And the mirror image: the OS dispatches on `.pdf` here, so refusing
        // it would be a false positive that costs a working feature.
        assert_eq!(
            classify_external_open("invoice.exe.pdf"),
            ExternalOpenPolicy::Allowed,
        );
    }

    #[test]
    fn a_trailing_dot_cannot_hide_an_executable() {
        // Win32 strips trailing dots and spaces when creating the file, so all
        // three of these are written as `evil.exe` and run as one.
        for name in ["evil.exe.", "evil.exe..", "evil.exe. "] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::Refused,
                "{name:?} resolves to evil.exe on disk",
            );
        }
    }

    #[test]
    fn an_alternate_data_stream_name_is_judged_as_the_file_it_becomes() {
        // Neutralizing the colon is the control, not a second classification
        // pass: once it is an underscore there is one unambiguous extension,
        // and it is the end of the name either way.
        assert_eq!(written_name("notes.txt:evil.exe"), "notes.txt_evil.exe");
        assert_eq!(
            classify_external_open("notes.txt:evil.exe"),
            ExternalOpenPolicy::Refused,
        );
        // The mirror image is genuinely a text file after neutralization, so
        // refusing it would cost a working action for no gain.
        assert_eq!(written_name("evil.bat:notes.txt"), "evil.bat_notes.txt");
        assert_eq!(
            classify_external_open("evil.bat:notes.txt"),
            ExternalOpenPolicy::Allowed,
        );
    }

    #[test]
    fn classification_is_case_insensitive() {
        assert_eq!(
            classify_external_open("SETUP.BAT"),
            ExternalOpenPolicy::Refused,
        );
        assert_eq!(
            classify_external_open("Report.PDF"),
            ExternalOpenPolicy::Allowed,
        );
    }

    #[test]
    fn svg_is_deliberately_neither_safe_nor_refused() {
        // Its handler is a browser: the script is sandboxed, but the
        // document's outbound requests are not. That is a thing to be asked
        // about, not one to decide silently in either direction.
        assert_eq!(
            classify_external_open("diagram.svg"),
            ExternalOpenPolicy::NeedsConfirmation,
        );
    }

    #[test]
    fn classification_ignores_directory_components() {
        // A directory named like a document must not vote on the file in it.
        assert_eq!(
            classify_external_open("/tmp/report.pdf/setup.exe"),
            ExternalOpenPolicy::Refused,
        );
        assert_eq!(
            classify_external_open(r"C:\report.pdf\setup.exe"),
            ExternalOpenPolicy::Refused,
        );
    }

    #[test]
    fn a_dotfile_has_no_extension() {
        // `.bashrc` is not a "bashrc file"; a leading dot starts the name.
        assert_eq!(component_extension(".bashrc"), "");
        assert_eq!(component_extension(".bashrc.sh"), "sh");
    }

    #[test]
    fn a_written_name_cannot_climb_out_of_its_directory() {
        assert_eq!(written_name(".."), "file");
        assert_eq!(written_name("."), "file");
        assert_eq!(written_name("../../etc/passwd"), "passwd");
        assert_eq!(written_name("report.pdf"), "report.pdf");
        assert_eq!(written_name(""), "file");
    }

    #[test]
    fn a_written_name_strips_what_windows_would_strip_itself() {
        assert_eq!(written_name("evil.exe."), "evil.exe");
        assert_eq!(written_name("evil.exe. "), "evil.exe");
        assert_eq!(written_name("report.pdf..."), "report.pdf");
    }

    #[test]
    fn a_written_name_neutralizes_an_alternate_data_stream() {
        // A colon would write to a stream of `notes.txt` rather than to the
        // file the name describes. With it replaced, the classification below
        // reads one unambiguous extension.
        assert_eq!(written_name("notes.txt:evil.exe"), "notes.txt_evil.exe");
        assert_eq!(written_name(r#"we"ird<name>.pdf"#), "we_ird_name_.pdf");
    }

    #[test]
    fn a_written_name_is_a_fixed_point() {
        // The gate's correctness rests on this: the name the policy judged is
        // the name on disk. If sanitizing the output changed it again, the two
        // would describe different files. The non-breaking-space cases are the
        // ones that caught a dots-then-spaces trim: `trim` removes U+00A0 but
        // only when it is already last, so trimming dots first could expose
        // one.
        for name in [
            "..",
            ".",
            "",
            "/",
            "evil.exe.",
            "evil.exe\u{a0}.",
            "evil.exe .\u{a0}. ",
            "notes.txt:evil.exe",
            "../../setup.bat",
            "invoice.pdf.exe",
            r"..\..\windows\system32\drivers\etc\hosts",
            "minutes 2026-10.docx",
            &"a".repeat(300),
            &format!("{}.exe.pdf", "a".repeat(251)),
        ] {
            let written = written_name(name);
            assert_eq!(
                written_name(&written),
                written,
                "{name:?} wrote as {written:?}, which is not already final",
            );
            let path = std::path::Path::new(&written);
            assert_eq!(
                path.components().count(),
                1,
                "{name:?} wrote as {written:?}, which is not a single component",
            );
            assert!(path.file_name().is_some(), "{written:?} has no file name");
        }
    }

    #[test]
    fn truncation_cannot_turn_a_document_into_an_executable_unnoticed() {
        // `sanitize_filename` bounds the name to 255 characters, so a long
        // enough name loses its real extension and exposes an earlier one.
        // The classification has to follow the truncated name, which it does
        // because `approve` derives that name itself.
        let deceptive = format!("{}.exe.pdf", "a".repeat(251));
        assert!(
            written_name(&deceptive).ends_with(".exe"),
            "truncation should expose the .exe: {:?}",
            written_name(&deceptive),
        );
        assert_eq!(
            classify_external_open(&deceptive),
            ExternalOpenPolicy::Refused,
        );
        assert!(ApprovedOpenName::approve(&deceptive, true).is_err());
    }

    #[test]
    fn a_control_character_cannot_hide_an_extension() {
        // `sanitize_filename` removes control characters, so `setup.exe\u{1}`
        // is written as `setup.exe`. Classifying the raw name would see an
        // unknown extension and merely ask.
        assert_eq!(written_name("setup.exe\u{1}"), "setup.exe");
        assert_eq!(
            classify_external_open("setup.exe\u{1}"),
            ExternalOpenPolicy::Refused,
        );
    }

    #[test]
    fn approve_returns_the_name_it_judged() {
        let approved = ApprovedOpenName::approve("../../minutes 2026-10.docx", false)
            .expect("a docx needs no confirmation");
        assert_eq!(approved.as_str(), "minutes 2026-10.docx");
        assert_eq!(
            classify_external_open(approved.as_str()),
            ExternalOpenPolicy::Allowed,
        );
    }

    #[test]
    fn the_shared_cases_agree_with_this_implementation() {
        // `desktop/external-open-test-cases.json` is run by this suite and by
        // `externalOpenPolicy.test.mjs`, each through its own implementation.
        // Two hand-written suites asserting their own expectations is how the
        // frontend and the backend drifted before; this is the one test that
        // compares them on the same inputs.
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Case {
            filename: String,
            written_as: String,
            verdict: String,
            why: String,
        }
        #[derive(serde::Deserialize)]
        struct CaseFile {
            cases: Vec<Case>,
        }

        let raw = include_str!("../../external-open-test-cases.json");
        let parsed: CaseFile =
            serde_json::from_str(raw).expect("external-open-test-cases.json is malformed");
        assert!(parsed.cases.len() >= 20, "{} cases", parsed.cases.len());

        for case in parsed.cases {
            let written = written_name(&case.filename);
            assert_eq!(
                written, case.written_as,
                "{:?} ({}): written name",
                case.filename, case.why,
            );
            let verdict = match classify_external_open(&case.filename) {
                ExternalOpenPolicy::Allowed => "allowed",
                ExternalOpenPolicy::NeedsConfirmation => "needsConfirmation",
                ExternalOpenPolicy::Refused => "refused",
            };
            assert_eq!(
                verdict, case.verdict,
                "{:?} ({}): verdict",
                case.filename, case.why,
            );
        }
    }

    #[test]
    fn a_safe_type_is_approved_without_confirmation() {
        for name in ["minutes.docx", "report.pdf", "scan.png", "clip.mp4"] {
            let approved = ApprovedOpenName::approve(name, false)
                .unwrap_or_else(|error| panic!("{name} should need no confirmation: {error}"));
            assert_eq!(approved.as_str(), name);
        }
    }

    #[test]
    fn an_unrecognised_type_is_approved_only_once_confirmed() {
        let error = ApprovedOpenName::approve("drawings.zip", false)
            .expect_err("an unknown type must not open unasked");
        assert!(
            error.contains("confirmation"),
            "the refusal must name what is missing, got: {error}",
        );
        assert!(ApprovedOpenName::approve("drawings.zip", true).is_ok());
    }

    #[test]
    fn a_script_is_refused_even_after_a_confirmation() {
        // The confirmation is for types we cannot classify, not a way past the
        // ones we can. A dialog is a thing people click through.
        for name in [
            "setup.bat",
            "setup.cmd",
            "payload.vbs",
            "payload.js",
            "page.hta",
            "open me.terminal",
            "autostart.desktop",
            "tool.jar",
        ] {
            let error =
                ApprovedOpenName::approve(name, true).expect_err("a script must never be approved");
            assert!(
                error.contains("will not open") && error.contains("Download"),
                "{name}: the refusal must be flat and point at the fallback, got: {error}",
            );
        }
    }
}
