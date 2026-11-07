import { useLingui } from "@lingui/react/macro";
import { Star } from "lucide-react";

import type { ManagedAgent } from "@/shared/api/types";

export function BestieCardBadge({
  agent,
  isBestie,
}: {
  agent: ManagedAgent;
  isBestie: boolean;
}) {
  const { t } = useLingui();
  if (!isBestie) return null;

  return (
    <span
      aria-label={t`${agent.name} is your Sidekick`}
      className="inline-flex shrink-0 items-center justify-center text-foreground opacity-50"
      data-testid={`bestie-card-badge-${agent.pubkey}`}
      role="img"
      title={t`Sidekick`}
    >
      <Star className="h-4 w-4 fill-current" />
    </span>
  );
}
