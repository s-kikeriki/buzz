import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown } from "lucide-react";

import type { InboxFilter } from "@/features/home/lib/inbox";
import { cn } from "@/shared/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * The filter names, as descriptors rather than `t` template literals.
 *
 * This is a module-level table, so a `t` here would be resolved once when the
 * module first loads and then keep whichever locale happened to be active at
 * that moment for the rest of the session. `msg` defers it; the component
 * resolves each one with `i18n._()` on render.
 */
const INBOX_FILTER_OPTIONS: Array<{
  label: MessageDescriptor;
  value: InboxFilter;
}> = [
  { value: "all", label: msg`All` },
  { value: "project", label: msg`Projects` },
  { value: "mention", label: msg`Mentions` },
  { value: "thread", label: msg`Threads` },
  { value: "needs_action", label: msg`Needs action` },
  { value: "agent_activity", label: msg`Agents` },
  { value: "reminders", label: msg`Reminders` },
  { value: "drafts", label: msg`Drafts` },
];

const TRIGGER_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/70 data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative -ml-2 w-auto gap-1 px-2 text-sm font-medium text-foreground";

type InboxFilterMenuProps = {
  activeDraftCount: number;
  dueReminderCount: number;
  filter: InboxFilter;
  onFilterChange: (value: InboxFilter) => void;
  reminderCount: number;
};

export function InboxFilterMenu({
  activeDraftCount,
  dueReminderCount,
  filter,
  onFilterChange,
  reminderCount,
}: InboxFilterMenuProps) {
  const { i18n, t } = useLingui();
  const activeFilter = INBOX_FILTER_OPTIONS.find(
    (option) => option.value === filter,
  );
  const activeLabel = i18n._(
    activeFilter?.label ?? INBOX_FILTER_OPTIONS[0].label,
  );
  // `plural`, not a conditional `"s"`. English pluralises by appending a
  // letter and German does not — "1 fällige Erinnerung" / "2 fällige
  // Erinnerungen" changes the adjective too, which no suffix rule reaches.
  const statusLabel =
    dueReminderCount > 0
      ? plural(dueReminderCount, {
          one: "# due reminder",
          other: "# due reminders",
        })
      : activeDraftCount > 0
        ? plural(activeDraftCount, {
            one: "# active draft",
            other: "# active drafts",
          })
        : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={
            statusLabel
              ? t`Filter inbox: ${activeLabel}. ${statusLabel}`
              : t`Filter inbox: ${activeLabel}`
          }
          className={cn(TRIGGER_CLASS)}
          data-testid="inbox-filter-trigger"
          type="button"
        >
          <span>{activeLabel}</span>
          <ChevronDown className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup
          onValueChange={(value) => onFilterChange(value as InboxFilter)}
          value={filter}
        >
          {INBOX_FILTER_OPTIONS.map((option) => (
            <div key={option.value}>
              {option.value === "reminders" ? (
                <DropdownMenuSeparator className="my-2 bg-border/60" />
              ) : null}
              <DropdownMenuRadioItem value={option.value}>
                <span className="flex flex-1 items-center gap-2">
                  <span>{i18n._(option.label)}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {option.value === "reminders" && reminderCount > 0 ? (
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground"
                        data-testid="inbox-reminder-badge-option"
                      >
                        {reminderCount}
                      </span>
                    ) : option.value === "drafts" && activeDraftCount > 0 ? (
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground"
                        data-testid="inbox-draft-badge-option"
                      >
                        {activeDraftCount}
                      </span>
                    ) : null}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
