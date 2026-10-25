import * as React from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

import { invokeTauri } from "@/shared/api/tauri";
import { externalOpenWrittenName } from "@/shared/lib/externalOpenPolicy";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";
import { filePreviewKind } from "@/shared/ui/markdown/filePreview";
import { FilePreviewDialog } from "@/shared/ui/markdown/FilePreviewDialog";
import { formatFileSize } from "@/shared/ui/markdown/fileSize";

/**
 * File card for a generic (non-image, non-video) attachment: icon, filename,
 * size, and two actions.
 *
 * The card body opens an in-app preview; Download is its own control, on the
 * card and again inside the preview. They are deliberately separate: opening a
 * document to read it should not put a copy in the user's Downloads folder,
 * and wanting the file should not require opening it first.
 *
 * Downloads go through the native `download_file` Tauri command (HTTP inside
 * the app's tunnel + a save dialog), not a plain `<a download>` link. A bare
 * link navigates the webview to the blob URL, which escapes to the OS browser
 * and gets bounced to a corporate CDN interstitial ("browser not supported").
 * The native command mirrors the image-download path. The preview path uses
 * the same URL validation and the same authenticated fetch, and writes nothing.
 *
 * Every name the card *shows* is the sanitized written name, matching the
 * preview dialog. The sender's raw name still goes over IPC — the backend
 * re-derives its own and decides what gets written — but it is never rendered:
 * a U+202E in it reverses the text around it, so the card would advertise
 * `invoice fdp.exe` as `invoice exe.pdf`.
 */
export function FileCard({
  href,
  filename,
  mime,
  size,
}: {
  href: string;
  filename: string;
  /** imeta `m`, when the message carries one — classifies the preview. */
  mime?: string;
  size?: number;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const sizeLabel = size != null ? formatFileSize(size) : "";
  const kind = filePreviewKind({ filename, mime });
  const writtenName = externalOpenWrittenName(filename);

  return (
    <>
      <Attachment className="my-1 inline-flex max-w-sm" data-testid="file-card">
        {/* The card's own click target. An overlay rather than a wrapping
            button so the Download control beside it is not a nested
            interactive element: `AttachmentActions` is already stacked above
            this (`z-20`), so each control owns exactly one accessible name. */}
        <button
          aria-label={`Preview ${writtenName}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="file-card-open"
          onClick={() => setPreviewOpen(true)}
          type="button"
        />
        <AttachmentMedia>
          <FileText aria-hidden="true" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{writtenName}</AttachmentTitle>
          {sizeLabel ? (
            <AttachmentDescription>{sizeLabel}</AttachmentDescription>
          ) : null}
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            aria-label={`Download ${writtenName}`}
            data-testid="file-card-download"
            onClick={() => {
              invokeTauri("download_file", { url: href, filename }).catch(
                (err: unknown) => {
                  const msg =
                    err instanceof Error ? err.message : "Download failed";
                  toast.error(msg);
                },
              );
            }}
          >
            <Download aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
      {previewOpen ? (
        <FilePreviewDialog
          onOpenChange={setPreviewOpen}
          open={previewOpen}
          target={{ filename, href, kind, size }}
        />
      ) : null}
    </>
  );
}
