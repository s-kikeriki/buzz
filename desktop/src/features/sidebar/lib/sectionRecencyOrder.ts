import type { Channel } from "@/shared/api/types";
import type { ChannelSection } from "./channelSectionsStorage";

/**
 * Newest message time across `channels`, or `null` when none of them has any
 * activity. Unparseable timestamps are treated as no activity.
 */
export function latestChannelActivityMs(
  channels: readonly Channel[],
): number | null {
  let latest: number | null = null;
  for (const channel of channels) {
    if (!channel.lastMessageAt) continue;
    const ms = Date.parse(channel.lastMessageAt);
    if (!Number.isFinite(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

/**
 * Orders one sibling group of sections newest-first.
 *
 * Sections whose channels carry no activity sink to the bottom and keep the
 * order the user dragged them into, so an empty section never jumps around.
 * The stored order is also the tie-breaker, which makes the result stable for
 * sections that share a timestamp.
 */
export function orderSectionsByRecency(
  sections: readonly ChannelSection[],
  latestFor: (sectionId: string) => number | null,
): ChannelSection[] {
  const storedIndex = new Map(
    sections.map((section, index) => [section.id, index]),
  );
  return [...sections].sort((left, right) => {
    const leftMs = latestFor(left.id);
    const rightMs = latestFor(right.id);
    if (leftMs !== null && rightMs !== null && leftMs !== rightMs) {
      return rightMs - leftMs;
    }
    if (leftMs !== null && rightMs === null) return -1;
    if (leftMs === null && rightMs !== null) return 1;
    return (storedIndex.get(left.id) ?? 0) - (storedIndex.get(right.id) ?? 0);
  });
}
