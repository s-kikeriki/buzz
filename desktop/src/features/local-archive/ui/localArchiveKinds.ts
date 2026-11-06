import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import {
  CHANNEL_AUX_EVENT_KINDS,
  CHANNEL_MESSAGE_EVENT_KINDS,
  KIND_AGENT_OBSERVER_FRAME,
  KIND_HUDDLE_ENDED,
  KIND_HUDDLE_PARTICIPANT_JOINED,
  KIND_HUDDLE_PARTICIPANT_LEFT,
  KIND_HUDDLE_STARTED,
  KIND_STREAM_MESSAGE_DIFF,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

// ── Kind groups (derived from shared constants — never raw literals) ──────────

/**
 * Stable group identity, independent of the displayed label. The checklist
 * builds DOM ids and test ids from this, never from `label`: a translated
 * label would otherwise change every `data-testid` with the locale.
 */
export type KindGroupId = "messages" | "aux" | "huddle" | "system";

export type KindGroup = {
  /** Locale-independent identity for ids, test ids and React keys. */
  id: KindGroupId;
  /** Group label shown as a section header. */
  label: string;
  /** Individual kinds in this group, each with a human-readable name. */
  items: ReadonlyArray<{ kind: number; label: string }>;
};

type KindGroupSpec = {
  id: KindGroupId;
  label: MessageDescriptor;
  /** `label` omitted = fall back to `kindLabel` for that kind. */
  items: ReadonlyArray<{ kind: number; label?: MessageDescriptor }>;
};

/**
 * Ordered list of kind groups presented in the Step 2 checklist, as message
 * descriptors rather than resolved strings. Resolving at module scope would
 * freeze every label in whichever locale happened to boot first.
 *
 * Every item derives its kind value from a named constant in kinds.ts.
 */
const KIND_GROUP_SPECS: ReadonlyArray<KindGroupSpec> = [
  {
    id: "messages",
    label: msg`Messages & posts`,
    items: [
      ...CHANNEL_MESSAGE_EVENT_KINDS.map((k) => ({ kind: k })),
      {
        kind: KIND_STREAM_MESSAGE_DIFF,
        label: msg`Message diffs (kind 40008)`,
      },
    ],
  },
  {
    id: "aux",
    label: msg`Reactions, edits & deletions`,
    items: CHANNEL_AUX_EVENT_KINDS.map((k) => ({ kind: k })),
  },
  {
    id: "huddle",
    label: msg`Huddle events`,
    items: [
      { kind: KIND_HUDDLE_STARTED, label: msg`Huddle started` },
      {
        kind: KIND_HUDDLE_PARTICIPANT_JOINED,
        label: msg`Participant joined`,
      },
      { kind: KIND_HUDDLE_PARTICIPANT_LEFT, label: msg`Participant left` },
      { kind: KIND_HUDDLE_ENDED, label: msg`Huddle ended` },
    ],
  },
  {
    id: "system",
    label: msg`System messages`,
    items: [
      { kind: KIND_SYSTEM_MESSAGE, label: msg`System messages (kind 40099)` },
    ],
  },
];

/**
 * The checklist's groups in the active locale.
 *
 * `i18n` is a required parameter rather than a module import, following
 * `adminConsoleLabels`: this is called from a render path, and a module-level
 * constant would resolve once and never follow a language change.
 */
export function kindGroups(i18n: I18n): ReadonlyArray<KindGroup> {
  return KIND_GROUP_SPECS.map((spec) => ({
    id: spec.id,
    label: i18n._(spec.label),
    items: spec.items.map((item) => ({
      kind: item.kind,
      label: item.label ? i18n._(item.label) : kindLabel(i18n, item.kind),
    })),
  }));
}

const KIND_LABELS: ReadonlyMap<number, MessageDescriptor> = new Map([
  [5, msg`Event deletions (kind 5)`],
  [7, msg`Reactions (kind 7)`],
  [9, msg`Stream messages (kind 9)`],
  [9005, msg`${productName}-native deletions (kind 9005)`],
  [40002, msg`Stream messages v2 (kind 40002)`],
  [40003, msg`Message edits (kind 40003)`],
  [45001, msg`Forum posts (kind 45001)`],
  [45003, msg`Forum comments (kind 45003)`],
]);

/** Human-readable label for a known kind number. */
function kindLabel(i18n: I18n, kind: number): string {
  const descriptor = KIND_LABELS.get(kind);
  return descriptor ? i18n._(descriptor) : i18n._(msg`Kind ${kind}`);
}

/**
 * All kinds covered by the checklist, as a flat set for dedup checks. Derived
 * from the specs, so it stays locale-independent.
 */
const GROUPED_KINDS: ReadonlySet<number> = new Set(
  KIND_GROUP_SPECS.flatMap((g) => g.items.map((i) => i.kind)),
);

// ── Custom-kinds parser ───────────────────────────────────────────────────────

export type ParsedCustomKinds = {
  /** Valid non-negative integer kind numbers not already in KIND_GROUPS. */
  valid: number[];
  /**
   * Tokens that failed validation (not a non-negative integer, or duplicate
   * of a grouped kind), returned so the UI can show inline feedback.
   */
  invalid: string[];
};

/**
 * Parse a free-text custom kinds input.
 *
 * Rules:
 * - Split on whitespace and/or commas.
 * - Accept non-negative integers in the valid NIP-01 kind range 0..=65535 only
 *   (no floats, no negatives, no hex, no values > 65535).
 * - Reject tokens that duplicate a kind already present in KIND_GROUPS.
 * - Deduplicate valid tokens (keep first occurrence).
 * - Return both valid numbers and invalid tokens for inline feedback.
 */
export function parseCustomKinds(raw: string): ParsedCustomKinds {
  const tokens = raw.split(/[\s,]+/).filter((t) => t.length > 0);
  const valid: number[] = [];
  const invalid: string[] = [];
  const seen = new Set<number>();

  for (const token of tokens) {
    // Must be a non-negative integer with no leading sign, decimal point, etc.
    if (!/^\d+$/.test(token)) {
      invalid.push(token);
      continue;
    }
    const n = parseInt(token, 10);
    if (!Number.isFinite(n) || n < 0 || n > 65535) {
      invalid.push(token);
      continue;
    }
    if (GROUPED_KINDS.has(n)) {
      // Already available in the checklist — silently ignore (not an error).
      continue;
    }
    if (seen.has(n)) {
      continue; // deduplicate
    }
    seen.add(n);
    valid.push(n);
  }

  return { valid, invalid };
}

// ── Final kinds computation ───────────────────────────────────────────────────

/**
 * Compute the final sorted, deduped kinds array to pass to
 * `createSaveSubscription` for a channel_h subscription.
 *
 * @param checkedKinds - Set of kind numbers checked via the group checklist.
 * @param customKinds  - Valid custom kind numbers from `parseCustomKinds`.
 */
export function buildFinalKinds(
  checkedKinds: ReadonlySet<number>,
  customKinds: ReadonlyArray<number>,
): number[] {
  const merged = new Set<number>([...checkedKinds, ...customKinds]);
  return [...merged].sort((a, b) => a - b);
}

// ── Group-toggle helpers ──────────────────────────────────────────────────────

/** Returns whether all kinds in a group are in `checkedKinds`. */
export function isGroupFullyChecked(
  group: KindGroup,
  checkedKinds: ReadonlySet<number>,
): boolean {
  return group.items.every((i) => checkedKinds.has(i.kind));
}

/** Returns whether some (but not all) kinds in a group are in `checkedKinds`. */
export function isGroupIndeterminate(
  group: KindGroup,
  checkedKinds: ReadonlySet<number>,
): boolean {
  const some = group.items.some((i) => checkedKinds.has(i.kind));
  const all = group.items.every((i) => checkedKinds.has(i.kind));
  return some && !all;
}

/**
 * Toggle all kinds in a group: if the group is fully checked, uncheck all;
 * otherwise check all. Returns the updated set (new object).
 */
export function toggleGroup(
  group: KindGroup,
  checkedKinds: ReadonlySet<number>,
): Set<number> {
  const next = new Set(checkedKinds);
  if (isGroupFullyChecked(group, checkedKinds)) {
    for (const item of group.items) {
      next.delete(item.kind);
    }
  } else {
    for (const item of group.items) {
      next.add(item.kind);
    }
  }
  return next;
}

/** Toggle a single kind in `checkedKinds`. Returns the updated set. */
export function toggleKind(
  kind: number,
  checkedKinds: ReadonlySet<number>,
): Set<number> {
  const next = new Set(checkedKinds);
  if (next.has(kind)) {
    next.delete(kind);
  } else {
    next.add(kind);
  }
  return next;
}

// ── Subscription request builder ──────────────────────────────────────────────

export type SubscriptionRequest = {
  scopeType: "channel_h" | "owner_p";
  scopeValue: string;
  kinds: number[];
};

/**
 * Build the final subscription request to pass to `createSaveSubscription`.
 *
 * - For `owner_p`: kinds is always `[KIND_AGENT_OBSERVER_FRAME]`, scopeValue is
 *   the identity pubkey.
 * - For `channel_h`: kinds is the sorted deduped union of checkedKinds and
 *   customKinds; scopeValue is the channel id.
 *
 * Returns `null` when the request would be invalid (empty pubkey for owner_p,
 * empty channelId or zero kinds for channel_h).
 */
export function buildSubscriptionRequest(
  source: "channel_h" | "owner_p",
  scopeValue: string,
  checkedKinds: ReadonlySet<number>,
  customKinds: ReadonlyArray<number>,
): SubscriptionRequest | null {
  if (!scopeValue) return null;
  if (source === "owner_p") {
    return {
      scopeType: "owner_p",
      scopeValue,
      kinds: [KIND_AGENT_OBSERVER_FRAME],
    };
  }
  const kinds = buildFinalKinds(checkedKinds, customKinds);
  if (kinds.length === 0) return null;
  return { scopeType: "channel_h", scopeValue, kinds };
}
