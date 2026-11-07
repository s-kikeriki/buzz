import { Trans, useLingui } from "@lingui/react/macro";
import * as React from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { ProfileAgentActionRow } from "@/features/profile/ui/UserProfileAgentManagementRows";
import type { ManagedAgent } from "@/shared/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useBestie } from "./useBestie";

export function BestieProfileAction({ agent }: { agent: ManagedAgent }) {
  const { t } = useLingui();
  const bestie = useBestie();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  if (agent.backend.type !== "local") return null;

  const isBestie =
    bestie.assignment?.agentPubkey.toLowerCase() === agent.pubkey.toLowerCase();
  const isPending = bestie.isAssigning;
  const handleClick = () => {
    if (!isBestie) {
      setConfirmOpen(true);
      return;
    }
    void bestie.clearAssignment().catch((error) => {
      toast.error(
        error instanceof Error ? error.message : t`Couldn’t update Sidekick`,
      );
    });
  };

  // The replacement name is only read on the branch that renders it, so the
  // non-replacing case does not depend on there being a previous assignment.
  const previousName = bestie.assignedAgent?.name;

  return (
    <>
      <ProfileAgentActionRow
        disabled={bestie.isLoading || isPending}
        icon={Star}
        iconClassName={
          isBestie ? "h-4 w-4 shrink-0 fill-current text-foreground" : undefined
        }
        label={isBestie ? t`Remove Sidekick` : t`Make Sidekick`}
        onClick={handleClick}
        testId="user-profile-bestie-action"
      />
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent data-testid="bestie-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Make {agent.name} your Sidekick?</Trans>
            </AlertDialogTitle>
            {/*
              One whole sentence per case rather than a shared tail: German
              puts the verb elsewhere in the clause, so "<name> will replace
              <other>" and "<name> will appear" cannot share a translatable
              remainder.
            */}
            <AlertDialogDescription>
              {previousName && !isBestie ? (
                <Trans>
                  {agent.name} will replace {previousName} in the floating
                  shortcut and message actions.
                </Trans>
              ) : (
                <Trans>
                  {agent.name} will appear in the floating shortcut and message
                  actions.
                </Trans>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                void bestie
                  .assignAgent(agent)
                  .then(() => setConfirmOpen(false))
                  .catch((error) => {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t`Couldn’t update Sidekick`,
                    );
                  });
              }}
            >
              {isPending ? (
                <Trans>Saving…</Trans>
              ) : (
                <Trans>Make Sidekick</Trans>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
