import { t } from "@lingui/core/macro";

export const WAVE_MESSAGE_MARKER = "<!-- buzz:wave:v1 -->";

export type WaveMessageContent = {
  fallbackText: string;
};

export function buildWaveMessageContent(senderName: string): string {
  const trimmedName = senderName.trim() || "Someone";
  return `${WAVE_MESSAGE_MARKER}\n${trimmedName} waved at you.`;
}

export function parseWaveMessageContent(
  content: string,
): WaveMessageContent | null {
  const trimmedContent = content.trimStart();

  if (!trimmedContent.startsWith(WAVE_MESSAGE_MARKER)) {
    return null;
  }

  const fallbackText = trimmedContent.slice(WAVE_MESSAGE_MARKER.length).trim();

  return {
    // Display fallback for a wave whose body carries no text. The *outgoing*
    // text built by `buildWaveMessageContent` stays English on purpose: it is
    // event content the recipient reads, not interface copy, and translating
    // it would send the sender's locale to someone else's screen.
    fallbackText: fallbackText || t`Someone waved at you.`,
  };
}
