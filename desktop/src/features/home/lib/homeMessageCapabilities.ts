import { t } from "@lingui/core/macro";

import type { InboxItem } from "@/features/home/lib/inbox";

/**
 * `t` from the core macro, not `msg` + `i18n._`.
 *
 * This is a plain function called during render, so `t` resolves against the
 * active catalogue each time it runs — which is what we want. The descriptors
 * in `inbox.ts` are a different case: `buildInboxItems` runs inside a `useMemo`
 * keyed on feed data, so its output survives a language change untouched.
 */

export function getHomeMessageCapabilities(
  item: InboxItem | null,
  currentPubkey: string | undefined,
  availableChannelIds: ReadonlySet<string>,
) {
  const canReact = Boolean(
    item?.item.channelId && availableChannelIds.has(item.item.channelId),
  );
  const canReply =
    canReact && item?.item.kind !== 45001 && item?.item.kind !== 45003;
  const disabledReplyReason =
    canReply || !item
      ? null
      : item.item.channelId
        ? availableChannelIds.has(item.item.channelId)
          ? t`This item does not support inline replies yet.`
          : t`Open the linked channel to reply.`
        : t`This inbox item does not have a reply target.`;

  return {
    canDelete:
      item !== null &&
      currentPubkey?.trim().toLowerCase() ===
        item.item.pubkey.trim().toLowerCase(),
    canReact,
    canReply,
    disabledReplyReason,
  };
}
