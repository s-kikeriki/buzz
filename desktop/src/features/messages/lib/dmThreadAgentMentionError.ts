import { t } from "@lingui/core/macro";

import { normalizePubkey } from "@/shared/lib/pubkey";
import type { ChannelType } from "@/shared/api/types";

/**
 * Both messages are resolved per call with the global `t` macro rather than
 * held as module constants: this module is imported at load time, so a
 * resolved constant would freeze in whichever locale booted. The callers are
 * a `useCallback` body and a toast, neither of which is a render path a hook
 * could hang off.
 */
function dmThreadAgentMentionMessage(): string {
  return t`Agents must already be in a DM to be mentioned in its threads. Start a new conversation that includes the agent.`;
}

function dmThreadMembersLoadingMessage(): string {
  return t`Checking conversation members. Try again in a moment.`;
}

/**
 * Why a DM thread reply may not mention an agent, or null when it may.
 *
 * A DM's participant set is fixed at creation, so a thread reply can only
 * mention agents already in it — persona mentions (which would create a new
 * agent) are always refused.
 */
export function dmThreadAgentMentionError({
  trimmed,
  isThreadReply,
  channelType,
  extractMentionPersonas,
  extractMentionPubkeys,
  isAgentPubkey,
  hasResolvedMembers,
  memberPubkeys,
}: {
  trimmed: string;
  isThreadReply: boolean;
  channelType: ChannelType | null;
  extractMentionPersonas: (text: string) => unknown[];
  extractMentionPubkeys: (text: string) => string[];
  isAgentPubkey: (pubkey: string) => boolean;
  hasResolvedMembers: boolean;
  memberPubkeys: ReadonlySet<string>;
}): string | null {
  if (channelType !== "dm" || !isThreadReply) {
    return null;
  }

  if (extractMentionPersonas(trimmed).length > 0) {
    return dmThreadAgentMentionMessage();
  }

  const agentPubkeys = extractMentionPubkeys(trimmed).filter(isAgentPubkey);
  if (agentPubkeys.length === 0) {
    return null;
  }

  if (!hasResolvedMembers) {
    return dmThreadMembersLoadingMessage();
  }

  return agentPubkeys.some(
    (pubkey) => !memberPubkeys.has(normalizePubkey(pubkey)),
  )
    ? dmThreadAgentMentionMessage()
    : null;
}
