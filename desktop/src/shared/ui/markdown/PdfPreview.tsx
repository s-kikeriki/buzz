import * as React from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";

import type { PDFDocumentProxy } from "@/shared/ui/markdown/pdfjs";

/**
 * Render a PDF's pages to canvases, scrollable and zoomable.
 *
 * pdf.js and its worker are loaded on first use (`import("./pdfjs")`) so a
 * session that never opens a document never pays for them. See `pdfjs.ts` for
 * why rasterising to canvas with no annotation layer is what makes this render
 * sandboxed rather than any option set here.
 */

type Scales = {
  max: number;
  min: number;
  step: number;
  clamp: (scale: number) => number;
};

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; doc: PDFDocumentProxy; pageCount: number; scales: Scales }
  | { phase: "error"; message: string };

export function PdfPreview({
  bytes,
  label,
}: {
  bytes: ArrayBuffer;
  /** Accessible name for the document region — the attachment's filename. */
  label: string;
}) {
  const [state, setState] = React.useState<LoadState>({ phase: "loading" });
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    // Fence the async load: a second `bytes` (reopened card, retry) must not
    // have its result overwritten by the first load finishing late, and the
    // superseded document has to be torn down rather than leaked — each one
    // owns a worker thread.
    let current = true;
    let destroyLoaded: (() => Promise<void>) | null = null;

    setState({ phase: "loading" });
    setScale(1);

    void (async () => {
      try {
        const {
          clampPdfScale,
          loadPdfDocument,
          PDF_MAX_SCALE,
          PDF_MIN_SCALE,
          PDF_SCALE_STEP,
        } = await import("@/shared/ui/markdown/pdfjs");
        const { destroy, doc } = await loadPdfDocument(bytes);
        destroyLoaded = destroy;
        if (!current) {
          void destroy();
          return;
        }
        setState({
          phase: "ready",
          doc,
          pageCount: doc.numPages,
          scales: {
            clamp: clampPdfScale,
            max: PDF_MAX_SCALE,
            min: PDF_MIN_SCALE,
            step: PDF_SCALE_STEP,
          },
        });
      } catch (error) {
        if (!current) return;
        setState({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "This document could not be opened.",
        });
      }
    })();

    return () => {
      current = false;
      void destroyLoaded?.();
    };
  }, [bytes]);

  if (state.phase === "loading") {
    return (
      <div
        className="flex min-h-48 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        data-testid="pdf-preview-loading"
      >
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Opening document…
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        className="flex min-h-48 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
        data-testid="pdf-preview-error"
        role="alert"
      >
        {state.message}
      </div>
    );
  }

  const { clamp, max, min, step } = state.scales;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="pdf-preview">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border/60 px-3 py-1.5">
        <button
          aria-label="Zoom out"
          className={ZOOM_BUTTON_CLASS}
          disabled={scale <= min}
          type="button"
          onClick={() => setScale((current) => clamp(current - step))}
        >
          <ZoomOut aria-hidden="true" className="h-4 w-4" />
        </button>
        <span
          aria-live="polite"
          className="w-14 text-center text-xs tabular-nums text-muted-foreground"
        >
          {Math.round(scale * 100)}%
        </span>
        <button
          aria-label="Zoom in"
          className={ZOOM_BUTTON_CLASS}
          disabled={scale >= max}
          type="button"
          onClick={() => setScale((current) => clamp(current + step))}
        >
          <ZoomIn aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="ml-3 text-xs text-muted-foreground">
          {state.pageCount === 1 ? "1 page" : `${state.pageCount} pages`}
        </span>
      </div>

      <div
        aria-label={label}
        className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-auto bg-muted/30 p-4"
        role="document"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable or keyboard users cannot scroll it — the dialog locks body scrolling, so arrow keys have nowhere else to go
        tabIndex={0}
      >
        {pageNumbers(state.pageCount).map((pageNumber) => (
          <PdfPage
            key={`page-${pageNumber}`}
            doc={state.doc}
            pageNumber={pageNumber}
            scale={scale}
          />
        ))}
      </div>
    </div>
  );
}

/** `[1, 2, …, count]` — page numbers, which are the stable identity here. */
function pageNumbers(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

const ZOOM_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-45";

/**
 * One rasterised page.
 *
 * Each page renders itself so a long document paints progressively instead of
 * blocking on the last page, and so a zoom change re-renders pages
 * independently. The in-flight `RenderTask` is cancelled on every change —
 * pdf.js rejects a second `render()` on the same page while one is running, so
 * without the cancel a quick double zoom leaves the page blank.
 */
function PdfPage({
  doc,
  pageNumber,
  scale,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    let current = true;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (!current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Rasterise at device resolution and scale back down in CSS, so a
        // Retina display does not get a soft page.
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

        const context = canvas.getContext("2d");
        if (!context) return;
        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        task = renderTask;
        await renderTask.promise;
      } catch {
        // A cancelled render rejects; so does a page pdf.js cannot rasterise.
        // Neither should take down the whole document view — the page simply
        // stays blank, and `PdfPreview` has already reported a document-level
        // failure if there was one.
      }
    })();

    return () => {
      current = false;
      task?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <canvas
      aria-label={`Page ${pageNumber}`}
      className="max-w-full shadow-sm"
      data-testid={`pdf-page-${pageNumber}`}
      ref={canvasRef}
      role="img"
    />
  );
}
