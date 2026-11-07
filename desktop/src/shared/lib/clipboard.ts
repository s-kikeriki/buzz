import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { toast } from "sonner";

import { copyTextToSystemClipboard } from "@/shared/api/tauriMedia";

/**
 * Write text through the native clipboard integration.
 *
 * `html` is an optional richer flavor written in the same clipboard
 * transaction. External apps read `text`; Buzz reads `html` on paste to
 * recover metadata the plain flavor deliberately omits (mention pubkeys).
 */
export async function writeTextToClipboard(
  text: string,
  html?: string,
): Promise<void> {
  await copyTextToSystemClipboard(text, html);
}

/**
 * Copy text and show standard success/error feedback.
 *
 * `successMessage` has no prose default any more. A default argument is a
 * hardcoded string the coverage detector does not look at, so this one — and
 * the failure toast below, which is a bare call argument — stayed English
 * through every tranche while the gate reported this file clean. The
 * fallbacks resolve inside the callbacks, i.e. after the copy settles, never
 * at module load.
 */
export function copyTextToClipboard(
  text: string,
  successMessage?: string,
  html?: string,
) {
  void writeTextToClipboard(text, html)
    .then(() => {
      toast.success(successMessage ?? i18n._(msg`Copied to clipboard`));
    })
    .catch(() => {
      toast.error(i18n._(msg`Failed to copy to clipboard`));
    });
}
