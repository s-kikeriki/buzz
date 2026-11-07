import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Flag } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useSubmitReportMutation } from "@/features/moderation/hooks";
import type { ReportType } from "@/features/moderation/hooks";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";

/** NIP-56 report categories, in the order shown to the reporter. `other` is
 *  last so it reads as the fallback rather than a first-class choice.
 *
 *  `msg` descriptors: the table is built at module load, before a catalogue is
 *  active, so a resolved label would freeze in whichever locale booted first.
 *  The component resolves each one with `i18n._()` on render. `value` is the
 *  wire `ReportType` and stays the React key, so nothing in the DOM moves with
 *  the locale. */
const REPORT_CATEGORIES: { value: ReportType; label: MessageDescriptor }[] = [
  { value: "spam", label: msg`Spam` },
  { value: "profanity", label: msg`Profanity or hate speech` },
  { value: "nudity", label: msg`Nudity or sexual content` },
  { value: "impersonation", label: msg`Impersonation` },
  { value: "malware", label: msg`Malware or scam` },
  { value: "illegal", label: msg`Illegal content` },
  { value: "other", label: msg`Other` },
];

/**
 * Extract a human-readable reason from a report mutation error. Returns the
 * relay's own error message when present, falling back to a generic string.
 *
 * Takes `i18n` rather than calling the global instance: this runs from a
 * mutation callback, not from render, and the fallback is the only copy in it
 * that belongs to the app rather than to the relay. The relay's own message is
 * still surfaced verbatim and untranslated — it is a server string, not copy
 * this catalogue owns.
 *
 * Exported for testing.
 */
export function reportErrorMessage(i18n: I18n, error: unknown): string {
  const fallback = i18n._(msg`Failed to submit report`);
  if (error instanceof Error) {
    // Surface the relay's own reason verbatim. Strip any raw status prefix
    // (e.g. "400: ") so the copy reads naturally in a toast.
    const stripped = error.message.replace(/^[45]\d\d:\s?/, "").trim();
    return stripped || fallback;
  }
  return fallback;
}

export function ReportMessageDialog({
  open,
  onOpenChange,
  authorPubkey,
  eventId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display author of the reported message (the `p` tag target). */
  authorPubkey: string;
  /** Reported message event id (the `e` tag target). */
  eventId: string;
}) {
  const { i18n, t } = useLingui();
  const submitReport = useSubmitReportMutation();
  const [category, setCategory] = React.useState<ReportType | null>(null);
  const [note, setNote] = React.useState("");

  // Reset the form each time the dialog opens so a prior report's selection
  // never leaks into the next one.
  React.useEffect(() => {
    if (open) {
      setCategory(null);
      setNote("");
    }
  }, [open]);

  const submit = () => {
    if (!category || submitReport.isPending) return;
    submitReport.mutate(
      {
        authorPubkey,
        eventId,
        reportType: category,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t`Report submitted to community moderators`);
          onOpenChange(false);
        },
        onError: (error) => toast.error(reportErrorMessage(i18n, error)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            <Trans>Report message</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Reports go to this community's moderators for review. The author
              is not notified of who reported them.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {REPORT_CATEGORIES.map((item) => (
            <Button
              key={item.value}
              variant={category === item.value ? "default" : "outline"}
              className="justify-start"
              disabled={submitReport.isPending}
              onClick={() => setCategory(item.value)}
            >
              {i18n._(item.label)}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="report-note"
            className="text-sm font-medium text-muted-foreground"
          >
            <Trans>Additional context (optional)</Trans>
          </label>
          <Textarea
            id="report-note"
            placeholder={t`Add anything that helps moderators...`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitReport.isPending}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            variant="default"
            onClick={submit}
            disabled={!category || submitReport.isPending}
          >
            <Trans>Submit report</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
