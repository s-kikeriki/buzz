import { t } from "@lingui/core/macro";

export type MessageLinkLabelVariant = "default" | "sent-from-thread";

/**
 * The "Thread in #channel" prefix, resolved per call.
 *
 * The global `t` macro rather than `useLingui()`: this label is built from a
 * markdown-it rule and a TipTap `renderHTML`, outside any React tree. Keeping
 * it a function (not a module constant) is what stops it freezing in the
 * locale that happened to boot.
 */
export function messageLinkPrefix(): string {
  return t`Thread in`;
}

export function getMessageLinkChannelLabel(channelName: string): string {
  return `#${channelName}`;
}

export function getMessageLinkLabel({
  channelName,
  threadExcerpt,
  variant = "default",
}: {
  channelName: string;
  threadExcerpt?: string | null;
  variant?: MessageLinkLabelVariant;
}): string {
  const normalizedExcerpt = threadExcerpt?.trim();
  const baseLabel = `${messageLinkPrefix()} ${getMessageLinkChannelLabel(channelName)}`;
  if (variant === "sent-from-thread") {
    return normalizedExcerpt ?? baseLabel;
  }
  return normalizedExcerpt ? `${baseLabel} — ${normalizedExcerpt}` : baseLabel;
}
