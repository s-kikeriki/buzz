import { useLingui } from "@lingui/react/macro";
import { Check, type LucideIcon } from "lucide-react";

import {
  feedKindHeadline,
  feedPreview,
  resolveInboxCopy,
} from "@/features/home/lib/inbox";

import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import type { FeedItem } from "@/shared/api/types";
import { intlLocale, localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";
import { useLocale } from "@/shared/lib/localePreference";
import { resolveMentionProps } from "@/shared/lib/resolveMentionNames";
import { Button } from "@/shared/ui/button";
import { Markdown } from "@/shared/ui/markdown";
import { hasLinkPreviewSuppression } from "@/features/messages/lib/formatTimelineMessages";
import { UserAvatar } from "@/shared/ui/UserAvatar";

const relativeFormatterCache = new Map<AppLocale, Intl.RelativeTimeFormat>();

/**
 * Feed items can be in the future (a scheduled reminder), so this keeps its own
 * signed formatter rather than using the shared past-only ladder: `numeric:
 * "auto"` gives "tomorrow" / "morgen" as well as "2 days ago".
 */
function relativeTimeFormatter(locale: AppLocale): Intl.RelativeTimeFormat {
  const cached = relativeFormatterCache.get(locale);
  if (cached) return cached;
  const created = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  relativeFormatterCache.set(locale, created);
  return created;
}

const FEED_ABSOLUTE = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

function formatFeedTime(unixSeconds: number, locale: AppLocale) {
  const diff = unixSeconds - Math.floor(Date.now() / 1_000);
  const absoluteDiff = Math.abs(diff);
  const formatter = relativeTimeFormatter(locale);

  if (absoluteDiff < 60) {
    return formatter.format(diff, "second");
  }

  if (absoluteDiff < 60 * 60) {
    return formatter.format(Math.round(diff / 60), "minute");
  }

  if (absoluteDiff < 60 * 60 * 24) {
    return formatter.format(Math.round(diff / (60 * 60)), "hour");
  }

  if (absoluteDiff < 60 * 60 * 24 * 7) {
    return formatter.format(Math.round(diff / (60 * 60 * 24)), "day");
  }

  return localeDateTimeFormat(locale, FEED_ABSOLUTE).format(
    new Date(unixSeconds * 1_000),
  );
}

type FeedSectionProps = {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: LucideIcon;
  items: FeedItem[];
  currentPubkey?: string;
  profiles?: UserProfileLookup;
  availableChannelIds: ReadonlySet<string>;
  doneSet: ReadonlySet<string>;
  showDoneAction: boolean;
  onOpenItem: (item: FeedItem) => void;
  onMarkDone: (id: string) => void;
  onUndoDone: (id: string) => void;
};

export function FeedSection({
  title,
  emptyTitle,
  emptyDescription,
  icon: Icon,
  items,
  currentPubkey,
  profiles,
  availableChannelIds,
  doneSet,
  showDoneAction,
  onOpenItem,
  onMarkDone,
  onUndoDone,
}: FeedSectionProps) {
  const { i18n, t } = useLingui();
  const locale = useLocale();
  return (
    <section>
      <div className="flex items-center gap-2 pb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground/70">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-5 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {emptyTitle}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-md border border-border/60">
          {items.map((item) => {
            const channelId = item.channelId;
            const canOpenChannel =
              channelId !== null && availableChannelIds.has(channelId);
            const isDone = doneSet.has(item.id);
            const { mentionNames, mentionPubkeysByName } = resolveMentionProps(
              item.tags,
              profiles,
              item.content,
            );

            return (
              <div
                className={`group relative px-3 py-2.5 transition-colors hover:bg-muted/40 ${isDone ? "opacity-50" : ""} ${canOpenChannel ? "cursor-pointer" : ""}`}
                key={item.id}
              >
                {canOpenChannel ? (
                  <button
                    aria-label={t`Open ${item.channelName || t`channel`}`}
                    className="absolute inset-0"
                    data-testid={`home-feed-open-${item.id}`}
                    onClick={() => {
                      onOpenItem(item);
                    }}
                    type="button"
                  />
                ) : null}

                <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
                  <span
                    className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}
                  >
                    {i18n._(feedKindHeadline(item))}
                  </span>
                  <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                    <UserAvatar
                      avatarUrl={
                        profiles?.[item.pubkey.toLowerCase()]?.avatarUrl ?? null
                      }
                      displayName={resolveUserLabel({
                        pubkey: item.pubkey,
                        currentPubkey,
                        profiles,
                        preferResolvedSelfLabel: true,
                      })}
                      shape={
                        profiles?.[item.pubkey.toLowerCase()]?.isAgent === true
                          ? "squircle"
                          : "circle"
                      }
                      size="xs"
                    />
                    {resolveUserLabel({
                      pubkey: item.pubkey,
                      currentPubkey,
                      profiles,
                      preferResolvedSelfLabel: true,
                    })}
                  </span>
                  {item.channelName ? (
                    <span className="text-2xs text-primary/80">
                      #{item.channelName}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-2xs text-muted-foreground/60">
                    {formatFeedTime(item.createdAt, locale)}
                  </span>
                </div>

                <div className="pointer-events-none relative mt-0.5 line-clamp-2">
                  <Markdown
                    className="max-w-none text-sm leading-snug text-muted-foreground"
                    content={resolveInboxCopy(i18n, feedPreview(item))}
                    messageId={item.id}
                    linkPreviewsSuppressed={hasLinkPreviewSuppression(
                      item.tags,
                    )}
                    mentionNames={mentionNames}
                    mentionPubkeysByName={mentionPubkeysByName}
                  />
                </div>

                {showDoneAction ? (
                  <Button
                    aria-label={isDone ? t`Undo done` : t`Mark done`}
                    onClick={() => {
                      if (isDone) {
                        onUndoDone(item.id);
                      } else {
                        onMarkDone(item.id);
                      }
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                    className={`pointer-events-auto absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 ${isDone ? "text-green-500 opacity-100" : "text-muted-foreground"}`}
                  >
                    <Check />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
