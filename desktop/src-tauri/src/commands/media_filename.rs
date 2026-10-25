/// The longest filename either an imeta label or a temporary file may carry.
///
/// 255 is what relay ingest validation accepts, and it is also the per-component
/// limit on every filesystem this app runs on.
const MAX_FILENAME_CHARACTERS: usize = 255;

/// The longest trailing extension [`bound_filename_length`] will keep whole.
///
/// Preserving the extension means spending the budget on the stem instead, and
/// that only makes sense while the tail really is an extension: a name whose
/// last dot is followed by 251 characters has a long stem, not a long type, and
/// mangling the stem to keep all of it would be the worse answer. 32 is well
/// clear of the longest extension anything classifies on — `settingcontent-ms`,
/// at 17 — so no real type is ever the one that falls back.
const MAX_PRESERVED_EXTENSION_CHARACTERS: usize = 32;

/// Strip a filename down to one writable component, without bounding it.
///
/// Directory components, surrounding whitespace, control characters. Split out
/// from [`sanitize_filename`] because [`crate::external_open_policy::written_name`]
/// has steps of its own to run between this and the length bound, and running
/// the bound twice around them is how a name can be classified as one type and
/// written as another.
pub(crate) fn strip_filename_components(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
    base.chars().filter(|c| !c.is_control()).collect()
}

/// The final extension of a name, as a character count including its dot.
///
/// `None` when there is nothing worth preserving: no dot, a leading dot (a
/// dotfile's name starts with it), a trailing dot, or a tail too long to be an
/// extension at all.
fn preservable_extension_length(characters: &[char]) -> Option<usize> {
    let dot = characters.iter().rposition(|c| *c == '.')?;
    if dot == 0 || dot == characters.len() - 1 {
        return None;
    }
    let length = characters.len() - dot;
    (length - 1 <= MAX_PRESERVED_EXTENSION_CHARACTERS).then_some(length)
}

/// Bound a filename to [`MAX_FILENAME_CHARACTERS`] by shortening its stem.
///
/// Cutting the tail instead would decide the file's type by arithmetic: a
/// 259-character `invoice.exe.pdf` loses the `.pdf` and is written — and
/// dispatched by the OS — as an executable, and a 259-character
/// `invoice.pdf.exe` loses the `.exe` and is written as a document. Both of
/// those are wrong in the same way: the type the name ends with is the one the
/// sender chose and the one the user is shown, so it is the part that has to
/// survive. The stem is the part nobody is making a decision about.
///
/// Both halves of the gate apply this rule, and `external-open-test-cases.json`
/// is what holds them to it — including at the boundary, where a name one
/// character over the bound is the only input that can tell the orderings apart.
pub(crate) fn bound_filename_length(name: &str) -> String {
    let characters: Vec<char> = name.chars().collect();
    if characters.len() <= MAX_FILENAME_CHARACTERS {
        return name.to_string();
    }
    match preservable_extension_length(&characters) {
        Some(extension) => characters[..MAX_FILENAME_CHARACTERS - extension]
            .iter()
            .chain(&characters[characters.len() - extension..])
            .collect(),
        None => characters[..MAX_FILENAME_CHARACTERS].iter().collect(),
    }
}

/// Sanitize a filename for use as a display label in the imeta `filename` field.
///
/// Strips directory components, removes control characters, and bounds length
/// to [`MAX_FILENAME_CHARACTERS`] so the resulting name always passes relay
/// ingest validation. The bound keeps the extension and shortens the stem —
/// see [`bound_filename_length`].
pub(crate) fn sanitize_filename(name: &str) -> String {
    let cleaned = bound_filename_length(&strip_filename_components(name));
    if cleaned.is_empty() {
        "file".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::{bound_filename_length, sanitize_filename, MAX_FILENAME_CHARACTERS};

    #[test]
    fn strips_paths_controls_and_empty_names() {
        assert_eq!(sanitize_filename("report.pdf"), "report.pdf");
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("/abs/path/notes.txt"), "notes.txt");
        assert_eq!(sanitize_filename(r"C:\Users\me\doc.docx"), "doc.docx");
        assert_eq!(sanitize_filename(""), "file");
        assert_eq!(sanitize_filename("/"), "file");
        assert_eq!(sanitize_filename("a\nb\tc.txt"), "abc.txt");
    }

    #[test]
    fn the_length_bound_shortens_the_stem_and_keeps_the_extension() {
        let long = format!("{}.pdf", "a".repeat(300));
        let bounded = bound_filename_length(&long);
        assert_eq!(bounded.chars().count(), MAX_FILENAME_CHARACTERS);
        assert!(bounded.ends_with(".pdf"), "{bounded}");
        // The same through the label path, since an imeta label the relay
        // accepts should still say what kind of file it names.
        assert!(sanitize_filename(&long).ends_with(".pdf"));
    }

    #[test]
    fn a_name_within_the_bound_is_returned_unchanged() {
        // Including at exactly the bound: an off-by-one here would rewrite
        // every ordinary name through the preservation branch.
        for length in [1, 10, MAX_FILENAME_CHARACTERS - 4] {
            let name = format!("{}.pdf", "a".repeat(length));
            assert_eq!(bound_filename_length(&name), name, "{length}");
        }
    }

    #[test]
    fn a_tail_too_long_to_be_an_extension_is_not_preserved() {
        // 251 characters after the dot is a long stem, not a long type.
        // Preserving it would leave 3 characters for the stem; cutting the
        // tail is the better answer, and the name is still bounded.
        let long = format!("notes.{}", "a".repeat(300));
        let bounded = bound_filename_length(&long);
        assert_eq!(bounded.chars().count(), MAX_FILENAME_CHARACTERS);
        assert!(bounded.starts_with("notes.aaa"), "{bounded}");
    }

    #[test]
    fn a_name_with_no_usable_extension_is_cut_at_the_bound() {
        for name in [
            "a".repeat(300),
            format!(".{}", "a".repeat(300)),
            format!("{}.", "a".repeat(300)),
        ] {
            assert_eq!(
                bound_filename_length(&name).chars().count(),
                MAX_FILENAME_CHARACTERS,
                "{name:.20}",
            );
        }
    }

    #[test]
    fn the_bound_counts_characters_rather_than_bytes() {
        // A multi-byte name cut at 255 *bytes* would both overshoot the
        // character limit and risk splitting a character.
        let long = format!("{}.pdf", "é".repeat(300));
        let bounded = bound_filename_length(&long);
        assert_eq!(bounded.chars().count(), MAX_FILENAME_CHARACTERS);
        assert!(bounded.ends_with(".pdf"));
    }
}
