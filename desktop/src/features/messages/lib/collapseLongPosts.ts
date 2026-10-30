/**
 * When a long top-level post collapses, and what a click on one means.
 *
 * Kept out of the components so both halves are testable without a DOM
 * render: the decision about which click opens a thread is the part with the
 * edge cases, and every one of them is a real interaction someone will have.
 */

/**
 * How many lines of body text a collapsed post shows.
 *
 * Six, as a count of *lines* rather than of characters or pixels. A character
 * budget cuts a post with three short paragraphs and one with a single long
 * one at completely different heights, which is the thing the reader actually
 * notices; and a pixel budget stops being six lines the moment somebody
 * changes the font-size preference or presses Cmd-+.
 *
 * The clamp itself is CSS — `calc(var(--collapsed-post-lines) *
 * var(--conversation-message-line-height))` — so it follows the type scale
 * rather than freezing against it. This constant exists so the number appears
 * once and the tests can name it.
 */
export const COLLAPSED_POST_LINES = 6;

/**
 * Elements whose own click is not "open this post's thread".
 *
 * Ian's rule is "links, reactions and buttons keep working", and the way to
 * keep that true as the message body grows new widgets is to ask what the
 * click landed *on* rather than to maintain a list of what a post may
 * contain. Anything that is itself operable handles its own click.
 *
 * `[data-no-thread-open]` is the escape hatch for a widget that is not
 * natively operable but handles pointer events itself — an image lightbox
 * trigger, a diff row — so it can opt out without this list learning about it.
 */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "audio",
  "button",
  "input",
  "label",
  "select",
  "summary",
  "textarea",
  "video",
  "[contenteditable]:not([contenteditable=false])",
  "[data-no-thread-open]",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(",");

/** The subset of a pointer event this decision needs. Keeps the tests honest. */
export type PostClickEvent = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
};

/** The subset of a selection this decision needs. */
export type PostClickSelection = {
  isCollapsed: boolean;
  toString: () => string;
} | null;

/**
 * Whether a click on a collapsed post should open its thread.
 *
 * Four reasons it should not, and each one is a complaint waiting to happen:
 *
 *  1. **It landed on something operable.** The link, the reaction, the
 *     attachment's own control. Those keep working, which was the explicit
 *     requirement.
 *  2. **It is not a plain primary click.** A middle click or Cmd-click on a
 *     post is how someone opens a link in a new window; a Shift-click is how
 *     they extend a selection. Swallowing those to open a thread takes an
 *     action away and gives back one nobody asked for.
 *  3. **It finished a text selection.** Dragging across three lines of a post
 *     to copy them ends in a `click` on the post. Opening a thread there
 *     throws away the selection the person just made — and because the thread
 *     pane shows the same text, it looks like the app ate it.
 *  4. **There is nothing to open.** A pending message has no id a thread can
 *     be keyed to yet.
 */
export function shouldOpenThreadFromPostClick(
  event: PostClickEvent,
  selection: PostClickSelection,
): boolean {
  if (event.button !== 0) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (selection && !selection.isCollapsed && selection.toString().length > 0) {
    return false;
  }
  const target = event.target;
  if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
    return false;
  }
  return true;
}

/** The subset of a message this decision needs. */
export type CollapsiblePost = {
  depth?: number;
  id: string;
  pending?: boolean;
};

/**
 * Whether this post is one the channel pane may collapse.
 *
 * Top-level only. A thread reply is already inside the thread, so collapsing
 * it would hide text behind a click that opens the pane the reader is in.
 *
 * A pending message is left alone too: it has no durable id yet, so the click
 * would have no thread to open, and its text is the thing its author is
 * watching to confirm the send worked.
 */
export function isCollapsiblePost(message: CollapsiblePost): boolean {
  if (message.pending) return false;
  return (message.depth ?? 0) === 0;
}
