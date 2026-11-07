import { Trans, useLingui } from "@lingui/react/macro";
import { Clock } from "lucide-react";

import { formatTimeoutRemaining } from "@/features/moderation/lib/timeout";
import { useTimeoutState } from "@/features/moderation/lib/timeoutStore";

/**
 * A banner docked to the top edge of the composer while the member is timed
 * out by community moderators. Shows a live countdown when the expiry is known;
 * otherwise states the block without a timer (the relay gave no timestamp).
 *
 * Owns the timeout's per-second tick via {@link useTimeoutState}, so the
 * interval and the clear-at-expiry effect are scoped to this banner's lifetime.
 * Mount it behind {@link useTimeoutActive}: it renders only while a timeout is
 * active, the tick runs exactly while the countdown is on screen, and at expiry
 * the hook's effect clears the store — flipping the flag and unmounting this.
 */
export function ComposerTimeoutBanner() {
  const { i18n } = useLingui();
  const { expiresAtMs } = useTimeoutState();
  const remaining = formatTimeoutRemaining(i18n, expiresAtMs);

  return (
    <div
      className="relative z-0 mx-5 -mb-3 flex items-center gap-2 rounded-t-2xl border border-b-0 border-amber-500/30 bg-amber-500/15 px-4 pb-5 pt-2.5 text-sm leading-5 text-foreground backdrop-blur-sm"
      data-testid="composer-timeout-banner"
    >
      <Clock aria-hidden className="h-4 w-4 shrink-0 text-amber-600" />
      {/* One whole sentence per case rather than a suffix spliced onto a
          shared stem: German puts the countdown and the verb in places the
          English word order cannot express as one template. */}
      <span className="min-w-0">
        {remaining ? (
          <Trans>
            You're timed out by community moderators — {remaining} left.
          </Trans>
        ) : (
          <Trans>You're timed out by community moderators.</Trans>
        )}
      </span>
    </div>
  );
}
