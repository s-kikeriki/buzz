import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeft, Bell, Check, Clock, ExternalLink, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelReferences } from "@/features/channels/openChannelDirectory";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import {
  useRemindersQuery,
  useReminderMutations,
} from "@/features/reminders/hooks";
import { groupReminders } from "@/features/reminders/lib/reminderFilters";
import {
  hasNavigableTarget,
  resolveReminderDestination,
} from "@/features/reminders/lib/reminderNavigation";
import type { Reminder } from "@/features/reminders/lib/reminderTypes";
import { SnoozeMenu } from "@/features/reminders/ui/SnoozeMenu";
import { resolveChannelDisplayLabel } from "@/features/sidebar/lib/channelLabels";
import type { AppLocale } from "@/shared/lib/localePreference";
import { useLocale } from "@/shared/lib/localePreference";
import { formatTimeUntil } from "@/shared/lib/relativeTime";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { Channel } from "@/shared/api/types";
import { TopChromeInsetHeader } from "@/shared/layout/TopChromeInsetHeader";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/UserAvatar";

/**
 * Descriptor, not a resolved string: a module-level `i18n._()` here would
 * freeze the fallback in whichever locale booted first.
 */
const UNKNOWN_CHANNEL_LABEL = msg`Unknown channel`;

/** Author identity + source channel resolved for a reminder's target. */
export type ReminderSource = {
  authorLabel: string;
  avatarUrl: string | null;
  channel: Channel | null;
  channelLabel: string;
  isAgent?: boolean;
};

export function useReminderSources(reminders: readonly Reminder[]) {
  const { i18n } = useLingui();
  const identityQuery = useIdentityQuery();
  const currentPubkey = identityQuery.data?.pubkey;
  const channelIds = React.useMemo(
    () =>
      reminders.flatMap((reminder) => {
        const target = reminder.content.target;
        return hasNavigableTarget(target) ? [target.channelId] : [];
      }),
    [reminders],
  );
  const { channelsById } = useChannelReferences(channelIds);
  const authorPubkeys = React.useMemo(
    () =>
      reminders
        .map((reminder) => reminder.content.target?.authorPubkey)
        .filter((authorPubkey): authorPubkey is string => !!authorPubkey),
    [reminders],
  );
  const usersBatchQuery = useUsersBatchQuery(authorPubkeys);
  const profiles: UserProfileLookup | undefined =
    usersBatchQuery.data?.profiles;

  return React.useMemo(() => {
    const map = new Map<string, ReminderSource>();
    for (const reminder of reminders) {
      const target = reminder.content.target;
      if (!hasNavigableTarget(target)) continue;
      const channel = channelsById.get(target.channelId);
      map.set(reminder.id, {
        authorLabel: resolveUserLabel({
          currentPubkey,
          profiles,
          pubkey: target.authorPubkey,
        }),
        avatarUrl:
          profiles?.[normalizePubkey(target.authorPubkey)]?.avatarUrl ?? null,
        channel: channel ?? null,
        channelLabel: channel
          ? resolveChannelDisplayLabel(channel, currentPubkey, profiles)
          : i18n._(UNKNOWN_CHANNEL_LABEL),
        ...(profiles?.[normalizePubkey(target.authorPubkey)]?.isAgent === true
          ? { isAgent: true }
          : {}),
      });
    }
    return map;
  }, [channelsById, currentPubkey, i18n, profiles, reminders]);
}

/**
 * The reminder countdown.
 *
 * The forward half is `formatTimeUntil`, which exists for exactly this caller
 * — its doc comment says so — and which this panel nonetheless never called.
 * It carried a private twelfth copy of the relative-time ladder instead, built
 * the way all eleven others were: an English unit concatenated onto a number
 * (`` `in ${minutes}m` ``). That shape has no message for a catalogue to hold.
 * `Intl.RelativeTimeFormat` produces byte-identical English ("in 5m", "in 3h",
 * "in 2d") and correct German ("in 5 Min.", "in 3 Std.", "in 2 Tagen"),
 * plurals included, which is more than a hand-written message could promise.
 *
 * The overdue half stays here because "overdue" is this panel's own word —
 * `formatTimeUntil` returns null once the moment has passed and leaves the
 * wording to the caller. Each rung is a whole plural message rather than a
 * number plus a suffix: German inflects the day ("1 Tag" / "2 Tage") where
 * English does not inflect an abbreviation.
 */
function formatReminderCountdown(
  i18n: I18n,
  locale: AppLocale,
  timestamp: number,
): string {
  const until = formatTimeUntil(timestamp, { locale });
  if (until !== null) return until;

  const overdueBy = Math.floor(Date.now() / 1_000) - timestamp;
  if (overdueBy < 60) return i18n._(msg`just now`);
  if (overdueBy < 3_600) {
    const minutes = Math.floor(overdueBy / 60);
    return i18n._(
      msg`${plural(minutes, { one: "#m overdue", other: "#m overdue" })}`,
    );
  }
  if (overdueBy < 86_400) {
    const hours = Math.floor(overdueBy / 3_600);
    return i18n._(
      msg`${plural(hours, { one: "#h overdue", other: "#h overdue" })}`,
    );
  }
  const days = Math.floor(overdueBy / 86_400);
  return i18n._(
    msg`${plural(days, { one: "#d overdue", other: "#d overdue" })}`,
  );
}

function formatReminderSourceLocation(
  i18n: I18n,
  source: ReminderSource,
): string {
  if (!source.channel) return source.channelLabel;
  const name = source.channelLabel;
  return source.channel.channelType === "dm"
    ? i18n._(msg`DM with ${name}`)
    : `#${name}`;
}

function ReminderRow({
  isSelected = false,
  presentation = "card",
  reminder,
  pubkey,
  source,
  onNavigate,
  onSelect,
}: {
  isSelected?: boolean;
  presentation?: "inbox-list" | "card";
  reminder: Reminder;
  pubkey: string;
  source: ReminderSource | null;
  onNavigate: (reminder: Reminder) => void;
  onSelect?: (reminder: Reminder) => void;
}) {
  const { i18n, t } = useLingui();
  const locale = useLocale();
  const { complete, snooze, cancel } = useReminderMutations(pubkey);
  const isDone = reminder.content.status === "done";
  const isActing = complete.isPending || snooze.isPending || cancel.isPending;
  const isNavigable = hasNavigableTarget(reminder.content.target);

  const handleComplete = () => {
    complete.mutate(reminder, {
      onSuccess: () => toast.success(t`Reminder completed`),
      onError: () => toast.error(t`Failed to complete reminder`),
    });
  };

  const handleSnooze = (notBefore: number) => {
    snooze.mutate(
      { reminder, notBefore },
      {
        onSuccess: () => toast.success(t`Reminder snoozed`),
        onError: () => toast.error(t`Failed to snooze reminder`),
      },
    );
  };

  const handleCancel = () => {
    cancel.mutate(reminder, {
      onSuccess: () => toast.success(t`Reminder cancelled`),
      onError: () => toast.error(t`Failed to cancel reminder`),
    });
  };

  const isOverdue =
    !isDone && reminder.notBefore
      ? reminder.notBefore <= Math.floor(Date.now() / 1_000)
      : false;
  const isInboxList = presentation === "inbox-list";

  return (
    <div
      className={cn(
        "flex items-start gap-3 transition-colors",
        isInboxList
          ? "border-b border-border/45 px-4 py-4 hover:bg-muted/40 focus-within:bg-muted/40"
          : "rounded-md border p-3",
        isInboxList && isSelected && "bg-muted/40",
      )}
      data-testid={`home-reminder-item-${reminder.id}`}
    >
      {isInboxList ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bell className="h-4 w-4" />
        </span>
      ) : null}
      <button
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left enabled:hover:opacity-80 disabled:cursor-default"
        disabled={!isInboxList && !isNavigable}
        onClick={() => {
          if (isInboxList) onSelect?.(reminder);
          else if (isNavigable) onNavigate(reminder);
        }}
        type="button"
      >
        {source ? (
          <div className="flex min-w-0 max-w-full items-center gap-1.5 text-xs text-muted-foreground">
            <UserAvatar
              avatarUrl={source.avatarUrl}
              className="h-4 w-4 shrink-0"
              displayName={source.authorLabel}
              shape={source.isAgent ? "squircle" : "circle"}
              size="xs"
            />
            {/* One whole sentence, not author + "in" + location as three
                independent spans: "in" alone is not a translatable unit, and
                German needs the freedom to order the two around it. */}
            <span className="min-w-0 truncate">
              <Trans>
                <span className="font-medium text-foreground">
                  {source.authorLabel}
                </span>{" "}
                in {formatReminderSourceLocation(i18n, source)}
              </Trans>
            </span>
          </div>
        ) : null}
        <p className="max-w-full truncate text-sm font-medium">
          {reminder.content.target?.preview ||
            reminder.content.note ||
            t`Reminder`}
        </p>
        {reminder.content.target && reminder.content.note ? (
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {reminder.content.note}
          </p>
        ) : null}
        {reminder.notBefore ? (
          <p
            className={`text-xs ${isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
          >
            <Clock className="mr-1 inline h-3 w-3" />
            {formatReminderCountdown(i18n, locale, reminder.notBefore)}
          </p>
        ) : null}
      </button>
      {isDone || isInboxList ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            className="h-7 w-7 p-0"
            disabled={isActing}
            onClick={handleComplete}
            size="sm"
            title={t`Complete`}
            type="button"
            variant="ghost"
          >
            <Check className="h-4 w-4" />
          </Button>
          <SnoozeMenu disabled={isActing} onSnooze={handleSnooze} />
          <Button
            className="h-7 w-7 p-0"
            disabled={isActing}
            onClick={handleCancel}
            size="sm"
            title={t`Cancel`}
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a user's reminders as grouped rows. `includeDone` adds a Completed
 * group (used by the inbox Reminders view); omit it for pending-only surfaces.
 */
export function RemindersPanel({
  pubkey,
  includeDone = false,
  onSelectReminder,
  presentation = "card",
  selectedReminderId,
}: {
  pubkey: string;
  includeDone?: boolean;
  onSelectReminder?: (reminderId: string) => void;
  presentation?: "inbox-list" | "card";
  selectedReminderId?: string | null;
}) {
  const { i18n } = useLingui();
  const remindersQuery = useRemindersQuery(pubkey);
  const reminders = remindersQuery.data;
  const { goChannel } = useAppNavigation();
  const sources = useReminderSources(reminders ?? []);

  const handleNavigate = React.useCallback(
    async (reminder: Reminder) => {
      const destination = await resolveReminderDestination(
        reminder.content.target,
      );
      if (!destination) {
        return;
      }
      void goChannel(destination.channelId, {
        messageId: destination.messageId,
        threadRootId: destination.threadRootId,
      });
    },
    [goChannel],
  );

  const groups = React.useMemo(
    () => groupReminders(reminders ?? [], includeDone),
    [reminders, includeDone],
  );
  const inboxReminders = React.useMemo(
    () => groups.flatMap((group) => group.reminders),
    [groups],
  );

  if (remindersQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          <Trans>Loading reminders...</Trans>
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <Bell className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          <Trans>No reminders</Trans>
        </p>
        <p className="text-xs text-muted-foreground/70">
          <Trans>Use "Remind me later" on any message to create one.</Trans>
        </p>
      </div>
    );
  }

  if (presentation === "inbox-list") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {inboxReminders.map((reminder) => (
          <ReminderRow
            isSelected={reminder.id === selectedReminderId}
            key={reminder.id}
            onNavigate={handleNavigate}
            onSelect={(selected) => onSelectReminder?.(selected.id)}
            presentation="inbox-list"
            pubkey={pubkey}
            reminder={reminder}
            source={sources.get(reminder.id) ?? null}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {groups.map((group) => (
        <div key={group.id} className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {i18n._(group.label)}
          </h3>
          {group.reminders.map((r) => (
            <ReminderRow
              key={r.id}
              onNavigate={handleNavigate}
              pubkey={pubkey}
              reminder={r}
              source={sources.get(r.id) ?? null}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReminderDetailPane({
  onBack,
  pubkey,
  reminder,
}: {
  onBack?: () => void;
  pubkey: string;
  reminder: Reminder | null;
}) {
  const { i18n, t } = useLingui();
  const locale = useLocale();
  const { goChannel } = useAppNavigation();
  const reminderList = React.useMemo(
    () => (reminder ? [reminder] : []),
    [reminder],
  );
  const sources = useReminderSources(reminderList);
  const { complete, snooze, cancel } = useReminderMutations(pubkey);

  if (!reminder) {
    return (
      <section className="flex min-h-0 min-w-0 flex-col bg-background">
        <TopChromeInsetHeader flush>
          <div className="flex min-h-9 items-center px-4 py-2">
            <span className="text-sm font-semibold">
              <Trans>Reminder</Trans>
            </span>
          </div>
        </TopChromeInsetHeader>
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          <Trans>Select a reminder</Trans>
        </div>
      </section>
    );
  }

  const source = sources.get(reminder.id) ?? null;
  const isDone = reminder.content.status === "done";
  const isActing = complete.isPending || snooze.isPending || cancel.isPending;
  const isNavigable = hasNavigableTarget(reminder.content.target);
  const preview =
    reminder.content.target?.preview || reminder.content.note || t`Reminder`;

  const handleNavigate = async () => {
    const destination = await resolveReminderDestination(
      reminder.content.target,
    );
    if (!destination) return;
    void goChannel(destination.channelId, {
      messageId: destination.messageId,
      threadRootId: destination.threadRootId,
    });
  };

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col bg-background"
      data-testid="home-reminder-detail"
    >
      <TopChromeInsetHeader flush>
        <div className="flex min-h-9 items-center gap-2 px-4 py-2">
          {onBack ? (
            <Button
              aria-label={t`Back to reminders`}
              className="h-8 w-8 p-0"
              onClick={onBack}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <span className="text-sm font-semibold">
            <Trans>Reminder</Trans>
          </span>
        </div>
      </TopChromeInsetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          {source ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserAvatar
                avatarUrl={source.avatarUrl}
                className="h-6 w-6"
                displayName={source.authorLabel}
                shape={source.isAgent ? "squircle" : "circle"}
                size="sm"
              />
              <Trans>
                <span className="font-medium text-foreground">
                  {source.authorLabel}
                </span>{" "}
                in {formatReminderSourceLocation(i18n, source)}
              </Trans>
            </div>
          ) : null}

          <p className="mt-5 whitespace-pre-wrap text-base leading-6 text-foreground">
            {preview}
          </p>
          {reminder.content.target && reminder.content.note ? (
            <div className="mt-5 border-l-2 border-border pl-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                <Trans>Note</Trans>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {reminder.content.note}
              </p>
            </div>
          ) : null}

          {reminder.notBefore ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {formatReminderCountdown(i18n, locale, reminder.notBefore)}
              </span>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Button
              disabled={!isNavigable}
              onClick={() => void handleNavigate()}
              size="sm"
              type="button"
              variant="outline"
            >
              <ExternalLink className="h-4 w-4" />
              <Trans>Open message</Trans>
            </Button>
            {isDone ? null : (
              <>
                <Button
                  disabled={isActing}
                  onClick={() =>
                    complete.mutate(reminder, {
                      onSuccess: () => toast.success(t`Reminder completed`),
                      onError: () =>
                        toast.error(t`Failed to complete reminder`),
                    })
                  }
                  size="sm"
                  type="button"
                >
                  <Check className="h-4 w-4" />
                  <Trans>Complete</Trans>
                </Button>
                <SnoozeMenu
                  disabled={isActing}
                  onSnooze={(notBefore) =>
                    snooze.mutate(
                      { reminder, notBefore },
                      {
                        onSuccess: () => toast.success(t`Reminder snoozed`),
                        onError: () =>
                          toast.error(t`Failed to snooze reminder`),
                      },
                    )
                  }
                />
                <Button
                  disabled={isActing}
                  onClick={() =>
                    cancel.mutate(reminder, {
                      onSuccess: () => toast.success(t`Reminder cancelled`),
                      onError: () => toast.error(t`Failed to cancel reminder`),
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                  <Trans>Cancel</Trans>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
