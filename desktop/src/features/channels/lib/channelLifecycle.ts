import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { formatTtlDuration } from "@/features/channels/lib/ephemeralChannel";

export type ChannelLifecycle = "ongoing" | "temporary" | "project";

export function channelLifecycle(input: {
  projectHome: boolean;
  temporary: boolean;
}): ChannelLifecycle {
  if (input.projectHome) return "project";
  return input.temporary ? "temporary" : "ongoing";
}

/**
 * `i18n` is a required parameter, not a module import: this helper is called
 * from a render path, and a default would let a future caller resolve the
 * label once at module scope and freeze it in the boot locale.
 */
export function channelLifecycleLabel(
  i18n: I18n,
  lifecycle: ChannelLifecycle,
  ttlSeconds: number | null,
): string {
  if (lifecycle === "project") return i18n._(msg`Project`);
  if (lifecycle === "temporary" && ttlSeconds != null) {
    const duration = formatTtlDuration(ttlSeconds);
    return i18n._(msg`Temporary · ${duration}`);
  }
  if (lifecycle === "temporary") return i18n._(msg`Temporary`);
  return i18n._(msg`Ongoing`);
}
