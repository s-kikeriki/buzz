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

use regex::Regex;

use crate::commands::media_filename::{bound_filename_length, strip_filename_components};

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

/// The non-ASCII characters a Win32 lookup resolves onto an ASCII letter.
///
/// See the `extensionCharacterFolds` comment in the JSON for what is in here
/// and why each entry is. The `comment` field is not deserialized; `folds` is
/// the table.
#[derive(serde::Deserialize)]
struct FoldTable {
    folds: BTreeMap<String, String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PolicyFile {
    safe: PolicyTier,
    executable: PolicyTier,
    extension_character_folds: FoldTable,
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
    folds: Vec<(char, char)>,
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
    let folds = parsed
        .extension_character_folds
        .folds
        .iter()
        .map(|(from, to)| {
            // One character to one character, so a fold cannot change a name's
            // length or depend on being applied in a particular order.
            let pair = (from.chars().next(), to.chars().next());
            match (pair, from.chars().count(), to.chars().count()) {
                ((Some(from), Some(to)), 1, 1) => (from, to),
                _ => panic!("extensionCharacterFolds maps {from:?} to {to:?}, not one char to one"),
            }
        })
        .collect();
    ExtensionTables {
        safe,
        executable,
        folds,
    }
});

/// Resolve an extension or device stem the way a Win32 lookup would.
///
/// ASCII-lowercased — deliberately not Unicode-lowercased, because
/// `externalOpenPolicy.ts` cannot match JavaScript's Unicode lowercasing
/// against Rust's without the two disagreeing — then folded through the shared
/// table, which is where the non-ASCII characters that collapse onto ASCII are
/// handled explicitly rather than by whichever runtime happens to be deciding.
fn folded_for_lookup(text: &str) -> String {
    let mut folded = text.to_ascii_lowercase();
    for (from, to) in &TABLES.folds {
        if folded.contains(*from) {
            folded = folded.replace(*from, &to.to_string());
        }
    }
    folded
}

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
/// The result is [`folded_for_lookup`], not merely lowercased, so `x.pıf` is
/// looked up as `pif`: the characters that a case-insensitive Win32 lookup
/// resolves onto ASCII are resolved here too, instead of leaving an extension
/// that matches no tier and therefore only prompts.
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
    folded_for_lookup(&base[dot + 1..])
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

/// Unicode `General_Category=Format` — the invisible characters.
///
/// Built from the category rather than from a hand-written list of the ones
/// that are known to be abused, so a character added to Unicode later is
/// covered without anybody remembering to add it. `externalOpenPolicy.ts` uses
/// the same `\p{Cf}` against JavaScript's tables; see
/// `format_characters_cover_the_bidi_and_joiner_controls` for what both sides
/// are pinned to.
///
/// The `expect` is on a pattern that is a literal in this file, so it cannot
/// fail for anything a sender controls, and every alternative fails open — a
/// `None` here would mean "strip nothing", which is precisely the gap this
/// closes. Same trade, and same reasoning, as `EXTERNAL_OPEN_POLICY_JSON`.
static FORMAT_CHARACTERS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\p{Cf}").expect(r"\p{Cf} is a valid character class"));

/// Device names Win32 resolves before it ever looks at the filesystem.
///
/// `dir.join("CON")` does not address a file in `dir`; it addresses the
/// console. Writing to it succeeds and discards the bytes, and the subsequent
/// "open" hands the OS a device rather than the document the user asked for.
/// The match is on the stem — Win32 applies these with any extension, so
/// `CON.txt` is the console too.
///
/// The superscript forms are here because Win32's device-name parsing treats
/// `COM¹` as `COM1`; the `$` names are the remaining DOS-era devices, of which
/// `CLOCK$` is the one that predates the others' naming convention.
const RESERVED_DEVICE_NAMES: [&str; 31] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "com¹", "com²", "com³", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8",
    "lpt9", "lpt¹", "lpt²", "lpt³", "conin$", "conout$", "clock$",
];

/// Whether this name's stem is one of [`RESERVED_DEVICE_NAMES`].
///
/// The stem is everything before the *first* dot, which is the part Win32
/// resolves, and it is trimmed before comparison because Win32 ignores trailing
/// spaces in a device name — `"CON .txt"` is the console as surely as
/// `"CON.txt"`.
///
/// Compared through [`folded_for_lookup`] for the same reason the extension is:
/// if a Win32 lookup resolves `CONıN$` to the console, so must this.
fn is_reserved_device_name(name: &str) -> bool {
    let stem = folded_for_lookup(name.split('.').next().unwrap_or(name).trim());
    RESERVED_DEVICE_NAMES.contains(&stem.as_str())
}

/// The name an attachment will actually be written under.
///
/// [`strip_filename_components`] drops directory components, trims and removes
/// control characters — enough for a save dialog, which only treats its result
/// as a suggestion. Here the name is joined onto a real path and then handed to
/// the operating system, so the things it leaves intact have to go as well. In
/// order, because several of them can expose each other:
///
/// 1. **Format characters** (`\p{Cf}`: U+200E/F, U+202A–202E, U+2066–2069, the
///    soft hyphen, …). `is_control` is the `Cc` category alone, so these
///    survive it, and they are invisible twice over. A single U+200E after
///    `.exe` leaves the extension `"exe\u{200e}"`, which matches nothing in the
///    table, so a refusal silently becomes a prompt; and a U+202E renders
///    `invoice\u{202e}fdp.exe` as `invoice exe.pdf` to the person deciding
///    whether to trust it. Stripped **before** the length bound, so padding a
///    name with invisible characters cannot spend the budget.
/// 2. `.` and `..`, which survive sanitization because they contain no
///    separator. `dir.join("..")` is the parent directory, not a file in it.
/// 3. `:` and the other characters Windows reserves. A colon addresses an
///    alternate data stream, which is a second way to write to a different file
///    than the name appears to describe.
/// 4. **Trailing dots and whitespace**, which Win32 removes when it creates the
///    file: `evil.exe.` would be written as `evil.exe`, so a classification of
///    the untrimmed name would not describe the file on disk. Trimmed in one
///    pass, not dots-then-spaces: `evil.exe\u{a0}.` must not leave a
///    non-breaking space exposed as the new last character.
/// 5. **Reserved device names**, prefixed with `_` rather than rejected. The
///    danger is the device, not the type, so `CON.txt` becomes `_CON.txt` and
///    is still classified on `.txt`.
/// 6. **The length bound**, last, because the `_` above is the one step that
///    lengthens a name. [`bound_filename_length`] spends the cut on the stem
///    and keeps the extension, so no name is written under a type the sender
///    did not give it.
///
/// Every step is idempotent on this function's own output, and
/// `a_written_name_is_a_fixed_point` is what holds that: the gate's correctness
/// rests on the name the policy judged being the name on disk, so if sanitizing
/// the output changed it again the two would describe different files.
pub fn written_name(filename: &str) -> String {
    let unformatted = FORMAT_CHARACTERS.replace_all(filename, "");
    let stripped = strip_filename_components(&unformatted);
    let neutralized: String = stripped
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

    let undeviced = if is_reserved_device_name(trimmed) {
        format!("_{trimmed}")
    } else {
        trimmed.to_string()
    };
    // Trimmed once more afterwards: the bound only preserves an extension when
    // the tail plausibly is one, and the fallback cut can leave a trailing dot
    // that step 4 had nothing to trim.
    let bounded = bound_filename_length(&undeviced);
    let final_name = bounded.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    if final_name.is_empty() {
        "file".to_string()
    } else {
        final_name.to_string()
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
            &format!("{}.pdf.exe", "a".repeat(251)),
            // A name over the bound whose tail is too long to be an extension,
            // so the cut lands in the tail and can expose a trailing dot.
            &format!("{}.{}", "a".repeat(251), "b".repeat(40)),
            &format!("{}.{}", "a".repeat(254), "b".repeat(40)),
            // Format characters, including ones placed so that removing them
            // exposes a trailing dot or empties the name entirely.
            "setup.exe\u{200e}",
            "invoice\u{202e}fdp.exe",
            "evil.exe\u{200e}.",
            "\u{202e}\u{200f}\u{2066}",
            &format!("{}report.pdf", "\u{2060}".repeat(300)),
            // Reserved device names: the prefix is the only step that makes a
            // name longer, so the 255 bound has to be re-applied after it. A
            // reserved stem with a 251-character extension is the case that
            // lands on exactly the bound.
            "CON",
            "CON.txt",
            "CON .txt",
            "CONIN$.txt",
            "CLOCK$",
            "COM¹",
            &format!("CON.{}", "a".repeat(251)),
            &format!("NUL.{}", "a".repeat(300)),
            // Folded lookups: the fold decides the tier, never the bytes, so
            // these have to come back out unchanged.
            "shortcut.pıf",
            "CONıN$.txt",
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
    fn truncation_does_not_decide_the_type_the_name_is_written_under() {
        // The name is bounded to 255 characters, and cutting the tail would
        // make that bound choose the file's type: a 259-character
        // `….exe.pdf` loses the `.pdf` and becomes an executable on disk,
        // while `….pdf.exe` loses the `.exe` and becomes a document. The cut
        // is spent on the stem instead, so in both directions the type that
        // survives is the one the sender's name ended with — which is also the
        // one the user was shown.
        let document = format!("{}.exe.pdf", "a".repeat(251));
        let written = written_name(&document);
        assert_eq!(written.chars().count(), 255, "{written:?}");
        assert!(written.ends_with(".pdf"), "{written:?}");
        assert!(!written.contains(".exe"), "{written:?}");
        assert_eq!(
            classify_external_open(&document),
            ExternalOpenPolicy::Allowed
        );
        assert!(ApprovedOpenName::approve(&document, false).is_ok());

        // And the mirror image, which is the half that matters: truncation
        // must not launder an executable into something the gate allows.
        let executable = format!("{}.pdf.exe", "a".repeat(251));
        let written = written_name(&executable);
        assert_eq!(written.chars().count(), 255, "{written:?}");
        assert!(written.ends_with(".exe"), "{written:?}");
        assert_eq!(
            classify_external_open(&executable),
            ExternalOpenPolicy::Refused,
        );
        assert!(ApprovedOpenName::approve(&executable, true).is_err());
    }

    #[test]
    fn a_tail_too_long_to_be_an_extension_does_not_get_the_budget() {
        // The stem is what gets shortened only while the tail really is an
        // extension. A reserved stem with a 251-character tail is the case
        // that proves the fallback still bounds the name — preserving that
        // tail would leave three characters of stem.
        let written = written_name(&format!("CON.{}", "a".repeat(251)));
        assert_eq!(written.chars().count(), 255, "{written:?}");
        assert!(written.starts_with("_CON.aaa"), "{written:?}");
    }

    #[test]
    fn format_characters_cover_the_bidi_and_joiner_controls() {
        // The class is `\p{Cf}`, not a list, so this pins the characters the
        // review named rather than the whole category — those are the ones the
        // frontend must agree about, and `externalOpenPolicy.test.mjs` asserts
        // the same set against JavaScript's tables. A floor on the total
        // catches an implementation that matched `Cc` by mistake (that would be
        // ~65) without failing every time a Unicode update adds a character.
        let named = ['\u{200e}', '\u{200f}', '\u{00ad}', '\u{feff}']
            .into_iter()
            .chain('\u{202a}'..='\u{202e}')
            .chain('\u{2066}'..='\u{2069}');
        for character in named {
            assert!(
                FORMAT_CHARACTERS.is_match(&character.to_string()),
                "U+{:04X} must be treated as a format character",
                character as u32,
            );
        }

        let total = (0..=0x10FFFF)
            .filter_map(char::from_u32)
            .filter(|c| FORMAT_CHARACTERS.is_match(&c.to_string()))
            .count();
        assert!(total >= 170, "only {total} format characters");
    }

    #[test]
    fn an_invisible_character_cannot_downgrade_a_refusal_to_a_prompt() {
        // A single U+200E after the extension leaves `component_extension`
        // looking up "exe\u{200e}", which is in neither tier — so without the
        // strip this is NeedsConfirmation, and one click away from running.
        assert_eq!(written_name("setup.exe\u{200e}"), "setup.exe");
        assert_eq!(
            classify_external_open("setup.exe\u{200e}"),
            ExternalOpenPolicy::Refused,
        );
        // Between the dot and the extension, and inside it, for the same reason.
        assert_eq!(written_name("setup.\u{200b}exe"), "setup.exe");
        assert_eq!(written_name("setup.e\u{2060}xe"), "setup.exe");
        assert_eq!(
            classify_external_open("setup.e\u{2060}xe"),
            ExternalOpenPolicy::Refused,
        );
    }

    #[test]
    fn a_bidi_override_cannot_make_an_executable_read_as_a_document() {
        // U+202E renders the rest right-to-left, so this displays as
        // "invoice exe.pdf" wherever the raw name is shown. The extension was
        // always .exe and the verdict was always Refused; what the strip fixes
        // is the name the *dialog* shows for the tier that does ask.
        assert_eq!(written_name("invoice\u{202e}fdp.exe"), "invoicefdp.exe");
        assert_eq!(
            classify_external_open("invoice\u{202e}fdp.exe"),
            ExternalOpenPolicy::Refused,
        );
        // And the confirmation tier, where a spoofed name is what the user reads
        // before deciding.
        assert_eq!(written_name("drawings\u{202e}piz.zip"), "drawingspiz.zip");
        assert_eq!(
            classify_external_open("drawings\u{202e}piz.zip"),
            ExternalOpenPolicy::NeedsConfirmation,
        );
    }

    #[test]
    fn invisible_padding_cannot_push_an_extension_past_the_length_bound() {
        // Stripping after the 255-character bound would let 250 joiners eat the
        // budget and truncate the real extension away. Stripping first means
        // the bound only ever spends itself on characters that are really there.
        let padded = format!("{}report.pdf", "\u{2060}".repeat(300));
        assert_eq!(written_name(&padded), "report.pdf");
        assert_eq!(classify_external_open(&padded), ExternalOpenPolicy::Allowed,);
    }

    #[test]
    fn a_reserved_device_name_is_not_handed_to_the_os_as_a_device() {
        // `dir.join("CON")` is the console, not a file in `dir`: the write
        // succeeds, the bytes are discarded, and the open hands over a device.
        for (name, expected) in [
            ("CON", "_CON"),
            ("con", "_con"),
            ("CON.txt", "_CON.txt"),
            ("nul.pdf", "_nul.pdf"),
            ("COM1.docx", "_COM1.docx"),
            ("LPT9", "_LPT9"),
            ("prn", "_prn"),
            ("aux.png", "_aux.png"),
            // Win32 ignores trailing spaces in a device name, so the stem is
            // trimmed before it is compared.
            ("CON .txt", "_CON .txt"),
            // Win32's device parsing reads the superscript digits as digits,
            // and these three are DOS-era devices that do not follow the
            // COMn/LPTn shape at all.
            ("COM¹.txt", "_COM¹.txt"),
            ("lpt³.pdf", "_lpt³.pdf"),
            ("CONIN$.txt", "_CONIN$.txt"),
            ("conout$.log", "_conout$.log"),
            ("CLOCK$.txt", "_CLOCK$.txt"),
            // And through the fold, because a lookup that resolves `CONıN$`
            // to the console makes the dotless i a way around the list.
            ("CONıN$.txt", "_CONıN$.txt"),
        ] {
            assert_eq!(written_name(name), expected, "{name} must be neutralized");
        }

        // The type still decides the tier — the prefix addresses the device, so
        // a neutralized .txt is as openable as any other .txt.
        assert_eq!(
            classify_external_open("CON.txt"),
            ExternalOpenPolicy::Allowed
        );
        assert_eq!(
            classify_external_open("CON.bat"),
            ExternalOpenPolicy::Refused
        );
        assert_eq!(
            classify_external_open("CON"),
            ExternalOpenPolicy::NeedsConfirmation,
        );
    }

    #[test]
    fn a_name_that_merely_starts_with_a_device_name_is_left_alone() {
        // The rule is the whole stem, not a prefix: these are ordinary names
        // and rewriting them would be a visible bug for no gain.
        for name in [
            "console.txt",
            "contract.pdf",
            "com10.txt",
            "com0.txt",
            "nullable.md",
            "auxiliary.docx",
            "my CON.txt",
            "_CON.txt",
        ] {
            assert_eq!(written_name(name), name, "{name} must not be rewritten");
        }
    }

    #[test]
    fn a_character_that_case_folds_onto_ascii_cannot_evade_a_tier() {
        // `x.pıf` is not in either tier as written, so without the fold it is
        // merely NeedsConfirmation — while a Win32 lookup, which upcases
        // U+0131 to `I`, hands it to the PIF handler and runs it.
        for (name, extension) in [
            ("shortcut.pıf", ".pif"),
            ("payload.jſ", ".js"),
            ("ınstaller.mſı", ".msi"),
            ("shortcut.lnK", ".lnk"),
        ] {
            assert_eq!(
                classify_external_open(name),
                ExternalOpenPolicy::Refused,
                "{name} resolves to {extension} on Windows",
            );
            // The fold decides the lookup only. The bytes written to disk stay
            // the sender's, so the file on disk is still the one being judged.
            assert_eq!(written_name(name), name, "{name} must not be rewritten");
        }

        // It cuts the other way too: a folded extension must land in the tier
        // it resolves to, not be refused for being unusual.
        assert_eq!(
            classify_external_open("report.pdſ"),
            ExternalOpenPolicy::NeedsConfirmation,
        );
        assert_eq!(
            classify_external_open("scan.tıf"),
            ExternalOpenPolicy::Allowed,
        );
    }

    #[test]
    fn the_lookup_fold_is_the_shared_table_and_nothing_else() {
        // Not Rust's Unicode lowercasing and not JavaScript's: those two
        // disagree (JS maps U+212A to `k` and U+0130 to `i` plus a combining
        // dot; `to_ascii_lowercase` leaves both), and a disagreement here is a
        // button the frontend offers for something the backend refuses.
        assert!(!TABLES.folds.is_empty(), "the fold table is empty");
        for (from, to) in &TABLES.folds {
            assert!(!from.is_ascii(), "folding {from:?} needs no table");
            assert!(to.is_ascii(), "{from:?} must fold onto ASCII, not {to:?}");
            // A fold whose output is another fold's input would make the
            // result depend on iteration order.
            assert!(
                !TABLES.folds.iter().any(|(other, _)| other == to),
                "{to:?} is both a fold target and a fold source",
            );
        }
        // Characters outside the table are left exactly as they are: the
        // lowercasing is ASCII-only, so `É` stays `É` and U+0130 stays itself
        // rather than becoming whatever each runtime thinks its lowercase is.
        assert_eq!(folded_for_lookup("ÉXE"), "Éxe");
        assert_eq!(folded_for_lookup("İ"), "İ");
    }

    #[test]
    fn a_control_character_cannot_hide_an_extension() {
        // Control characters are stripped, so `setup.exe\u{1}`
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
