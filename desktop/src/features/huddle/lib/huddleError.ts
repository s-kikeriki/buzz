import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type HuddleAction = "join" | "start";

/**
 * A descriptor, not a string: this module is imported by six call sites and
 * read at module load, so a resolved string would be fixed to whichever
 * locale was active then — which, at import time, is none.
 */
const HUDDLE_AUDIO_UNAVAILABLE_MESSAGE = msg`Huddle audio isn’t available on this server. Ask an administrator to turn it on.`;

function rawErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return null;
}

export function formatHuddleActionError(
  error: unknown,
  action: HuddleAction,
): string {
  const message = rawErrorMessage(error)?.trim();
  const normalized = message?.toLowerCase();

  if (
    normalized?.includes("huddle_audio_unavailable") ||
    normalized?.includes("huddle audio unavailable in this deployment")
  ) {
    return i18n._(HUDDLE_AUDIO_UNAVAILABLE_MESSAGE);
  }

  // Deliberately not translated: this is the relay's own message, passed
  // through verbatim. Translating it is not possible from here, and
  // paraphrasing it would lose the detail the person needs.
  if (message) {
    return message;
  }

  return action === "join"
    ? i18n._(msg`Couldn’t join the huddle.`)
    : i18n._(msg`Couldn’t start the huddle.`);
}
