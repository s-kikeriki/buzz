import { Plural } from "@lingui/react/macro";

/**
 * Unread-thread count shown beside a sidebar section's title. It sits inside
 * the collapse button so the section keeps one accessible label, and renders
 * nothing at zero.
 *
 * The screen-reader suffix is a `Plural`, not a conditional `"s"`. English
 * pluralises by appending a letter; German does not ("Thread" / "Threads" is
 * a coincidence, but the article and adjective in front of it decline), and
 * other locales have more than two forms. Spelling both out keeps the choice
 * in the catalogue where a translator can see it.
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
      <span className="sr-only">
        {" "}
        <Plural value={count} one="unread thread" other="unread threads" />
      </span>
    </span>
  );
}
