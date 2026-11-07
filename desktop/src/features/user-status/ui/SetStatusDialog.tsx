import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as React from "react";
import { localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";
import { useLocale } from "@/shared/lib/localePreference";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  SmilePlus,
} from "lucide-react";

import { EmojiPicker } from "@/features/custom-emoji/ui/EmojiPicker";
import {
  DEFAULT_USER_STATUS_EMOJI,
  StatusEmoji,
} from "@/features/user-status/ui/StatusEmoji";
import type { UserStatusInput } from "@/features/user-status/types";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Calendar } from "@/shared/ui/calendar";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import { Dialog } from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

/**
 * Quick-status suggestions.
 *
 * `id` is the slug the row's `data-testid` is built from. It used to be derived
 * from the displayed text (`preset.text.toLowerCase().replace(/\s+/g, "-")`),
 * which makes the DOM change with the locale: a German app would have rendered
 * `set-status-preset-im-meeting` and every selector binding the English slug
 * would have gone looking for an element that no longer exists. The slugs here
 * are exactly the ones that derivation produced in English, so the ids are now
 * locale-independent without moving any existing selector.
 *
 * `label` is a descriptor rather than a string because this table lives at
 * module scope: resolving it here would freeze the English copy into the
 * module the first time it is imported, before any catalogue is active.
 *
 * Clicking a preset puts its label in the status *text*, which is free-form
 * copy the user then publishes, so a German user publishes German words.
 */
export const PRESETS: readonly {
  id: string;
  label: MessageDescriptor;
  emoji: string;
}[] = [
  { id: "in-a-meeting", label: msg`In a meeting`, emoji: "\uD83D\uDDE3\uFE0F" },
  { id: "commuting", label: msg`Commuting`, emoji: "\uD83D\uDE8C" },
  { id: "out-sick", label: msg`Out sick`, emoji: "\uD83E\uDD12" },
  { id: "vacationing", label: msg`Vacationing`, emoji: "\uD83C\uDFD6\uFE0F" },
  {
    id: "working-remotely",
    label: msg`Working remotely`,
    emoji: "\uD83C\uDFE0",
  },
];

/**
 * Expiry choices.
 *
 * The displayed label used to *be* the state value: `DurationLabel` was
 * `"1 hour" | "8 hours" | \u2026`, `expirationUnixSeconds` switched on it and
 * `inferredDuration` returned one. Translating those literals would have
 * changed the discriminator with the locale and left the switch with no
 * matching case, so the id and the label are separate now \u2014 the id is what the
 * component compares, the label is only ever rendered.
 */
export const DURATION_OPTIONS: readonly {
  id: DurationId;
  label: MessageDescriptor;
}[] = [
  { id: "1-hour", label: msg`1 hour` },
  { id: "8-hours", label: msg`8 hours` },
  { id: "today", label: msg`Today` },
  { id: "this-week", label: msg`This week` },
  { id: "custom", label: msg`Custom` },
];

export type DurationId =
  | "1-hour"
  | "8-hours"
  | "today"
  | "this-week"
  | "custom";

export function durationLabel(i18n: I18n, id: DurationId): string {
  const option = DURATION_OPTIONS.find((candidate) => candidate.id === id);
  return option ? i18n._(option.label) : id;
}

/** Half-hour marks of a day, as `HH:mm` values with no display copy attached. */
const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;
  return {
    hour,
    minute,
    value: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
  };
});

/**
 * Labels the half-hour marks in the app's locale.
 *
 * These labels were a hand-rolled 12-hour clock (`${hour % 12 || 12}:${minute}
 * ${hour < 12 ? "AM" : "PM"}`), so a German app offered "1:30 PM" in a menu
 * whose own trigger already fell back to `formattedTime` \u2014 the same two
 * formats in one control. Both sides go through `formattedTime` now, which is
 * 24-hour in German. For `en-US` the output is identical to the hand-rolled
 * string at all 48 marks, midnight and noon included.
 */
export function halfHourTimes(locale: AppLocale) {
  const atHalfHour = new Date();
  return HALF_HOUR_SLOTS.map((slot) => {
    const at = new Date(atHalfHour);
    at.setHours(slot.hour, slot.minute, 0, 0);
    return { value: slot.value, label: formattedTime(at, locale) };
  });
}

type SetStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  initialEmoji?: string;
  initialExpiresAt?: number;
  initialUpdatedAt?: number;
  onSave: (status: UserStatusInput) => void;
  onClear: () => void;
  hasExistingStatus: boolean;
};

function roundUpToHalfHour(value: Date) {
  const date = new Date(value);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30);
  return date;
}

function defaultCustomDate() {
  return roundUpToHalfHour(new Date(Date.now() + 24 * 60 * 60 * 1_000));
}

function toLocalTimeValue(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function formattedTime(date: Date, locale: AppLocale) {
  return localeDateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function endOfToday(from: Date) {
  const end = new Date(from);
  end.setHours(24, 0, 0, 0);
  return end;
}

function endOfWeek(from: Date) {
  const end = new Date(from);
  const daysUntilMonday = (8 - end.getDay()) % 7 || 7;
  end.setDate(end.getDate() + daysUntilMonday);
  end.setHours(0, 0, 0, 0);
  return end;
}

export function inferredDuration(
  expiresAt: number | undefined,
  updatedAt: number | undefined,
): DurationId {
  if (!expiresAt || expiresAt * 1_000 <= Date.now()) return "today";
  if (!updatedAt) return "custom";

  const expiration = expiresAt * 1_000;
  const updated = updatedAt * 1_000;
  const withinTwoMinutes = (expected: number) =>
    Math.abs(expiration - expected) <= 2 * 60_000;
  if (withinTwoMinutes(updated + 60 * 60_000)) return "1-hour";
  if (withinTwoMinutes(updated + 8 * 60 * 60_000)) return "8-hours";
  if (withinTwoMinutes(endOfToday(new Date(updated)).getTime())) return "today";
  if (withinTwoMinutes(endOfWeek(new Date(updated)).getTime())) {
    return "this-week";
  }
  return "custom";
}

function withCustomDate(current: Date, selected: Date) {
  const next = new Date(current);
  next.setFullYear(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate(),
  );
  return next;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formattedDate(date: Date, locale: AppLocale) {
  return localeDateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function withCustomTime(current: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return current;
  const next = new Date(current);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function StatusSection({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1.5", className)}>
      {label ? (
        <h3 className="px-1 text-xs font-medium text-muted-foreground">
          {label}
        </h3>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-muted/20">
        {children}
      </div>
    </section>
  );
}

const ROW_CLASS =
  "flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50";

export function SetStatusDialog({
  open,
  onOpenChange,
  initialText = "",
  initialEmoji = "",
  initialExpiresAt,
  initialUpdatedAt,
  onSave,
  onClear,
  hasExistingStatus,
}: SetStatusDialogProps) {
  const { i18n, t } = useLingui();
  const locale = useLocale();
  const timeOptions = React.useMemo(() => halfHourTimes(locale), [locale]);
  const [text, setText] = React.useState(initialText);
  const [emoji, setEmoji] = React.useState(initialEmoji);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [duration, setDuration] = React.useState<DurationId>("today");
  const [customUntil, setCustomUntil] = React.useState(defaultCustomDate);
  const [durationTouched, setDurationTouched] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [baseline, setBaseline] = React.useState(() => ({
    text: initialText,
    emoji: initialEmoji,
    expiresAt: initialExpiresAt,
    duration: null as DurationId | null,
    customUntil: null as Date | null,
    hasExistingStatus,
  }));
  const initializedForOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      initializedForOpenRef.current = false;
      return;
    }
    if (initializedForOpenRef.current) return;
    initializedForOpenRef.current = true;
    setText(initialText);
    setEmoji(initialEmoji);
    const currentExpiration = initialExpiresAt
      ? new Date(initialExpiresAt * 1_000)
      : null;
    if (currentExpiration && currentExpiration.getTime() > Date.now()) {
      const nextDuration = inferredDuration(initialExpiresAt, initialUpdatedAt);
      setDuration(nextDuration);
      setCustomUntil(currentExpiration);
      setBaseline({
        text: initialText,
        emoji: initialEmoji,
        expiresAt: initialExpiresAt,
        duration: nextDuration,
        customUntil: currentExpiration,
        hasExistingStatus,
      });
    } else {
      setDuration("today");
      const nextCustomUntil = defaultCustomDate();
      setCustomUntil(nextCustomUntil);
      setBaseline({
        text: initialText,
        emoji: initialEmoji,
        expiresAt: undefined,
        duration: null,
        customUntil: null,
        hasExistingStatus,
      });
    }
    setDurationTouched(false);
    setSaveError("");
  }, [
    open,
    initialText,
    initialEmoji,
    initialExpiresAt,
    initialUpdatedAt,
    hasExistingStatus,
  ]);

  const hasContent = Boolean(text.trim() || emoji);
  const effectiveEmoji =
    emoji || (text.trim() ? DEFAULT_USER_STATUS_EMOJI : "");
  const initialEffectiveEmoji =
    baseline.emoji || (baseline.text.trim() ? DEFAULT_USER_STATUS_EMOJI : "");
  const isDirty =
    text.trim() !== baseline.text.trim() ||
    effectiveEmoji !== initialEffectiveEmoji ||
    durationTouched ||
    (duration === "custom" &&
      baseline.duration === "custom" &&
      baseline.customUntil !== null &&
      customUntil.getTime() !== baseline.customUntil.getTime());
  function expirationUnixSeconds(now = new Date()): number | undefined {
    if (
      !durationTouched &&
      baseline.hasExistingStatus &&
      baseline.expiresAt !== undefined
    ) {
      return baseline.expiresAt;
    }
    const expiresAt = (() => {
      switch (duration) {
        case "1-hour":
          return new Date(now.getTime() + 60 * 60_000);
        case "8-hours":
          return new Date(now.getTime() + 8 * 60 * 60_000);
        case "today":
          return endOfToday(now);
        case "this-week":
          return endOfWeek(now);
        case "custom":
          return customUntil;
      }
    })();
    return Math.floor(expiresAt.getTime() / 1_000);
  }

  const displayedExpiration = expirationUnixSeconds();
  const expirationIsFuture =
    displayedExpiration === undefined ||
    displayedExpiration > Math.floor(Date.now() / 1_000);
  const canSave = hasContent && isDirty && expirationIsFuture;

  function handlePresetClick(preset: {
    label: MessageDescriptor;
    emoji: string;
  }) {
    setText(i18n._(preset.label));
    setEmoji(preset.emoji);
  }

  function handleEmojiSelect(selectedEmoji: string) {
    setEmoji(selectedEmoji);
    setPickerOpen(false);
  }

  function handleSave() {
    if (!hasContent || !isDirty) return;
    const expiresAt = expirationUnixSeconds();
    if (
      expiresAt !== undefined &&
      expiresAt <= Math.floor(Date.now() / 1_000)
    ) {
      setSaveError(t`Choose a duration in the future.`);
      return;
    }
    onSave({
      text: text.trim(),
      emoji: effectiveEmoji,
      expiresAt,
    });
    onOpenChange(false);
  }

  function handleClear() {
    onClear();
    onOpenChange(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ChooserDialogContent
        className="sm:max-w-[420px]"
        contentClassName="space-y-4 pt-3"
        data-testid="set-status-dialog"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {baseline.hasExistingStatus ? (
              <Button
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                data-testid="set-status-clear"
                onClick={handleClear}
                type="button"
                variant="ghost"
              >
                <Trans>Clear status</Trans>
              </Button>
            ) : (
              <span />
            )}
            <Button
              aria-label={t`Save status`}
              data-testid="set-status-save"
              disabled={!canSave}
              onClick={handleSave}
              type="button"
            >
              <Trans>Save status</Trans>
            </Button>
          </div>
        }
        footerClassName="border-t-0 pt-0"
        headerClassName="pb-2"
        headerSubtitle={t`Let others know what you're up to.`}
        title={t`Set a status`}
      >
        <div className="flex min-h-12 items-stretch rounded-xl border border-input focus-within:ring-1 focus-within:ring-ring">
          <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
            <div className="shrink-0">
              <PopoverTrigger asChild>
                <button
                  aria-label={t`Choose a status emoji`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                  type="button"
                >
                  {effectiveEmoji ? (
                    <StatusEmoji className="h-5 w-5" value={effectiveEmoji} />
                  ) : (
                    <SmilePlus className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
              </PopoverTrigger>
            </div>
            <PopoverContent
              align="start"
              className="w-auto overflow-hidden rounded-2xl p-0"
              sideOffset={4}
            >
              <EmojiPicker autoFocus onSelect={handleEmojiSelect} />
            </PopoverContent>
          </Popover>
          <input
            className="min-w-0 flex-1 bg-transparent px-1 pr-3 text-base outline-none placeholder:text-muted-foreground"
            data-testid="set-status-input"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t`What’s your status?`}
            value={text}
          />
        </div>

        <StatusSection label={t`Duration`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={ROW_CLASS}
                data-testid="set-status-duration"
                type="button"
              >
                <Clock3 className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">
                  <Trans>Duration</Trans>
                </span>
                <span className="text-muted-foreground">
                  {durationLabel(i18n, duration)}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {DURATION_OPTIONS.map((option) => (
                <DropdownMenuItem
                  className="justify-between"
                  key={option.id}
                  onSelect={() => {
                    setDuration(option.id);
                    setDurationTouched(true);
                    setSaveError("");
                  }}
                >
                  {i18n._(option.label)}
                  {duration === option.id ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {duration === "custom" ? (
            <div className={ROW_CLASS}>
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <span>
                <Trans>Until</Trans>
              </span>
              <Popover onOpenChange={setCalendarOpen} open={calendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-label={t`Status expiration date`}
                    className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    type="button"
                  >
                    <span className="truncate">
                      {formattedDate(customUntil, locale)}
                    </span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    disabled={{ before: startOfToday() }}
                    mode="single"
                    onSelect={(selected) => {
                      if (!selected) return;
                      setDurationTouched(true);
                      setSaveError("");
                      setCustomUntil((current) =>
                        withCustomDate(current, selected),
                      );
                      setCalendarOpen(false);
                    }}
                    selected={customUntil}
                  />
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t`Status expiration time`}
                    className="flex h-9 w-28 shrink-0 items-center rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    type="button"
                  >
                    <span>
                      {timeOptions.find(
                        (time) => time.value === toLocalTimeValue(customUntil),
                      )?.label ?? formattedTime(customUntil, locale)}
                    </span>
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-[23rem]"
                  data-testid="status-expiration-time-menu"
                  style={{
                    minWidth: "var(--radix-dropdown-menu-trigger-width)",
                  }}
                >
                  {timeOptions.map((time) => (
                    <DropdownMenuItem
                      className="justify-between"
                      key={time.value}
                      onSelect={() => {
                        setDurationTouched(true);
                        setSaveError("");
                        setCustomUntil((current) =>
                          withCustomTime(current, time.value),
                        );
                      }}
                    >
                      {time.label}
                      {time.value === toLocalTimeValue(customUntil) ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {saveError || (!expirationIsFuture && isDirty) ? (
            <p className="px-3 py-2 text-xs text-destructive" role="alert">
              {saveError || t`Choose a duration in the future.`}
            </p>
          ) : null}
        </StatusSection>

        {!baseline.hasExistingStatus ? (
          <StatusSection label={t`Quick statuses`}>
            {PRESETS.map((preset) => (
              <button
                className={ROW_CLASS}
                data-testid={`set-status-preset-${preset.id}`}
                key={preset.id}
                onClick={() => handlePresetClick(preset)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex w-5 justify-center text-lg"
                >
                  {preset.emoji}
                </span>
                <span>{i18n._(preset.label)}</span>
              </button>
            ))}
          </StatusSection>
        ) : null}
      </ChooserDialogContent>
    </Dialog>
  );
}
