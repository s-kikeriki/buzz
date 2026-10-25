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
import type { ExternalOpenPolicy } from "@/shared/lib/externalOpenPolicy";
import {
  classifyExternalOpen,
  externalOpenFileType,
  externalOpenWrittenName,
} from "@/shared/lib/externalOpenPolicy";
import { MODAL_BACKDROP_BLUR_CLASS } from "@/shared/ui/modalBackdrop";
import {
  MODAL_CONTENT_MOTION_CLASS,
  MODAL_OVERLAY_MOTION_CLASS,
} from "@/shared/ui/modalMotion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
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

/**
 * Why "Open in default app" is missing for a refused type.
 *
 * One string, because it has to appear in both branches — the document dialog's
 * "cannot be previewed" notice and the image lightbox, where the file *is*
 * being shown — and an action that silently disappears in one of them is
 * indistinguishable from a bug.
 */
const EXTERNAL_OPEN_REFUSED_REASON =
  "Buzz will not pass this file to another application: files of this type are run rather than displayed. Download it if you trust the sender.";

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

/**
 * The actions for an attachment: Download always, and "Open in default app"
 * only where handing the file to the operating system is something we are
 * willing to do.
 *
 * Download is unconditional because the user picks the destination and nothing
 * is started. Handing the file over is not: for an extension whose handler
 * executes it the button is absent, and for one we do not recognise it asks
 * first. `shared/lib/externalOpenPolicy` decides which, and the Rust command
 * decides again from the same table — this is the affordance, not the gate.
 */
function PreviewActions({
  compact,
  externalOpen,
  target,
}: {
  /** Dark, translucent styling for use over the image lightbox backdrop. */
  compact?: boolean;
  externalOpen: ExternalOpenPolicy;
  target: FilePreviewTarget;
}) {
  const [opening, setOpening] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // What the backend will write and dispatch on, not what the sender typed.
  // Both are only read by the confirmation dialog below.
  const writtenName = externalOpenWrittenName(target.filename);
  const fileType = externalOpenFileType(target.filename);

  const handOver = (userConfirmed: boolean) => {
    setConfirming(false);
    setOpening(true);
    openFileInDefaultApp({
      url: target.href,
      filename: target.filename,
      userConfirmed,
    })
      .catch((error: unknown) => {
        toast.error(errorMessage(error, "Could not open the file"));
      })
      .finally(() => setOpening(false));
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      {externalOpen === "refused" ? null : (
        <Button
          data-testid="file-preview-open-externally"
          disabled={opening}
          onClick={() => {
            if (externalOpen === "needsConfirmation") {
              setConfirming(true);
              return;
            }
            handOver(false);
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
      )}
      <Button
        data-testid="file-preview-download"
        onClick={() => startDownload(target)}
        size="sm"
        variant={compact ? "secondary" : "default"}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Download
      </Button>
      {externalOpen !== "needsConfirmation" ? null : (
        <AlertDialog onOpenChange={setConfirming} open={confirming}>
          <AlertDialogContent data-testid="file-preview-open-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Open this file outside Buzz?</AlertDialogTitle>
              {/* Deliberately does not say "Buzz cannot show this": an image
                  with an unrecognised extension is being shown right now and
                  still reaches this dialog. What is true in every case is that
                  the type is unrecognised. */}
              <AlertDialogDescription>
                Buzz does not recognise this file type, so it can only write a
                temporary copy and hand it to whichever application your system
                uses for it. What that application then does with the file is up
                to it. Open it only if you trust whoever sent it.
              </AlertDialogDescription>
              {/* The name and the type are stated as separate facts, and the
                  name is the sanitized one. The sender writes this string: the
                  type decides everything the dialog is asking about, and it is
                  the part a name can be built to misrepresent — `holiday.jpg.zip`
                  reads as an image right up to the end. Reading it off the
                  written name also means the dialog cannot disagree with the
                  backend about what is being opened. */}
              <dl
                className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
                data-testid="file-preview-open-confirm-details"
              >
                <dt className="text-muted-foreground">File name:</dt>
                <dd
                  className="break-all font-medium"
                  data-testid="file-preview-open-confirm-name"
                >
                  {writtenName}
                </dd>
                <dt className="text-muted-foreground">File type:</dt>
                <dd
                  className="font-medium"
                  data-testid="file-preview-open-confirm-type"
                >
                  {fileType ?? "none"}
                </dd>
              </dl>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="file-preview-open-cancel">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="file-preview-open-confirmed"
                onClick={() => handOver(true)}
              >
                Open anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
  // One answer for the whole dialog: the actions row uses it to decide whether
  // to offer the hand-over at all, and the unpreviewable notice has to describe
  // the actions that are actually there rather than the ones it used to have.
  const externalOpen = classifyExternalOpen(target.filename);

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
          {externalOpen === "refused" ? (
            // The button is absent here too, and in this branch there is no
            // "cannot be previewed" notice to carry the reason — an image with
            // a refused extension is being shown, just not handed over.
            <p
              className="max-w-md rounded-lg bg-background/95 px-4 py-3 text-center text-xs text-muted-foreground"
              data-testid="file-preview-external-refused"
            >
              {EXTERNAL_OPEN_REFUSED_REASON}
            </p>
          ) : null}
          <PreviewActions compact externalOpen={externalOpen} target={target} />
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
              <PreviewActions externalOpen={externalOpen} target={target} />
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
              {externalOpen === "refused"
                ? `This file type cannot be previewed in the app. ${EXTERNAL_OPEN_REFUSED_REASON}`
                : "This file type cannot be previewed in the app. Download it, or open it in whichever application your system uses for it."}
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
