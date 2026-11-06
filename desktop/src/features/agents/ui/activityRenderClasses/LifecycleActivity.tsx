import { AlertCircle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useLocale } from "@/shared/lib/localePreference";

import type { PermissionDecision } from "../agentSessionTypes";
import { formatTranscriptTimestampTitle } from "../agentSessionUtils";
import { ActivityRow, ActivityRowLabel } from "./ActivityRow";
import { ToolActivity } from "./ToolActivity";
import type { ActivityRenderClassItemProps } from "./types";

/**
 * Map the recorded decision to the row's tone and icon.
 *
 * Reads `outcomeDecision`, which `describePermissionOutcome` sets alongside
 * the display copy. The previous version derived the tone from that copy with
 * `outcome.startsWith("Approved")` — a match against English, so in every
 * other locale an approval rendered with the cancelled tone and icon.
 */
function permissionOutcomeTone(
  decision: PermissionDecision | undefined,
): "approve" | "deny" | "cancel" {
  if (decision === "approved") return "approve";
  if (decision === "denied") return "deny";
  return "cancel";
}

export function LifecycleActivity(props: ActivityRenderClassItemProps) {
  const locale = useLocale();
  if (props.item.type === "tool") {
    return <ToolActivity {...props} />;
  }
  if (props.item.type !== "lifecycle") {
    return null;
  }

  // The translated-copy bug this branch used to carry is fixed upstream:
  // `renderClass` now comes from the observer event kind
  // (`isLifecycleErrorSource`), so a localized "Turn-Fehler" is classified as
  // an error before it reaches here.
  //
  // The title fallback stays for the one row class `renderClass` cannot
  // classify: a freeform observer status, whose title is arbitrary text from
  // the agent runtime rather than copy from a catalogue. Those are always
  // pushed as "status", and dropping the fallback would have quietly taken the
  // error styling off a runtime-reported "Connection error".
  const isError =
    props.item.renderClass === "error" ||
    props.item.title.toLowerCase().includes("error");
  const isPermission = props.item.renderClass === "permission";
  const timestampTitle = formatTranscriptTimestampTitle(
    props.item.timestamp,
    locale,
  );

  if (isPermission) {
    const requestLines = props.item.text;
    const optionsLine = props.item.optionsText ?? null;
    const outcome = props.item.outcome;
    const tone = outcome
      ? permissionOutcomeTone(props.item.outcomeDecision)
      : null;
    return (
      <div
        className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-left text-xs text-amber-700 dark:text-amber-400"
        data-lifecycle-tone="permission"
        data-testid="transcript-permission-item"
        title={timestampTitle}
      >
        {/* Row 1: request */}
        <div>
          <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
          <span className="font-medium">{props.item.title}</span>
          {requestLines ? (
            <span className="opacity-80"> · {requestLines}</span>
          ) : null}
        </div>
        {/* Row 2: options (muted sub-line) */}
        {optionsLine ? (
          <div className="mt-0.5 pl-5 opacity-60">{optionsLine}</div>
        ) : null}
        {/* Row 3: decision — only when outcome is resolved */}
        {outcome && tone ? (
          <>
            <div className="my-1 border-t border-amber-500/20" />
            <div
              className={
                tone === "approve"
                  ? "flex items-center gap-1 font-medium text-green-600 dark:text-green-400"
                  : tone === "deny"
                    ? "flex items-center gap-1 font-medium text-destructive"
                    : "flex items-center gap-1 font-medium text-muted-foreground"
              }
              data-permission-tone={tone}
              data-testid="transcript-permission-outcome"
            >
              {tone === "approve" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : tone === "deny" ? (
                <XCircle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 opacity-50" />
              )}
              {outcome}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-left text-xs text-destructive"
        data-lifecycle-tone="error"
        data-testid="transcript-lifecycle-item"
        title={timestampTitle}
      >
        <AlertCircle className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
        <span className="font-medium">{props.item.title}</span>
        {props.item.text ? (
          <span className="opacity-80"> · {props.item.text}</span>
        ) : null}
      </div>
    );
  }

  return (
    <ActivityRow
      dataLifecycleTone="status"
      testId="transcript-lifecycle-item"
      title={timestampTitle}
    >
      <ActivityRowLabel
        object={props.item.text || undefined}
        openToneScope="none"
        verb={props.item.title}
      />
    </ActivityRow>
  );
}
