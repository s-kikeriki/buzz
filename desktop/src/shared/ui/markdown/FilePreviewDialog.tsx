import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchPreviewBytes,
  openFileInDefaultApp,
} from "@/shared/api/tauriMedia";
import { invokeTauri } from "@/shared/api/tauri";
import { cn } from "@/shared/lib/cn";
import { MODAL_BACKDROP_BLUR_CLASS } from "@/shared/ui/modalBackdrop";
import {
  MODAL_CONTENT_MOTION_CLASS,
  MODAL_OVERLAY_MOTION_CLASS,
} from "@/shared/ui/modalMotion";
import { Button } from "@/shared/ui/button";
import { SimpleImageLightbox } from "@/shared/ui/SimpleImageLightbox";
import type { FilePreviewKind } from "@/shared/ui/markdown/filePreview";
import { isPreviewable } from "@/shared/ui/markdown/filePreview";
import { formatFileSize } from "@/shared/ui/markdown/fileSize";
import { PdfPreview } from "@/shared/ui/markdown/PdfPreview";

/**
 * In-app preview for a message attachment.
 *
 * Download is not implemented here and is not implied by opening this dialog:
 * it stays the same `download_file` command the card has always used, offered
 * as its own action both on the card and in here. Opening a preview writes
 * nothing to disk; only Download and "Open in default app" do, and both are
 * things the user asked for by name.
 *
 * An image goes to the app's existing image viewer rather than a second one
 * built here — `SimpleImageLightbox` with the actions composed into it.
 */

export type FilePreviewTarget = {
  /** Proxy-rewritten URL, as the card already resolved it. */
  href: string;
  filename: string;
  kind: FilePreviewKind;
  size?: number;
};

type FetchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; bytes: ArrayBuffer }
  | { phase: "error"; message: string };

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Fire the unchanged native download, reporting failure as a toast. */
function startDownload(target: FilePreviewTarget): void {
  invokeTauri("download_file", {
    url: target.href,
    filename: target.filename,
  }).catch((error: unknown) => {
    toast.error(errorMessage(error, "Download failed"));
  });
}

/**
 * Pull the attachment into memory while `enabled`, fenced by generation.
 *
 * The fence matters because this dialog is reopened on the same mounted card:
 * a fetch left in flight from a previous open must not publish its bytes into
 * the current one, and a superseded `ArrayBuffer` must not be rendered.
 */
function usePreviewBytes(
  target: FilePreviewTarget,
  enabled: boolean,
): { state: FetchState; retry: () => void } {
  const [state, setState] = React.useState<FetchState>({ phase: "idle" });
  const [attempt, setAttempt] = React.useState(0);
  const { href, kind, size } = target;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is an intentional trigger only — "Try again" bumps it to re-run the same fetch, and its value is never read in the effect body
  React.useEffect(() => {
    if (!(enabled && isPreviewable(kind))) {
      setState({ phase: "idle" });
      return;
    }

    let current = true;
    setState({ phase: "loading" });

    fetchPreviewBytes({ url: href, kind, declaredSize: size }).then(
      (bytes) => {
        if (current) setState({ phase: "ready", bytes });
      },
      (error: unknown) => {
        if (current) {
          setState({
            phase: "error",
            message: errorMessage(
              error,
              "This file could not be opened for preview.",
            ),
          });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [attempt, enabled, href, kind, size]);

  return {
    state,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** The two actions that work for every attachment, whatever we can render. */
function PreviewActions({
  compact,
  target,
}: {
  /** Dark, translucent styling for use over the image lightbox backdrop. */
  compact?: boolean;
  target: FilePreviewTarget;
}) {
  const [opening, setOpening] = React.useState(false);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        data-testid="file-preview-open-externally"
        disabled={opening}
        onClick={() => {
          setOpening(true);
          openFileInDefaultApp({
            url: target.href,
            filename: target.filename,
          })
            .catch((error: unknown) => {
              toast.error(errorMessage(error, "Could not open the file"));
            })
            .finally(() => setOpening(false));
        }}
        size="sm"
        variant={compact ? "secondary" : "outline"}
      >
        {opening ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        )}
        Open in default app
      </Button>
      <Button
        data-testid="file-preview-download"
        onClick={() => startDownload(target)}
        size="sm"
        variant={compact ? "secondary" : "default"}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Download
      </Button>
    </div>
  );
}

/** Loading, failure, and "nothing to render" bodies share this shape. */
function PreviewNotice({
  children,
  icon,
  testId,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
      data-testid={testId}
    >
      {icon}
      <span className="max-w-sm">{children}</span>
    </div>
  );
}

export function FilePreviewDialog({
  onOpenChange,
  open,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target: FilePreviewTarget;
}) {
  const { retry, state } = usePreviewBytes(target, open);
  const sizeLabel = target.size != null ? formatFileSize(target.size) : "";

  // Images reuse the existing viewer. Its own chrome (backdrop, Escape,
  // click-away, close button) is the behaviour users already know for an
  // image, so this branch only supplies what goes inside it.
  if (target.kind === "image") {
    return (
      <SimpleImageLightbox
        alt={target.filename}
        onOpenChange={onOpenChange}
        open={open}
        src=""
      >
        <div className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-4">
          {state.phase === "ready" ? (
            <ImageBytes alt={target.filename} bytes={state.bytes} />
          ) : state.phase === "error" ? (
            <div
              className="rounded-lg bg-background/95 px-6 py-5 text-center text-sm text-foreground"
              data-testid="file-preview-error"
              role="alert"
            >
              {state.message}
            </div>
          ) : (
            <Loader2
              aria-label="Loading preview"
              className="h-6 w-6 animate-spin text-white/80"
              data-testid="file-preview-loading"
            />
          )}
          <PreviewActions compact target={target} />
        </div>
      </SimpleImageLightbox>
    );
  }

  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60",
            MODAL_OVERLAY_MOTION_CLASS,
            MODAL_BACKDROP_BLUR_CLASS,
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-[min(56rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-lg",
            MODAL_CONTENT_MOTION_CLASS,
          )}
          data-testid="file-preview-dialog"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-semibold">
                {target.filename}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {sizeLabel
                  ? `${sizeLabel} · shown in the app; nothing is saved unless you download it`
                  : "Shown in the app; nothing is saved unless you download it"}
              </DialogPrimitive.Description>
            </div>
            <div className="flex items-center gap-2">
              <PreviewActions target={target} />
              <DialogPrimitive.Close
                aria-label="Close preview"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {target.kind === "none" ? (
            <PreviewNotice
              icon={
                <FileText aria-hidden="true" className="h-8 w-8 opacity-60" />
              }
              testId="file-preview-unsupported"
            >
              This file type cannot be previewed in the app. Download it, or
              open it in whichever application your system uses for it.
            </PreviewNotice>
          ) : state.phase === "ready" ? (
            <PdfPreview bytes={state.bytes} label={target.filename} />
          ) : state.phase === "error" ? (
            <PreviewNotice
              icon={
                <TriangleAlert
                  aria-hidden="true"
                  className="h-8 w-8 opacity-60"
                />
              }
              testId="file-preview-error"
            >
              {state.message}
              <span className="mt-3 block">
                <Button onClick={retry} size="sm" variant="outline">
                  Try again
                </Button>
              </span>
            </PreviewNotice>
          ) : (
            <PreviewNotice
              icon={
                <Loader2
                  aria-hidden="true"
                  className="h-6 w-6 animate-spin opacity-70"
                />
              }
              testId="file-preview-loading"
            >
              Loading preview…
            </PreviewNotice>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Render fetched image bytes.
 *
 * A blob URL rather than the attachment URL, so the image comes through the
 * validated fetch like every other preview — an attachment whose extension the
 * media-proxy rewrite does not recognise (`.heic`, or an image stored as
 * `application/octet-stream`) has no working direct URL in this webview.
 */
function ImageBytes({ alt, bytes }: { alt: string; bytes: ArrayBuffer }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    setUrl(objectUrl);
    return () => {
      setUrl(null);
      URL.revokeObjectURL(objectUrl);
    };
  }, [bytes]);

  if (!url) return null;
  return (
    <img
      alt={alt}
      className="max-h-[80vh] max-w-full rounded-lg object-contain"
      data-testid="file-preview-image"
      src={url}
    />
  );
}
