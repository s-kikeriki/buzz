import assert from "node:assert/strict";
import test from "node:test";

import { filePreviewKind, isPreviewable } from "./filePreview.ts";

/**
 * The click/fallback contract: what a file card's click opens.
 *
 * Both inputs are sender-supplied, so the interesting cases are the
 * disagreements — a generic MIME with a meaningful extension, a meaningful
 * MIME with a misleading extension — and the types that must stay out of an
 * in-app renderer entirely.
 */

test("a declared PDF previews as a PDF", () => {
  assert.equal(
    filePreviewKind({ filename: "report.pdf", mime: "application/pdf" }),
    "pdf",
  );
});

test("the extension decides when the relay stored a generic MIME", () => {
  // This is the common case for documents: the relay classifies anything it
  // cannot sniff as application/octet-stream, so refusing to look at the
  // filename would mean no PDF ever previews.
  for (const mime of [
    undefined,
    "",
    "application/octet-stream",
    "binary/octet-stream",
  ]) {
    assert.equal(
      filePreviewKind({ filename: "2026-10 minutes.pdf", mime }),
      "pdf",
      `octet-stream + .pdf must preview (mime: ${String(mime)})`,
    );
  }
});

test("a specific MIME outranks the extension", () => {
  // The uploader computed the MIME from the bytes; the name is just a label.
  assert.equal(
    filePreviewKind({ filename: "invoice.pdf", mime: "application/zip" }),
    "none",
  );
  assert.equal(
    filePreviewKind({ filename: "scan.bin", mime: "image/jpeg" }),
    "image",
  );
});

test("only the final extension counts", () => {
  // `invoice.pdf.exe` is an executable. Matching `.pdf` anywhere in the name
  // is how a deceptive filename reaches a renderer.
  assert.equal(filePreviewKind({ filename: "invoice.pdf.exe" }), "none");
  assert.equal(filePreviewKind({ filename: "invoice.exe.pdf" }), "pdf");
});

test("images are previewable only when the app can render them", () => {
  assert.equal(
    filePreviewKind({
      filename: "photo.heic",
      mime: "application/octet-stream",
    }),
    "image",
  );
  assert.equal(filePreviewKind({ filename: "diagram.webp" }), "image");
  assert.equal(filePreviewKind({ filename: "shot.PNG" }), "image");
});

test("SVG is never previewed, however it is labelled", () => {
  // An SVG is a document that can carry script and remote references — the one
  // image type where "no scripts, no external fetches" would stop holding.
  assert.equal(
    filePreviewKind({ filename: "logo.svg", mime: "image/svg+xml" }),
    "none",
  );
  assert.equal(filePreviewKind({ filename: "logo.svg" }), "none");
});

test("the types the spec names as download-only are download-only", () => {
  for (const filename of [
    "minutes.docx",
    "costs.xlsx",
    "deck.pptx",
    "bundle.zip",
    "notes.txt",
    "data.csv",
    "archive.tar.gz",
  ]) {
    assert.equal(
      filePreviewKind({ filename }),
      "none",
      `${filename} must fall back to download / open externally`,
    );
  }
});

test("a MIME with parameters still classifies", () => {
  assert.equal(
    filePreviewKind({ filename: "a", mime: "application/pdf; charset=binary" }),
    "pdf",
  );
  assert.equal(filePreviewKind({ filename: "a", mime: "IMAGE/PNG" }), "image");
});

test("a filename with no extension is not previewable", () => {
  assert.equal(filePreviewKind({ filename: "README" }), "none");
  assert.equal(filePreviewKind({ filename: ".pdf" }), "none");
  assert.equal(filePreviewKind({ filename: "trailing." }), "none");
  assert.equal(filePreviewKind({ filename: "" }), "none");
});

test("a path-shaped name is read from its last segment", () => {
  // The imeta filename is whatever the sender put there.
  assert.equal(filePreviewKind({ filename: "a.pdf/b.zip" }), "none");
  assert.equal(filePreviewKind({ filename: "a.zip/b.pdf" }), "pdf");
  assert.equal(filePreviewKind({ filename: String.raw`C:\docs\b.pdf` }), "pdf");
});

test("isPreviewable narrows to the two renderable kinds", () => {
  assert.equal(isPreviewable("pdf"), true);
  assert.equal(isPreviewable("image"), true);
  assert.equal(isPreviewable("none"), false);
});
