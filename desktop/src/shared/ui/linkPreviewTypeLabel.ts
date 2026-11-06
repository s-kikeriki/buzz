import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { SupportedLinkPreview } from "@/shared/lib/linkPreview";

/**
 * The noun a link-preview card uses for what it points at, translated.
 *
 * `SupportedLinkPreview.typeLabel` stays a closed union of English tokens:
 * the parser assigns it, the type checks it, and the preview renderer and its
 * tests switch on it. But it is also rendered verbatim — the card's
 * `aria-label` and its screen-reader twin both read "Open {provider}
 * {typeLabel}: {title}" — so a German card announced "Open Buzz Review"
 * with two English words in the middle of a German sentence.
 *
 * The token is the key; this is where it becomes copy. Same shape as
 * `managedAgentRuntimeStatus`, whose status token the badge translates at the
 * render site rather than at the source.
 */
export function linkPreviewTypeLabel(
  typeLabel: SupportedLinkPreview["typeLabel"],
  i18n: I18n,
): string {
  switch (typeLabel) {
    case "PR":
      return i18n._(msg`PR`);
    case "issue":
      return i18n._(msg`issue`);
    case "Review":
      return i18n._(msg`Review`);
    case "Task":
      return i18n._(msg`Task`);
    case "repo":
      return i18n._(msg`repo`);
    case "project":
      return i18n._(msg`project`);
    case "file":
      return i18n._(msg`file`);
    case "folder":
      return i18n._(msg`folder`);
    case "document":
      return i18n._(msg`document`);
    case "spreadsheet":
      return i18n._(msg`spreadsheet`);
    case "presentation":
      return i18n._(msg`presentation`);
    case "link":
      return i18n._(msg`link`);
  }
}
