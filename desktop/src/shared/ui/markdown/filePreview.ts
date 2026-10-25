/**
 * Decide, from a message's imeta alone, what a file card's click should open.
 *
 * Pure and separate from the card's JSX because this is the whole fallback
 * contract: a type we can render opens a preview, everything else opens the
 * same card's information plus the two actions that always work (download, or
 * hand the file to the OS). Getting it wrong in the "none" direction costs a
 * feature; getting it wrong in the other direction puts arbitrary bytes in
 * front of a renderer, which is why the backend re-checks the bytes against
 * this answer rather than trusting it.
 */

/** What the preview surface should render for an attachment. */
export type FilePreviewKind = "pdf" | "image" | "none";

/**
 * MIME values that carry no information: the relay stores an upload it cannot
 * classify as `application/octet-stream`, and older attachments may have no
 * `m` field at all. For these — and only these — the filename extension is
 * the better signal.
 */
const UNINFORMATIVE_MIMES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

/** Extensions an `<img>` in this webview can render. */
const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

/**
 * The final extension of `filename`, lowercased, or `""` when it has none.
 *
 * Deliberately only the final one: `invoice.pdf.exe` is an executable, and
 * treating it as a PDF because `.pdf` appears in the name is how a deceptive
 * filename gets a renderer. `sanitize_filename` on the Rust side has already
 * removed path separators from anything that reaches a command, but this runs
 * on the raw sender-supplied name, so it must not be fooled by one either.
 */
function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Classify an attachment for preview.
 *
 * A specific MIME wins, because the uploader computed it from the bytes. Only
 * when the MIME is absent or generic does the filename get a vote — that is the
 * common case for documents, which relays routinely store as
 * `application/octet-stream`.
 *
 * SVG is excluded from the image branch on purpose: an SVG is a document that
 * can carry script and remote references, so previewing one inside the app
 * would be the one case where "no scripts, no external fetches" stops holding.
 * It falls through to the download / open-externally card like a `.zip`.
 */
export function filePreviewKind({
  filename,
  mime,
}: {
  filename: string;
  mime?: string;
}): FilePreviewKind {
  const normalizedMime = (mime ?? "").trim().toLowerCase().split(";")[0];

  if (normalizedMime === "application/pdf") return "pdf";
  if (normalizedMime === "image/svg+xml") return "none";
  if (normalizedMime.startsWith("image/")) return "image";
  if (!UNINFORMATIVE_MIMES.has(normalizedMime)) return "none";

  const extension = extensionOf(filename);
  if (extension === "pdf") return "pdf";
  if (extension === "svg") return "none";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "none";
}

/** Whether a classified attachment has anything to render in-app. */
export function isPreviewable(kind: FilePreviewKind): kind is "pdf" | "image" {
  return kind !== "none";
}
