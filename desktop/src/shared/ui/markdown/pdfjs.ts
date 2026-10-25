/**
 * pdf.js configuration for the in-app document preview.
 *
 * Imported dynamically by {@link ./PdfPreview} so pdf.js and its worker land in
 * their own chunk rather than in the app's startup bundle — most sessions never
 * open a PDF.
 *
 * ## What makes this render sandboxed
 *
 * The requirement is no scripts, no links that navigate the app, and no
 * external fetches from inside the document. None of that is configured here;
 * all three fall out of how pdf.js is used:
 *
 * - **No scripts.** PDF JavaScript only runs if the host instantiates pdf.js's
 *   scripting sandbox (`pdf.sandbox.mjs`) and wires its callbacks. Nothing here
 *   imports it, so there is no interpreter for a document's JavaScript to reach.
 * - **No links.** Pages are rasterised to a canvas and the annotation layer is
 *   never built, so a `/URI` or `/GoTo` action has no DOM element to be
 *   attached to. There is no anchor to click, which is a stronger guarantee
 *   than intercepting clicks on one.
 * - **No external fetches.** The document arrives as bytes already in memory,
 *   so pdf.js issues no request for the file itself, and it never resolves
 *   remote references found inside a PDF. The only URLs it fetches are the
 *   four local asset directories below, served from the app's own origin.
 */

import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
// Vite emits the worker as a hashed asset and gives us its URL. The CSP
// already allows `worker-src 'self'`.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Where `vite-plugin-pdfjs-assets` serves pdf.js's data files. pdf.js appends
 * a filename to each of these, so the trailing slash is required and the paths
 * must not be content-hashed — see that plugin for why they cannot go through
 * the normal asset pipeline.
 */
const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

/** Zoom bounds for the document view.
 *
 * Deliberately not the image lightbox's constants: there, `1` means "fit to
 * the window" and zooming out below it is meaningless. A page is laid out at
 * its own intrinsic size, so `1` is 100% and halving it is a useful view of a
 * multi-page document.
 */
export const PDF_MIN_SCALE = 0.5;
export const PDF_MAX_SCALE = 4;
export const PDF_SCALE_STEP = 0.25;

/** Clamp a requested scale into the supported range. */
export function clampPdfScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(PDF_MAX_SCALE, Math.max(PDF_MIN_SCALE, scale));
}

/** A parsed document plus the teardown that releases its worker. */
export type LoadedPdf = {
  doc: PDFDocumentProxy;
  /** Aborts outstanding work and terminates the worker thread. */
  destroy: () => Promise<void>;
};

/**
 * Parse PDF bytes into a pdf.js document.
 *
 * The bytes are copied first because pdf.js transfers the buffer it is given to
 * its worker, detaching it. Without the copy a retry — or anything else that
 * still holds the caller's `ArrayBuffer` — would be handed zero bytes and fail
 * with a corrupt-file error that has nothing to do with the file.
 *
 * Teardown lives on the loading task, not the document, and it is not optional:
 * each open spawns a worker, so a dialog closed without destroying its task
 * leaks one worker thread per document the user looked at.
 */
export async function loadPdfDocument(bytes: ArrayBuffer): Promise<LoadedPdf> {
  const task = getDocument({
    data: new Uint8Array(bytes.slice(0)),
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
  });
  try {
    const doc = await task.promise;
    return { doc, destroy: () => task.destroy() };
  } catch (error) {
    // A document that failed to parse still has a worker attached to it.
    await task.destroy().catch(() => {});
    throw error;
  }
}

export type { PDFDocumentProxy };
