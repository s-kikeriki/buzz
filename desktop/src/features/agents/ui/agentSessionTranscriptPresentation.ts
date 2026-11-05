import { t } from "@lingui/core/macro";
import type { TranscriptItem } from "./agentSessionTypes";
import { buildCompactToolSummary } from "./agentSessionToolSummary";

/**
 * Whether a polished activity row should render the opt-in timestamp footer.
 * User message bubbles already render their own timestamp footer, so they are
 * excluded to avoid doubling up. Compact previews stay dense regardless of
 * the preference.
 */
export function shouldShowTranscriptRowTimestamp(
  item: TranscriptItem,
  options: { enabled: boolean; variant: string },
): boolean {
  if (!options.enabled || options.variant === "compactPreview") {
    return false;
  }
  if (item.type === "message" && item.role !== "assistant") {
    return false;
  }
  return true;
}

/**
 * Observer event kinds whose lifecycle rows are infrastructure noise.
 *
 * Keyed on the wire kind, not on `item.title.toLowerCase()`: the title is
 * display copy, so matching it leaked every one of these rows into the
 * activity-bar headline as soon as the titles were translated.
 */
const LIFECYCLE_NOISE_SOURCES = new Set([
  "turn_started",
  "session_resolved",
  "acp_parse_error",
]);

/** Human-readable headline for a single transcript item. */
export function getActivityHeadline(item: TranscriptItem): string | null {
  if (item.type === "tool") {
    const summary = buildCompactToolSummary(item);
    return [summary.label, summary.preview].filter(Boolean).join(" · ");
  }

  if (item.type === "message") {
    if (item.role === "assistant") {
      const trimmed = item.text.trim();
      if (trimmed.length > 0) {
        const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
        if (firstLine.length > 0) {
          return firstLine.length > 72
            ? `${firstLine.slice(0, 69)}…`
            : firstLine;
        }
      }
      return t`Responding`;
    }
    return item.title || t`User prompt`;
  }

  if (item.type === "thought") {
    // `acpSource` is the ACP update type, so a plan thought is recognised by
    // its wire kind rather than by comparing its translated title to "Plan".
    return item.acpSource === "plan" ? t`Planning` : item.title;
  }

  if (item.type === "metadata") {
    return item.title;
  }

  return item.title;
}

function isLifecycleNoise(
  item: Extract<TranscriptItem, { type: "lifecycle" }>,
) {
  return (
    item.acpSource !== undefined && LIFECYCLE_NOISE_SOURCES.has(item.acpSource)
  );
}

/** Whether an item should contribute to the headline scan (noise gate). */
export function isMeaningfulItem(item: TranscriptItem): boolean {
  if (item.type === "tool" && item.renderClass === "suppressed") {
    return false;
  }
  if (item.type === "lifecycle") {
    return !isLifecycleNoise(item);
  }
  if (item.type === "metadata") {
    // Raw JSON-RPC frames ("Raw ACP payload") are infrastructure noise; all
    // other metadata items (system prompt, prompt context) are semantically
    // meaningful and visible in the feed.
    return item.acpSource !== "raw_json_rpc";
  }
  return true;
}

/**
 * Whether an item is "spine" work — eligible to headline over setup/context.
 * Tools, messages, thoughts, plans, and meaningful lifecycle events qualify.
 * Metadata items (system prompt, prompt context) are reads that should recede
 * when real work is present; they are NOT spine items.
 *
 * Used by BotActivityBar for the two-tier headline scan:
 * 1. Collect spine headlines first.
 * 2. If none found, fall back to including metadata so the bar isn't empty at
 *    session start / idle.
 */
export function isSpineItem(item: TranscriptItem): boolean {
  if (!isMeaningfulItem(item)) return false;
  return item.type !== "metadata";
}
