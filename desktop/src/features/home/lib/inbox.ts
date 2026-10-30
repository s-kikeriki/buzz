import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import {
  getThreadReference,
  isBroadcastReply,
} from "@/features/messages/lib/threading";
import {
  getProjectInboxReference,
  isProjectInboxItem,
} from "@/features/home/lib/projectInbox";
import type { TimelineReaction } from "@/features/messages/types";
import {
  KIND_APPROVAL_REQUEST,
  KIND_FORUM_COMMENT,
  KIND_FORUM_POST,
  KIND_JOB_ACCEPTED,
  KIND_JOB_CANCEL,
  KIND_JOB_ERROR,
  KIND_JOB_PROGRESS,
  KIND_JOB_REQUEST,
  KIND_JOB_RESULT,
  KIND_REMINDER,
} from "@/shared/constants/kinds";
import type {
  Channel,
  FeedItem,
  FeedItemCategory,
  HomeFeedResponse,
  RelayEvent,
} from "@/shared/api/types";
import {
  formatDayGroupLabel,
  formatItemTimestamp,
} from "@/shared/lib/datetime";
import { localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";
import { resolveMentionProps } from "@/shared/lib/resolveMentionNames";

export type InboxFilter =
  | "all"
  | "project"
  | "mention"
  | "thread"
  | "needs_action"
  | "agent_activity"
  | "reminders"
  | "drafts";

export type InboxItem = {
  avatarUrl: string | null;
  /**
   * Stable conversation identity: the NIP-10 root for messages, or a
   * repository-scoped root for Buzz Git work. Does NOT change when a new reply
   * advances the representative latest event. Use this for lifecycle
   * continuity: scroll gating, draft keys, local-reply storage, and selection.
   */
  conversationId: string;
  id: string;
  item: FeedItem;
  categories: FeedItemCategory[];
  categoryLabel: MessageDescriptor;
  channelLabel: string | null;
  fullTimestampLabel: string;
  groupItems: FeedItem[];
  isActionRequired: boolean;
  latestActivityAt: number;
  mentionNames: string[];
  mentionPubkeysByName?: Record<string, string>;
  preview: InboxCopy;
  senderLabel: string;
  subject: InboxCopy;
  timestampLabel: string;
  unreadCount: number;
};

/**
 * Copy on its way to an inbox row: either a message to translate or a piece of
 * the person's own content.
 *
 * This module builds the rows, and it is a pure function of relay data — it
 * runs when the feed changes, not when the locale does. So it cannot resolve
 * copy itself: a `t` here would bake in whichever locale happened to be active
 * the last time a message arrived, and a row built before a language switch
 * would stay in the old language until something else pushed it. The rows
 * carry descriptors and `InboxListPane` resolves them with `i18n._()` on
 * render.
 *
 * The union is not squeamishness about types. A preview is the message body
 * when there is one and a fixed sentence when there is not, and a subject is
 * the author's own `subject` tag when they wrote one — translating a person's
 * own words would be worse than leaving them.
 */
export type InboxCopy = MessageDescriptor | string;

export type InboxTypeLabel = {
  text: InboxCopy;
  /**
   * Whether `text` still needs the word that links it to the channel chip.
   *
   * The fixed phrases carry their own ("Mentioned in"), because the chip is
   * separately styled and the pair cannot be one sentence with a placeholder.
   * A dynamic headline cannot carry it: this module hands out descriptors and
   * so has no resolved string to splice a word onto.
   */
  joinsChannel?: boolean;
  channelLabel: string | null;
};

export type InboxReply = {
  authorLabel: string;
  authorPubkey: string;
  isAgent?: boolean;
  ownerLabel?: string | null;
  ownerPubkey?: string | null;
  avatarUrl: string | null;
  content: string;
  createdAt: number;
  depth?: number;
  fullTimestampLabel: string;
  id: string;
  /** Raw event kind — input to the config-nudge trust gate. */
  kind?: number;
  parentId?: string | null;
  reactions?: TimelineReaction[];
  rootId?: string | null;
  /**
   * Raw event signer, not a relay-delegated display author (`authorPubkey`).
   * The config-nudge trust gate authenticates against this field because only
   * the signing agent may enable the card.
   */
  signerPubkey?: string;
  tags?: string[][];
  /** Clock time only, for the hover gutter on continuation rows. */
  timeLabel?: string;
};

export type InboxContextMessage = InboxReply & {
  depth: number;
  isSelected: boolean;
  mentionNames: string[];
  mentionPubkeysByName?: Record<string, string>;
};

export type InboxGroup = {
  label: string;
  items: InboxItem[];
};

type InboxChannel = Pick<Channel, "channelType" | "id" | "name">;

const FULL_TIME = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

function tagValue(item: FeedItem, name: string) {
  return item.tags.find((tag) => tag[0] === name)?.[1]?.trim() || null;
}

function projectRootItem(item: FeedItem, groupItems: readonly FeedItem[]) {
  return (
    groupItems.find(
      (candidate) => candidate.kind === 1618 || candidate.kind === 1621,
    ) ?? item
  );
}

function projectTypeLabel(item: FeedItem): MessageDescriptor {
  if (item.kind === 1618) return msg`Review`;
  if (item.kind === 1621) return msg`Task`;
  return msg`Project update`;
}

function feedHeadline(
  item: FeedItem,
  groupItems: readonly FeedItem[] = [],
): InboxCopy {
  if (isProjectInboxItem(item)) {
    const root = projectRootItem(item, groupItems);
    return (
      (tagValue(root, "subject") ?? root.content.trim().split("\n")[0]) ||
      projectTypeLabel(root)
    );
  }

  return feedKindHeadline(item);
}

/**
 * The headline for an event with no subject of its own.
 *
 * Exported because `FeedSection` had a byte-for-byte copy of this switch and
 * of `feedPreview` below — fourteen of the same strings, written twice. That
 * is the duplication that let #23 translate one `BackupTestFlow` and leave the
 * other saying "Buzz", and it would have done the same here: the inbox list
 * would have gone German while the home feed beside it stayed English.
 */
export function feedKindHeadline(item: FeedItem): MessageDescriptor {
  switch (item.kind) {
    case KIND_REMINDER:
      return msg`Reminder`;
    case KIND_JOB_REQUEST:
      return msg`Job requested`;
    case KIND_JOB_ACCEPTED:
      return msg`Job accepted`;
    case KIND_JOB_PROGRESS:
      return msg`Progress update`;
    case KIND_JOB_RESULT:
      return msg`Job result`;
    case KIND_JOB_CANCEL:
      return msg`Job cancelled`;
    case KIND_JOB_ERROR:
      return msg`Job failed`;
    case KIND_FORUM_POST:
      return msg`Forum post`;
    case KIND_FORUM_COMMENT:
      return msg`Forum reply`;
    case KIND_APPROVAL_REQUEST:
      return msg`Approval requested`;
    default:
      if (item.category === "mention") {
        return msg`Mention`;
      }

      if (item.category === "agent_activity") {
        return msg`Agent update`;
      }

      return msg`Channel update`;
  }
}

/** The preview for an event whose body is empty. See {@link feedKindHeadline}. */
export function feedPreview(item: FeedItem): InboxCopy {
  const content = item.content.trim();
  if (content.length > 0) {
    return content;
  }

  if (item.kind === KIND_APPROVAL_REQUEST) {
    return msg`A workflow is waiting for approval.`;
  }

  if (item.kind === KIND_REMINDER) {
    return msg`A reminder is waiting for you.`;
  }

  return msg`No additional details were attached to this event.`;
}

function categoryLabelFor(category: FeedItemCategory): MessageDescriptor {
  return category === "needs_action"
    ? msg`Needs Action`
    : category === "mention"
      ? msg`Mention`
      : category === "agent_activity"
        ? msg`Agent update`
        : msg`Activity`;
}

export function isThreadActivityItem(item: FeedItem) {
  if (item.category !== "activity") {
    return false;
  }

  const thread = getThreadReference(item.tags);
  return thread.parentId !== null && !isBroadcastReply(item.tags);
}

function isThreadReplyItem(item: FeedItem) {
  const thread = getThreadReference(item.tags);
  return thread.parentId !== null && !isBroadcastReply(item.tags);
}

function uniqueItemsById(items: readonly FeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function isItemUnread(
  item: FeedItem,
  readAt: number | null,
  getMessageReadAt?: (messageId: string) => number | null,
) {
  const messageReadAt = getMessageReadAt?.(item.id) ?? null;
  return item.createdAt > Math.max(readAt ?? 0, messageReadAt ?? 0);
}

function activityHeadline(item: FeedItem) {
  return feedHeadline(item);
}

function resolveItemChannel(
  item: FeedItem,
  channelById: ReadonlyMap<string, InboxChannel>,
) {
  const channel = item.channelId ? channelById.get(item.channelId) : undefined;
  const name = item.channelName?.trim() || channel?.name.trim() || null;

  return {
    name,
    type: item.channelType ?? channel?.channelType,
  };
}

function resolveGroupChannel(
  primaryItem: FeedItem,
  groupItems: FeedItem[],
  channelById: ReadonlyMap<string, InboxChannel>,
) {
  for (const candidate of [primaryItem, ...groupItems]) {
    const channel = resolveItemChannel(candidate, channelById);
    if (channel.name || channel.type) {
      return channel;
    }
  }

  return resolveItemChannel(primaryItem, channelById);
}

export function getInboxTypeLabel(item: InboxItem): InboxTypeLabel {
  const channelName = item.channelLabel;

  if (item.groupItems.some(isProjectInboxItem)) {
    const root = projectRootItem(item.item, item.groupItems);
    return {
      text: projectTypeLabel(root),
      channelLabel: null,
    };
  }

  if (item.item.channelType === "dm") {
    return {
      text: item.senderLabel ? msg`DM from ${item.senderLabel}` : msg`DM`,
      channelLabel: null,
    };
  }

  const primaryCategory = item.item.category;
  // The channel name is a separately styled chip beside this phrase, so each
  // pair has to be two messages rather than one sentence with a placeholder.
  // That fixes the order as "<phrase> <channel>", which German takes for all
  // four of these ("Erwähnt in", "Aktion nötig in", "Thread in"). A language
  // that wants the channel first could not be served without giving up the
  // chip, and this comment is where that trade is recorded.
  if (primaryCategory === "mention") {
    return {
      text: channelName ? msg`Mentioned in` : msg`Mentioned`,
      channelLabel: channelName,
    };
  }

  if (primaryCategory === "needs_action") {
    return {
      text: channelName ? msg`Needs action in` : msg`Needs action`,
      channelLabel: channelName,
    };
  }

  if (isThreadActivityItem(item.item)) {
    return {
      text: channelName ? msg`Thread in` : msg`Thread`,
      channelLabel: channelName,
    };
  }

  return {
    text: activityHeadline(item.item),
    joinsChannel: channelName !== null,
    channelLabel: channelName,
  };
}

/**
 * Resolve copy that may be a descriptor or the person's own content.
 *
 * One helper rather than a `typeof` at every call site: a missed check reads
 * as `[object Object]` on screen, which is the kind of defect that gets found
 * by a person rather than by a gate.
 */
export function resolveInboxCopy(i18n: I18n, copy: InboxCopy): string {
  return typeof copy === "string" ? copy : i18n._(copy);
}

/** The type label as one flat string, for an `aria-label` or a title. */
export function formatInboxTypeLabel(i18n: I18n, item: InboxItem) {
  const label = getInboxTypeLabel(item);
  const text = resolveInboxCopy(i18n, label.text);
  if (!label.channelLabel) return text;
  // `joinsChannel` phrases end in the linking word already; a dynamic headline
  // does not, so it gets one here.
  const phrase = label.joinsChannel ? i18n._(msg`${text} in`) : text;
  return `${phrase} #${label.channelLabel}`;
}

function categoryPriority(category: FeedItemCategory) {
  switch (category) {
    case "needs_action":
      return 0;
    case "mention":
      return 1;
    case "agent_activity":
      return 2;
    case "activity":
      return 3;
  }
}

function getInboxThreadKey(
  item: FeedItem,
  channelById: ReadonlyMap<string, InboxChannel>,
) {
  const projectReference = getProjectInboxReference(item);
  if (projectReference) {
    return `project:${projectReference.repoAddress}:${projectReference.rootId}`;
  }

  const channelType = resolveItemChannel(item, channelById).type;
  return getInboxConversationId(
    item.tags,
    item.id,
    item.channelId,
    channelType,
    item.kind,
  );
}

function getStableConversationId(
  item: FeedItem,
  channelById: ReadonlyMap<string, InboxChannel>,
) {
  return getInboxThreadKey(item, channelById);
}

/**
 * Returns the stable conversation ID for any FeedItem or relay event. Buzz Git
 * roots include their repository coordinate; messages use the NIP-10 root,
 * parent-reply tag, then event id.
 * This is the same derivation used by `buildInboxItems` for `conversationId`.
 */
export function getInboxConversationId(
  tags: string[][],
  eventId: string,
  channelId?: string | null,
  channelType?: string,
  kind?: number,
): string {
  if (kind !== undefined) {
    const projectReference = getProjectInboxReference({
      id: eventId,
      kind,
      tags,
    });
    if (projectReference) {
      return `project:${projectReference.repoAddress}:${projectReference.rootId}`;
    }
  }

  if (channelType === "dm" && channelId) {
    return `dm:${channelId}`;
  }

  const thread = getThreadReference(tags);
  return thread.rootId ?? thread.parentId ?? eventId;
}

/** Returns the stable conversation identity for a complete Inbox feed item. */
export function getInboxItemConversationId(item: FeedItem) {
  return getInboxConversationId(
    item.tags,
    item.id,
    item.channelId,
    item.channelType,
    item.kind,
  );
}

/** Finds the Inbox row containing an event, including grouped events. */
export function findInboxItemByEventId(
  items: readonly InboxItem[],
  eventId: string,
): InboxItem | null {
  return (
    items.find((item) => item.id === eventId) ??
    items.find((item) =>
      item.groupItems.some((groupItem) => groupItem.id === eventId),
    ) ??
    null
  );
}

function formatInboxTimestamp(unixSeconds: number, locale: AppLocale) {
  return formatItemTimestamp(unixSeconds, { locale });
}

export function formatInboxFullTimestamp(
  unixSeconds: number,
  locale: AppLocale,
) {
  return localeDateTimeFormat(locale, FULL_TIME).format(
    new Date(unixSeconds * 1_000),
  );
}

export function relayEventFromFeedItem(item: FeedItem): RelayEvent {
  return {
    content: item.content,
    created_at: item.createdAt,
    id: item.id,
    kind: item.kind,
    pubkey: item.pubkey,
    sig: "",
    tags: item.tags,
  };
}

export function groupInboxItems(
  items: InboxItem[],
  {
    locale,
    nowSeconds = Date.now() / 1_000,
  }: { locale: AppLocale; nowSeconds?: number },
): InboxGroup[] {
  const groups = new Map<string, InboxItem[]>();

  for (const item of items) {
    const label = formatDayGroupLabel(item.latestActivityAt, {
      locale,
      nowSeconds,
    });

    const current = groups.get(label) ?? [];
    current.push(item);
    groups.set(label, current);
  }

  return [...groups.entries()].map(([label, groupedItems]) => ({
    label,
    items: groupedItems,
  }));
}

export function buildInboxItems({
  channels,
  currentPubkey,
  feed,
  getChannelReadAt,
  getMessageReadAt,
  getThreadReadAt,
  locale,
  profiles,
}: {
  channels?: InboxChannel[];
  currentPubkey?: string;
  feed?: HomeFeedResponse;
  /** Interface language the row labels are formatted in. */
  locale: AppLocale;
  getChannelReadAt?: (channelId: string) => number | null;
  getMessageReadAt?: (messageId: string) => number | null;
  getThreadReadAt?: (
    rootId: string,
    channelId?: string | null,
  ) => number | null;
  profiles?: UserProfileLookup;
}): InboxItem[] {
  if (!feed) {
    return [];
  }

  const feedItems = [
    ...feed.feed.mentions.map((item) => ({
      ...item,
      category: "mention" as const,
    })),
    ...feed.feed.needsAction.map((item) => ({
      ...item,
      category: "needs_action" as const,
    })),
    ...feed.feed.activity.map((item) => ({
      ...item,
      category: "activity" as const,
    })),
    ...feed.feed.agentActivity.map((item) => ({
      ...item,
      category: "agent_activity" as const,
    })),
  ];
  const channelById = new Map(
    (channels ?? []).map((channel) => [channel.id, channel]),
  );

  const threadGroups = new Map<
    string,
    {
      items: FeedItem[];
      latestActivityAt: number;
      rootItem: FeedItem | null;
    }
  >();

  for (const item of feedItems) {
    const threadKey = getInboxThreadKey(item, channelById);
    const group = threadGroups.get(threadKey) ?? {
      items: [],
      latestActivityAt: 0,
      rootItem: null,
    };

    group.items.push(item);
    group.latestActivityAt = Math.max(group.latestActivityAt, item.createdAt);
    if (item.id === getStableConversationId(item, channelById)) {
      group.rootItem = item;
    }

    threadGroups.set(threadKey, group);
  }

  return [...threadGroups.entries()]
    .sort(
      ([, left], [, right]) => right.latestActivityAt - left.latestActivityAt,
    )
    .map(([, group]) => {
      const conversationId = getStableConversationId(
        group.items[0],
        channelById,
      );
      const latestItem = group.items.reduce((latest, current) =>
        current.createdAt > latest.createdAt ? current : latest,
      );
      const groupChannel = resolveGroupChannel(
        latestItem,
        group.items,
        channelById,
      );
      const groupChannelId = group.items.find(
        (candidate) => candidate.channelId,
      )?.channelId;
      const channelReadAt =
        groupChannel.type === "dm" && groupChannelId && getChannelReadAt
          ? getChannelReadAt(groupChannelId)
          : undefined;
      const uniqueGroupItems = uniqueItemsById(group.items);
      const threadReplyItems = uniqueGroupItems.filter(isThreadReplyItem);
      const threadReadAt =
        groupChannel.type !== "dm" &&
        threadReplyItems.length > 0 &&
        getThreadReadAt
          ? getThreadReadAt(conversationId, groupChannelId)
          : undefined;
      const unreadItems = (
        channelReadAt !== undefined
          ? uniqueGroupItems.filter((candidate) =>
              isItemUnread(candidate, channelReadAt),
            )
          : threadReplyItems.length > 0 && getMessageReadAt
            ? threadReplyItems.filter((candidate) =>
                isItemUnread(candidate, null, getMessageReadAt),
              )
            : threadReadAt !== undefined
              ? threadReplyItems.filter((candidate) =>
                  isItemUnread(candidate, threadReadAt),
                )
              : []
      ).sort((left, right) => left.createdAt - right.createdAt);
      const item = unreadItems[0] ?? latestItem;
      const categories = [
        ...new Set(group.items.map((groupItem) => groupItem.category)),
      ].sort((left, right) => categoryPriority(left) - categoryPriority(right));
      const senderLabel = resolveUserLabel({
        pubkey: item.pubkey,
        currentPubkey,
        profiles,
        preferResolvedSelfLabel: true,
      });
      const subject = feedHeadline(item, group.items);
      const preview = feedPreview(item);
      const { mentionNames, mentionPubkeysByName } = resolveMentionProps(
        item.tags,
        profiles,
        item.content,
      );
      const channelLabel = groupChannel.name;
      const displayItem: FeedItem = {
        ...item,
        channelName: channelLabel ?? item.channelName,
        channelType: item.channelType ?? groupChannel.type,
      };
      const categoryLabel = categoryLabelFor(categories[0] ?? item.category);

      return {
        avatarUrl: profiles?.[item.pubkey.toLowerCase()]?.avatarUrl ?? null,
        conversationId,
        id: item.id,
        item: displayItem,
        categories,
        categoryLabel,
        channelLabel,
        fullTimestampLabel: formatInboxFullTimestamp(item.createdAt, locale),
        groupItems: group.items,
        isActionRequired: categories.includes("needs_action"),
        latestActivityAt: group.latestActivityAt,
        mentionNames: mentionNames ?? [],
        mentionPubkeysByName,
        preview,
        senderLabel,
        subject,
        timestampLabel: formatInboxTimestamp(group.latestActivityAt, locale),
        unreadCount: unreadItems.length,
      };
    });
}
