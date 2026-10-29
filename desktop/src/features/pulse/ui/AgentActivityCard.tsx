import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";

import type { AgentNoteGroup } from "@/features/pulse/lib/groupAgentNotes";
import { UserProfilePopover } from "@/features/profile/ui/UserProfilePopover";
import { localeDateTimeFormat } from "@/shared/lib/intlLocale";
import type { AppLocale } from "@/shared/lib/localePreference";
import { useLocale } from "@/shared/lib/localePreference";
import { formatRelativeTime } from "@/shared/lib/relativeTime";
import type { UserProfileSummary } from "@/shared/api/types";
import { Markdown } from "@/shared/ui/markdown";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { truncateNpub } from "@/shared/lib/pubkey";

type AgentActivityCardProps = {
  group: AgentNoteGroup;
  profile?: UserProfileSummary | null;
  agentStatus?: "online" | "away" | "offline" | "unknown";
};

function formatActivityTime(unixSeconds: number, locale: AppLocale): string {
  const nowSeconds = Date.now() / 1_000;

  if (nowSeconds - unixSeconds < 604_800) {
    return formatRelativeTime(unixSeconds, {
      ceiling: "day",
      locale,
      nowSeconds,
    });
  }

  return localeDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(new Date(unixSeconds * 1_000));
}

function StatusDot({ status }: { status: "online" | "away" | "offline" }) {
  const color =
    status === "online"
      ? "bg-emerald-500"
      : status === "away"
        ? "bg-amber-500"
        : "bg-zinc-400";
  return (
    <span
      aria-label={`Agent ${status}`}
      role="img"
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

export function AgentActivityCard({
  group,
  profile,
  agentStatus,
}: AgentActivityCardProps) {
  const locale = useLocale();
  const [expanded, setExpanded] = React.useState(false);
  const displayName = profile?.displayName ?? truncateNpub(group.pubkey);
  const avatarUrl = profile?.avatarUrl ?? null;
  const isSingleNote = group.notes.length === 1;

  // Show the latest note content as the summary.
  const summaryNote = group.notes[0];

  return (
    <div className="rounded-2xl px-1 py-4 sm:px-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <UserProfilePopover
          botIdenticonValue={displayName}
          pubkey={group.pubkey}
          role={"bot" as const}
        >
          <button
            aria-label={`Open profile for ${displayName}`}
            className="relative flex shrink-0 rounded-xl pt-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <UserAvatar
              avatarUrl={avatarUrl}
              displayName={displayName}
              shape="squircle"
            />
            <Bot className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background p-0.5 text-muted-foreground" />
          </button>
        </UserProfilePopover>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold leading-none">
              {displayName}
            </span>
            {agentStatus && agentStatus !== "unknown" ? (
              <StatusDot status={agentStatus} />
            ) : null}
            <span className="shrink-0 text-2xs text-muted-foreground">
              {formatActivityTime(group.latestAt, locale)}
            </span>
          </div>
        </div>
        {!isSingleNote ? (
          <button
            className="flex h-6 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {group.notes.length} updates
          </button>
        ) : null}
      </div>

      {/* Content */}
      {isSingleNote || !expanded ? (
        <div className="mt-1.5 ml-[44px] text-sm leading-relaxed text-foreground">
          <Markdown content={summaryNote.content} />
        </div>
      ) : (
        <div className="mt-2 ml-[44px] space-y-2">
          {group.notes.map((note, idx) => (
            <div
              className="flex gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
              key={note.id}
            >
              <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground">
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <Markdown content={note.content} />
                <p className="mt-1 text-2xs text-muted-foreground">
                  {formatActivityTime(note.createdAt, locale)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
