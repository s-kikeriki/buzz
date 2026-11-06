import * as React from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

import { Badge } from "@/shared/ui/badge";
import type { ManagedAgent, PresenceStatus } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";

/** Grace period after mount before treating "running + no presence" as "Starting…" */
const PRESENCE_GRACE_MS = 15_000;

/**
 * Display label for a relay deployment status.
 *
 * The badge used to render the status identifier itself with its underscores
 * swapped for spaces, so a German app showed "running" and "not deployed".
 * A function, not a module-level table, so the lookup resolves in the active
 * locale rather than in whichever locale first imported this module. Lowercase
 * to match the badge's existing casing; `sentenceCase` capitalizes at the call
 * site.
 */
function managedAgentStatusLabel(status: ManagedAgent["status"]): string {
  switch (status) {
    case "running":
      return t`running`;
    case "stopped":
      return t`stopped`;
    case "deployed":
      return t`deployed`;
    case "not_deployed":
      return t`not deployed`;
  }
}

export function AgentStatusBadge({
  className,
  isWorking,
  presenceLoaded,
  presenceStatus,
  sentenceCase = false,
  status,
}: {
  className?: string;
  isWorking?: boolean;
  presenceLoaded: boolean;
  presenceStatus: PresenceStatus | undefined;
  sentenceCase?: boolean;
  status: ManagedAgent["status"];
}) {
  // Subscribes the badge to locale changes so its label re-renders on a switch.
  const { i18n } = useLingui();
  void i18n;
  const [inGracePeriod, setInGracePeriod] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setInGracePeriod(false), PRESENCE_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const isActive = status === "running" || status === "deployed";
  const isStarting =
    !inGracePeriod &&
    presenceLoaded &&
    status === "running" &&
    (!presenceStatus || presenceStatus === "offline");

  const variant: "default" | "warning" | "secondary" = isWorking
    ? "default"
    : isStarting
      ? "warning"
      : isActive
        ? "default"
        : "secondary";

  const rawLabel = isWorking
    ? t`Working`
    : isStarting
      ? t`Starting\u2026`
      : managedAgentStatusLabel(status);
  const label = sentenceCase
    ? `${rawLabel.charAt(0).toUpperCase()}${rawLabel.slice(1)}`
    : rawLabel;

  return (
    <Badge
      className={cn(className, isWorking && "motion-safe:animate-pulse")}
      variant={variant}
    >
      {label}
    </Badge>
  );
}
