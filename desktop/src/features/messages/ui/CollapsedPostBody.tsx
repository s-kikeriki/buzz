import { Trans } from "@lingui/react/macro";
import * as React from "react";

import { COLLAPSED_POST_LINES } from "@/features/messages/lib/collapseLongPosts";
import { cn } from "@/shared/lib/cn";

/**
 * A post body clamped to a few lines, with a fade and a way into the thread.
 *
 * ## The clamp is always on
 *
 * `max-height` is applied whether or not the content overflows, and overflow
 * is measured *through* it as `scrollHeight > clientHeight`. The obvious
 * alternative — measure first, then clamp — renders every long post at full
 * height for one frame and collapses it on the next, which is a visible jump
 * on exactly the posts this feature exists for. A short post is shorter than
 * the clamp, so the clamp does nothing to it and costs nothing.
 *
 * ## Why a ResizeObserver rather than a measurement on mount
 *
 * The posts that most need collapsing are the ones with images in them, and
 * an image has no height until it loads. A one-shot measurement runs before
 * that and concludes the post is short, so the fade never appears and the
 * post silently loses its bottom half to `overflow: hidden` with nothing to
 * say there is more. The observer also covers a link preview resolving, a
 * code block reflowing on a pane resize, and the font-size preference
 * changing.
 */

type CollapsedPostBodyProps = {
  children: React.ReactNode;
  /** Opens this post's thread. Also what the keyboard affordance calls. */
  onOpenThread: () => void;
};

export function CollapsedPostBody({
  children,
  onOpenThread,
}: CollapsedPostBodyProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      // A sub-pixel difference is a rounding artefact of the line-height
      // calc, not content. Without the tolerance a post of exactly six lines
      // flickers a fade on and off as the pane resizes.
      setIsOverflowing(container.scrollHeight - container.clientHeight > 1);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    // Two targets, because they answer different questions: the container's
    // own box changes when the pane resizes, and the content wrapper's
    // changes when an image finishes loading inside a box that did not move.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const content = container.firstElementChild;
    if (content) observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div
        className={cn(
          "overflow-hidden",
          // The clamp and the fade both live in CSS so they follow the type
          // scale: six lines stays six lines at any font-size preference or
          // zoom level, which a pixel height would not.
          "max-h-[calc(var(--collapsed-post-lines)*var(--conversation-message-line-height))]",
          isOverflowing && "collapsed-post-fade",
        )}
        data-collapsed-post=""
        data-overflowing={isOverflowing ? "" : undefined}
        data-testid="collapsed-post-body"
        ref={containerRef}
        // The line count is set from the TypeScript constant rather than
        // declared as a global CSS token, so the number this component clamps
        // to and the number its tests assert are the same one. A token in
        // `typography.css` plus a constant here is two sources that agree
        // until somebody changes one.
        style={
          {
            "--collapsed-post-lines": COLLAPSED_POST_LINES,
          } as React.CSSProperties
        }
      >
        {/* One wrapper element, so the observer has a stable content box to
            watch and `firstElementChild` is never a text node. */}
        <div>{children}</div>
      </div>
      {isOverflowing ? (
        // The pointer affordance is the post itself — a click anywhere on it
        // opens the thread, which is handled one level up. This is the same
        // action as a real control for everyone not using a pointer: hidden
        // until focused, so it adds no chrome, and visible once focused, so
        // it is not a control that only a screen reader can find.
        <button
          className="sr-only rounded-md bg-background px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border focus-visible:not-sr-only focus-visible:absolute focus-visible:bottom-1 focus-visible:right-1 focus-visible:z-20"
          data-testid="collapsed-post-open-thread"
          onClick={onOpenThread}
          type="button"
        >
          <Trans>Open thread to read the rest</Trans>
        </button>
      ) : null}
    </div>
  );
}
