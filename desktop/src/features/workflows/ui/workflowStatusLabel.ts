import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * A workflow or run status, as copy.
 *
 * The status itself stays an English token — the relay sends it and the badge
 * variants switch on it — so this is the render site where it becomes a word.
 * An unknown status falls back to the underscore-stripped token rather than
 * rendering nothing.
 *
 * This lives here because there were two copies of it: the detail panel's,
 * which an earlier tranche translated, and the run trace's, which still did
 * `status.replace(/_/g, " ")` and so rendered the raw token in every language.
 * Two copies of one decision, drifted apart — the same shape as the Vite
 * macro-extension list that blanked the whole app.
 */
export function workflowStatusLabel(status: string, i18n: I18n): string {
  switch (status) {
    case "active":
      return i18n._(msg`active`);
    case "disabled":
      return i18n._(msg`disabled`);
    case "archived":
      return i18n._(msg`archived`);
    case "completed":
      return i18n._(msg`completed`);
    case "failed":
      return i18n._(msg`failed`);
    case "error":
      return i18n._(msg`error`);
    case "running":
      return i18n._(msg`running`);
    case "pending":
      return i18n._(msg`pending`);
    case "cancelled":
      return i18n._(msg`cancelled`);
    case "skipped":
      return i18n._(msg`skipped`);
    case "waiting_approval":
      return i18n._(msg`waiting approval`);
    default:
      return status.replace(/_/g, " ");
  }
}
