import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { getChannelDetail } from "@/features/channels/lib/channelDescription";
import { isEphemeralChannel } from "@/features/channels/lib/ephemeralChannel";
import type { TimelineMessage } from "@/features/messages/types";
import type { TypingIndicatorEntry } from "@/features/messages/useChannelTyping";
import type { Channel } from "@/shared/api/types";
import { KIND_SYSTEM_MESSAGE } from "@/shared/constants/kinds";

export function shouldUseFocusIdleDrawer({
  channelManagementOpen,
  hasAgentSession,
  hasIdleAuxiliaryPanel,
  hasIdlePanelCloseHandler,
  hasProfilePanel,
  hasThreadSurface,
  overrideThread = false,
  useSplitAuxiliaryPane,
}: {
  channelManagementOpen: boolean;
  hasAgentSession: boolean;
  hasIdleAuxiliaryPanel: boolean;
  hasIdlePanelCloseHandler: boolean;
  hasProfilePanel: boolean;
  hasThreadSurface: boolean;
  overrideThread?: boolean;
  useSplitAuxiliaryPane: boolean;
}): boolean {
  return (
    (useSplitAuxiliaryPane || overrideThread) &&
    !channelManagementOpen &&
    !hasAgentSession &&
    !hasProfilePanel &&
    (!hasThreadSurface || overrideThread) &&
    hasIdleAuxiliaryPanel &&
    hasIdlePanelCloseHandler
  );
}

/**
 * The channel-kind noun phrase shown in the intro block.
 *
 * Returns a descriptor, not a string: callers build it inside a `useMemo` and
 * resolve it on render, so a resolved string here would freeze in whichever
 * locale was active when the memo last recomputed.
 *
 * Every one of these phrases appears in exactly one frame — "This is the
 * beginning of the …" in `ChannelIntroBlock` — and nowhere else. German puts
 * that frame in the genitive, so each translation is the **genitive** noun
 * phrase ("des privaten Kanals"), which is why each descriptor carries a
 * translator comment saying so. If a second call site ever needs the
 * nominative, split the messages rather than loosening the translation.
 */
export function getChannelIntroKind(
  channel: Channel,
  projectHome = false,
): MessageDescriptor {
  if (projectHome) {
    return msg({
      message: "project channel",
      comment:
        'Only ever read inside "This is the beginning of the {kind}." — translate as the genitive form that frame needs.',
    });
  }

  const isPrivate = channel.visibility === "private";
  const isEphemeral = isEphemeralChannel(channel);

  if (isPrivate && isEphemeral) {
    return msg({
      message: "private ephemeral channel",
      comment:
        'Only ever read inside "This is the beginning of the {kind}." — translate as the genitive form that frame needs.',
    });
  }
  if (isPrivate) {
    return msg({
      message: "private channel",
      comment:
        'Only ever read inside "This is the beginning of the {kind}." — translate as the genitive form that frame needs.',
    });
  }
  if (isEphemeral) {
    return msg({
      message: "ephemeral channel",
      comment:
        'Only ever read inside "This is the beginning of the {kind}." — translate as the genitive form that frame needs.',
    });
  }
  return msg({
    message: "regular channel",
    comment:
      'Only ever read inside "This is the beginning of the {kind}." — translate as the genitive form that frame needs.',
  });
}

export function getChannelIntroDescription(channel: Channel): string | null {
  return getChannelDetail(channel);
}

/** Whether a caller-owned auxiliary sheet should render ahead of a thread. */
export function shouldPrioritizeIdleAuxiliary(
  overrideThread: boolean,
  hasIdleAuxiliary: boolean,
) {
  return overrideThread && hasIdleAuxiliary;
}

export function isWelcomeSetupSystemMessage(message: TimelineMessage) {
  if (message.kind !== KIND_SYSTEM_MESSAGE) {
    return false;
  }

  try {
    const payload = JSON.parse(message.body) as { type?: string };
    return (
      payload.type === "channel_created" || payload.type === "member_joined"
    );
  } catch {
    return false;
  }
}

export function isChannelCreatedSystemMessage(message: TimelineMessage) {
  if (message.kind !== KIND_SYSTEM_MESSAGE) {
    return false;
  }

  try {
    return (
      (JSON.parse(message.body) as { type?: string }).type === "channel_created"
    );
  } catch {
    return false;
  }
}

export function mentionsKnownAgent(
  mentionPubkeys: string[],
  knownAgentPubkeys: ReadonlySet<string>,
) {
  return mentionPubkeys.some((pubkey) =>
    knownAgentPubkeys.has(pubkey.toLowerCase()),
  );
}

export function selectThreadComposerBotTypingPubkeys(
  entries: TypingIndicatorEntry[],
  threadHeadId: string | null,
) {
  if (!threadHeadId) return [];
  return entries
    .filter((entry) => entry.threadHeadId === threadHeadId)
    .map((entry) => entry.pubkey)
    .filter(
      (pubkey, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLowerCase() === pubkey.toLowerCase(),
        ) === index,
    );
}
