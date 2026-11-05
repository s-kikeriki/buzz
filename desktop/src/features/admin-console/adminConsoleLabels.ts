/**
 * Translated labels for the admin console's server-side enums.
 *
 * Every value here arrives from the relay as a lowercase identifier
 * (`open`, `escalated`, `owner_fallback`, …) and was previously rendered
 * verbatim, so a German app showed English relay vocabulary in its badges,
 * selects and buttons. The coverage detector cannot see any of it: the strings
 * are not literals in the component, they are relay data.
 *
 * `i18n` is a required first parameter rather than a module import, following
 * `channelLifecycleLabel`: these are called from render paths, and a default
 * would let a caller resolve a label once at module scope and freeze it in the
 * boot locale.
 *
 * Every lookup falls back to the raw relay value. A relay that grows a new
 * status must still render something an operator can read and report, never an
 * empty badge.
 */

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

import type {
  AdminDirectAction,
  AdminFeedbackStatus,
  AdminPrincipalRole,
  AdminPrincipalSource,
  AdminReportAction,
} from "./api";

/** Resolve `table[key]`, falling back to the raw relay value. */
function lookup(
  i18n: I18n,
  table: Record<string, MessageDescriptor>,
  key: string,
): string {
  const descriptor = table[key];
  return descriptor ? i18n._(descriptor) : key;
}

// ── Report status ─────────────────────────────────────────────────────────

/**
 * `AdminReportDto.status` is typed `string`, not a union — the relay owns the
 * workflow and the console must survive a value it has not seen.
 */
const REPORT_STATUS: Record<string, MessageDescriptor> = {
  open: msg`Open`,
  processing: msg`Processing`,
  resolved: msg`Resolved`,
  dismissed: msg`Dismissed`,
  escalated: msg`Escalated`,
};

export function reportStatusLabel(i18n: I18n, status: string): string {
  return lookup(i18n, REPORT_STATUS, status);
}

// ── Report actions (the resolution matrix) ────────────────────────────────

const REPORT_ACTION: Record<AdminReportAction, MessageDescriptor> = {
  delete: msg`Delete`,
  kick: msg`Kick`,
  ban: msg`Ban`,
  timeout: msg`Timeout`,
  // Context-qualified: the bare msgid "Dismiss" is the message composer's
  // close-this-banner button ("Schließen"). Dismissing a report is rejecting
  // it as unfounded, which is a different verb in German.
  dismiss: msg({
    message: `Dismiss`,
    context: "report resolution action",
  }),
  escalate: msg`Escalate`,
};

export function reportActionLabel(
  i18n: I18n,
  action: AdminReportAction,
): string {
  return lookup(i18n, REPORT_ACTION, action);
}

// ── Enforcement action state ──────────────────────────────────────────────

/**
 * Whole sentences, not a `{state}` hole in one frame: German puts the
 * participle last and inflects it, so "Enforcement {state}" cannot carry
 * "steht aus", "erfolgreich" and "abgebrochen" in the same slot.
 */
const ENFORCEMENT_STATE: Record<string, MessageDescriptor> = {
  pending: msg`Enforcement pending…`,
  enforcing: msg`Enforcing…`,
  succeeded: msg`Enforcement succeeded`,
  failed: msg`Enforcement failed`,
  cancelled: msg`Enforcement cancelled`,
};

export function enforcementStateLabel(i18n: I18n, status: string): string {
  return lookup(i18n, ENFORCEMENT_STATE, status);
}

// ── Feedback status ───────────────────────────────────────────────────────

const FEEDBACK_STATUS: Record<AdminFeedbackStatus, MessageDescriptor> = {
  new: msg`New`,
  reviewed: msg`Reviewed`,
  archived: msg`Archived`,
};

export function feedbackStatusLabel(i18n: I18n, status: string): string {
  return lookup(i18n, FEEDBACK_STATUS, status);
}

// ── Operator roles and provenance ─────────────────────────────────────────

const PRINCIPAL_ROLE: Record<AdminPrincipalRole, MessageDescriptor> = {
  operator: msg`Operator`,
  moderator: msg`Moderator`,
};

export function principalRoleLabel(i18n: I18n, role: string): string {
  return lookup(i18n, PRINCIPAL_ROLE, role);
}

const PRINCIPAL_SOURCE: Record<AdminPrincipalSource, MessageDescriptor> = {
  config: msg`config`,
  owner_fallback: msg`owner (fallback)`,
  db: msg`db`,
};

export function principalSourceLabel(i18n: I18n, source: string): string {
  return lookup(i18n, PRINCIPAL_SOURCE, source);
}

// ── Direct actions ────────────────────────────────────────────────────────

const DIRECT_ACTION: Record<AdminDirectAction, MessageDescriptor> = {
  ban: msg`Ban member`,
  timeout: msg`Time out member`,
  delete: msg`Delete message`,
};

export function directActionLabel(
  i18n: I18n,
  action: AdminDirectAction,
): string {
  return lookup(i18n, DIRECT_ACTION, action);
}

// ── Console navigation ────────────────────────────────────────────────────

export type AdminTab = "reports" | "feedback" | "communities" | "operators";

const TAB: Record<AdminTab, MessageDescriptor> = {
  reports: msg`Reports`,
  feedback: msg`Feedback`,
  communities: msg`Communities`,
  operators: msg`Operators`,
};

export function adminTabLabel(i18n: I18n, tab: AdminTab): string {
  return lookup(i18n, TAB, tab);
}

export type CommunitySection =
  | "reports"
  | "restrictions"
  | "members"
  | "actions";

/**
 * The community page's section labels were `s[0].toUpperCase() + s.slice(1)`
 * over the section ids. Capitalising an identifier is not translation, and it
 * is invisible to the detector because no literal exists.
 */
const COMMUNITY_SECTION: Record<CommunitySection, MessageDescriptor> = {
  reports: msg`Reports`,
  restrictions: msg`Restrictions`,
  members: msg`Members`,
  actions: msg`Actions`,
};

export function communitySectionLabel(
  i18n: I18n,
  section: CommunitySection,
): string {
  return lookup(i18n, COMMUNITY_SECTION, section);
}

// ── Restriction kind ──────────────────────────────────────────────────────

export function restrictionBannedLabel(i18n: I18n): string {
  return i18n._(msg`banned`);
}

export function restrictionTimeoutLabel(i18n: I18n): string {
  return i18n._(msg`timeout`);
}
