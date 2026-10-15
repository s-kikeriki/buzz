/**
 * Unread-thread count shown beside a sidebar section's title. It sits inside
 * the collapse button so the section keeps one accessible label, and renders
 * nothing at zero.
 */
export function SectionUnreadThreadCount({
  count,
  sectionLabel,
}: {
  count: number;
  sectionLabel: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground tabular-nums"
      data-testid={`section-unread-threads-${sectionLabel}`}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread thread{count === 1 ? "" : "s"}</span>
    </span>
  );
}
