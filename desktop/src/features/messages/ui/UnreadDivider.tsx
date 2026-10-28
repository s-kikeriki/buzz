/**
 * Inline "New" divider rendered directly above the oldest unread top-level
 * message, mirroring Slack's read/unread boundary. Computed from the
 * channel's read frontier as it stood when the channel was opened.
 */
export function UnreadDivider() {
  return (
    <section
      aria-label="New messages"
      className="relative flex items-center py-1"
      data-testid="message-unread-divider"
    >
      <div className="h-px flex-1 bg-primary-fill/50" />
      {/* A filled pill rather than accent-coloured text. The accent read as
          text has to darken to stay legible on a light background, which for
          a light-only brand colour means the boundary is drawn in a colour
          the brand does not have. Ink on the accent is legible at any
          lightness, so the mark keeps the real colour. */}
      <span className="shrink-0 rounded-full bg-primary-fill px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.04em] text-primary-fill-foreground">
        New
      </span>
      <div className="h-px flex-1 bg-primary-fill/50" />
    </section>
  );
}
