import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { Channel } from "@/shared/api/types";

/** The authored channel detail shown consistently across channel surfaces. */
export function getChannelDetail(channel: Channel): string | null {
  return (
    [channel.topic, channel.description, channel.purpose]
      .find((value) => value && value.trim().length > 0)
      ?.trim() ?? null
  );
}

/**
 * The channel tooltip, with its status prefixes and fallbacks translated.
 *
 * `i18n` is a required parameter rather than a module import: this helper is
 * called from a render path, and a default would silently let a future caller
 * resolve the copy once at module scope and freeze it in the boot locale.
 */
export function getChannelDescription(
  channel: Channel | null,
  i18n: I18n,
): string {
  if (!channel) {
    return i18n._(
      msg`Connect to the relay to browse channels and read messages.`,
    );
  }

  const prefixes = [
    channel.archivedAt ? i18n._(msg`Archived.`) : null,
    !channel.isMember
      ? i18n._(msg`Read-only until you join this open channel.`)
      : null,
  ].filter((value) => value && value.trim().length > 0);

  // Show only the first non-empty field to avoid duplication when
  // topic, description, and purpose contain overlapping text.
  const detail = getChannelDetail(channel);

  // Join the status prefixes with spaces, but keep the detail text's own
  // line breaks intact (native `title` tooltips render newlines) and separate
  // it from the prefixes with a newline so paragraphs stay readable.
  const prefixText = prefixes.join(" ");
  const parts = [prefixText || null, detail ?? null].filter(Boolean);

  return parts.length > 0
    ? parts.join("\n")
    : i18n._(msg`Channel details and activity.`);
}
