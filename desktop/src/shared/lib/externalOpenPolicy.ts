/**
 * Which attachments may be handed to the OS default application, and which of
 * them have to be asked about first.
 *
 * "Open in default app" is the only action in the app that asks the operating
 * system to act on a file a stranger named and filled. On Windows that act is
 * execution for a long tail of extensions, and those are the ones the sniffed
 * MIME cannot catch: a `.bat`, `.vbs` or `.desktop` file is plain text, so the
 * uploader classifies it `application/octet-stream` and the MIME deny-list has
 * nothing to object to.
 *
 * Three tiers, decided on the final filename extension:
 *
 * - `allowed` — a format whose handler displays a document. Opens on one click.
 * - `needsConfirmation` — anything unrecognised, including a name with no
 *   extension. The button is there, and asks first.
 * - `refused` — a format whose handler runs the file. The button is not
 *   offered at all; Download still is.
 *
 * The table itself is `desktop/external-open-policy.json`, shared verbatim with
 * the Rust command (`external_open_policy.rs`), which re-decides before writing
 * anything. Both halves have to agree on which extensions are which: one file
 * is what keeps a UI that offers an action from meeting a backend that refuses
 * it — the same drift that made images render while documents would not
 * download. Add extensions there, never here.
 *
 * DOM-free and dependency-free, like {@link ./legacyRelayOrigins}: the card,
 * the preview dialog and their tests all need this answer and none of them
 * should have to mount anything to get it.
 */

import externalOpenPolicy from "../../../external-open-policy.json" with {
  type: "json",
};

/** What may be done with an attachment of a given name. */
export type ExternalOpenPolicy = "allowed" | "needsConfirmation" | "refused";

/**
 * Flatten a tier's extension groups into one set.
 *
 * Each tier is grouped by platform or kind purely for readability, and carries
 * a `comment` string explaining itself. Only the arrays are extensions — the
 * Rust side skips non-arrays the same way, so the comment cannot become an
 * extension in one language and not the other.
 */
function extensionsOf(tier: Record<string, unknown>): ReadonlySet<string> {
  return new Set(
    Object.values(tier)
      .filter((group): group is string[] => Array.isArray(group))
      .flat()
      .map((extension) => extension.toLowerCase()),
  );
}

const SAFE_EXTENSIONS = extensionsOf(externalOpenPolicy.safe);
const EXECUTABLE_EXTENSIONS = extensionsOf(externalOpenPolicy.executable);

/**
 * Non-ASCII characters a case-insensitive Win32 lookup resolves onto ASCII.
 *
 * Read from the shared table rather than derived from either runtime's Unicode
 * data, because the two runtimes disagree: `"\u212A".toLowerCase()` is `"k"`
 * here and `to_ascii_lowercase` leaves it alone in Rust, so a `.lnk` spelled
 * with U+212A was refused by this half and merely confirmed by the one that
 * does the writing.
 * That is the drift this file exists to prevent, so neither side lowercases
 * through Unicode any more — see {@link foldedForLookup}.
 */
const EXTENSION_CHARACTER_FOLDS = Object.entries(
  externalOpenPolicy.extensionCharacterFolds.folds,
);

/**
 * Resolve an extension or a device stem the way a Win32 lookup would.
 *
 * ASCII-lowercased, deliberately: `toLowerCase()` would bring JavaScript's
 * Unicode tables into a decision the Rust side makes with Rust's. Then the
 * shared fold, which is the explicit list of the characters that matter.
 */
function foldedForLookup(text: string): string {
  const lowered = text.replace(/[A-Z]/g, (character) =>
    character.toLowerCase(),
  );
  return EXTENSION_CHARACTER_FOLDS.reduce(
    (folded, [from, to]) => folded.replaceAll(from, to),
    lowered,
  );
}

/** Characters Windows reserves in a filename, which the Rust side replaces. */
const RESERVED_CHARACTERS = /[:*?"<>|]/g;

/**
 * Unicode definitions matching Rust's, not JavaScript's defaults.
 *
 * `String.prototype.trim` and the `\s` class both include U+FEFF, which Rust's
 * `char::is_whitespace` does not, and `char::is_control` is the `Cc` category
 * alone. The halves have to agree character for character or the shared test
 * corpus is the only thing that notices, so the categories are spelled out.
 */
const SURROUNDING_WHITESPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;
const CONTROL_CHARACTER = /\p{Cc}/u;
const TRAILING_DOTS_AND_WHITESPACE = /[.\p{White_Space}]+$/u;

/**
 * Invisible characters: `General_Category=Format`, the same class the Rust side
 * builds its regex from.
 *
 * `Cc` does not include these, so they survive the control-character filter,
 * and they are invisible in two different ways. U+200E after `.exe` makes the
 * extension `"exe\u200E"`, which is in neither tier, so a refusal becomes a
 * prompt; U+202E renders `invoice\u202Efdp.exe` as `invoice exe.pdf` to the
 * person deciding whether to trust it. The category rather than a list of the
 * known-abused ones, so a character Unicode adds later is covered already.
 *
 * Both sides read their own platform's Unicode tables here rather than a shared
 * list. A version skew between them is possible and is cosmetic: the Rust
 * command re-derives this name and re-decides before it writes anything, so the
 * worst case is a button offered for something the backend then refuses by
 * name. The test corpus pins the characters that actually carry the attack.
 */
const FORMAT_CHARACTER = /\p{Cf}/gu;

/**
 * Device names Win32 resolves before it looks at the filesystem.
 *
 * `dir/CON` is the console, not a file in `dir`: the write succeeds, the bytes
 * go nowhere, and the open hands the OS a device instead of a document. Win32
 * applies these with any extension, so the match is on the stem — everything
 * before the first dot — and the stem is trimmed first because Win32 ignores
 * trailing spaces in a device name.
 *
 * The superscript digits are here because Win32's device parsing reads `COM¹`
 * as `COM1`; `CONIN$`, `CONOUT$` and `CLOCK$` are the DOS-era devices that do
 * not follow the `COMn`/`LPTn` shape. The stem is compared through
 * {@link foldedForLookup} for the same reason an extension is, so a dotless i
 * is not a way around the list.
 */
const RESERVED_DEVICE_NAME =
  /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$|clock\$)$/;

function isReservedDeviceName(name: string): boolean {
  return RESERVED_DEVICE_NAME.test(
    foldedForLookup((name.split(".")[0] ?? "").trim()),
  );
}

/** What relay ingest accepts and what every filesystem here allows. */
const MAX_FILENAME_CHARACTERS = 255;

/**
 * The longest trailing extension {@link boundLength} keeps whole.
 *
 * Preserving the extension spends the cut on the stem instead, which only makes
 * sense while the tail really is an extension: a name whose last dot is followed
 * by 251 characters has a long stem, not a long type. 32 is well clear of the
 * longest extension anything classifies on (`settingcontent-ms`, at 17).
 */
const MAX_PRESERVED_EXTENSION_CHARACTERS = 32;

/**
 * Bound a name to {@link MAX_FILENAME_CHARACTERS} by shortening its stem.
 *
 * A mirror of `bound_filename_length` in `src-tauri/src/commands/media_filename.rs`.
 * Cutting the tail instead would let the bound decide the file's type: a
 * 259-character `invoice.exe.pdf` loses the `.pdf` and is written — and
 * dispatched — as an executable, and `invoice.pdf.exe` loses the `.exe` and is
 * written as a document. The type at the end of the name is the one the sender
 * chose and the one the user is shown; the stem is the part nobody is deciding
 * anything about.
 */
function boundLength(name: string): string {
  const characters = [...name];
  if (characters.length <= MAX_FILENAME_CHARACTERS) return name;

  const dot = characters.lastIndexOf(".");
  const extension = characters.length - dot;
  const preservable =
    dot > 0 &&
    dot < characters.length - 1 &&
    extension - 1 <= MAX_PRESERVED_EXTENSION_CHARACTERS;
  if (!preservable) {
    return characters.slice(0, MAX_FILENAME_CHARACTERS).join("");
  }
  return [
    ...characters.slice(0, MAX_FILENAME_CHARACTERS - extension),
    ...characters.slice(characters.length - extension),
  ].join("");
}

/**
 * The name the Rust command will actually write this attachment under.
 *
 * A mirror of `sanitize_filename` + `temp_filename` in
 * `src-tauri/src/commands/media_*.rs`, and the reason this is here rather than
 * classifying the sender's raw name: the backend classifies the *written*
 * string, so classifying anything else means the UI can offer an action the
 * backend refuses, or hide one it would have allowed. Sharing the extension
 * table is not enough when the two halves feed it different inputs — a
 * 259-character name truncates to `.exe`, and a control character between the
 * extension and the end of the name disappears.
 *
 * `external-open-test-cases.json` pins the agreement: both suites run the same
 * filenames through their own implementation and assert the same written name
 * and the same verdict, so a change to either side that drifts fails a test.
 */
export function externalOpenWrittenName(filename: string): string {
  // Strip format characters first, before the length bound: padding a name with
  // 250 invisible joiners must not spend the budget. Rust does this ahead of
  // `strip_filename_components` for the same reason.
  const unformatted = filename.replace(FORMAT_CHARACTER, "");

  // Drop directory components, trim surrounding whitespace, remove control
  // characters — `strip_filename_components`.
  const stripped = [
    ...(unformatted.split(/[/\\]/).pop() ?? "").replace(
      SURROUNDING_WHITESPACE,
      "",
    ),
  ]
    .filter((character) => !CONTROL_CHARACTER.test(character))
    .join("");

  // Neutralize reserved characters, then trailing dots and whitespace in one
  // pass so neither can expose the other — `written_name`.
  const trimmed = stripped
    .replace(RESERVED_CHARACTERS, "_")
    .replace(TRAILING_DOTS_AND_WHITESPACE, "");

  // Neutralize a reserved device stem by prefixing it, which addresses the
  // device without changing the type the tier is decided on: `CON.txt` becomes
  // `_CON.txt` and is still a text file. This is the only step that lengthens
  // the name, which is why the bound comes after it, and the result is trimmed
  // again because the bound's fallback cut can expose a trailing dot.
  const undeviced = isReservedDeviceName(trimmed) ? `_${trimmed}` : trimmed;
  const bounded = boundLength(undeviced);
  return bounded.replace(TRAILING_DOTS_AND_WHITESPACE, "") || "file";
}

/**
 * The extension this name will be dispatched on, lowercased.
 *
 * Not simply "text after the last dot": only the final extension counts, so
 * `invoice.pdf.exe` is an executable — the OS reads the last extension and so
 * must this. Trailing dots and whitespace are already gone from a written name
 * (Win32 strips them when it creates a file, so `evil.exe.` becomes
 * `evil.exe`), and are stripped again here so the function is correct for any
 * input, not only a sanitized one.
 *
 * The result is {@link foldedForLookup}, not merely lowercased, so `x.pıf` is
 * looked up as `pif`: a character that a Win32 lookup resolves onto ASCII is
 * resolved here too, instead of leaving an extension that matches no tier and
 * therefore only prompts.
 *
 * Returns `""` when there is no usable extension, including a dotfile like
 * `.bashrc` where the leading dot starts the name.
 */
function extensionOf(writtenName: string): string {
  const base = writtenName.replace(TRAILING_DOTS_AND_WHITESPACE, "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return foldedForLookup(base.slice(dot + 1));
}

/**
 * Classify an attachment by the name it will be written under.
 *
 * Pass the sender's raw filename; the sanitization the backend applies is
 * applied here first, by {@link externalOpenWrittenName}.
 */
export function classifyExternalOpen(filename: string): ExternalOpenPolicy {
  const extension = extensionOf(externalOpenWrittenName(filename));
  if (!extension) return "needsConfirmation";
  if (EXECUTABLE_EXTENSIONS.has(extension)) return "refused";
  if (SAFE_EXTENSIONS.has(extension)) return "allowed";
  return "needsConfirmation";
}

/**
 * The extension the tier was decided on, dotted for display, or `null`.
 *
 * For the confirmation dialog, which has to state the type as its own fact
 * rather than leaving the user to find it at the end of a filename. The
 * extension is the whole basis of the decision being confirmed, and a name is
 * the one part of this an attacker writes: `holiday.jpg.zip` reads as an image
 * until the eye reaches the end, and that is the benign version — the hostile
 * one spells the same trick with characters that have no width.
 *
 * Derived from the written name, so it is the extension that will actually be
 * dispatched on and not whatever the raw name appeared to end with.
 */
export function externalOpenFileType(filename: string): string | null {
  const extension = extensionOf(externalOpenWrittenName(filename));
  return extension ? `.${extension}` : null;
}
