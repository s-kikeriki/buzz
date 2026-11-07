import { Trans, useLingui } from "@lingui/react/macro";
import { Ban, CircleSlash, Clock, ShieldCheck, UserMinus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useRemoveChannelMemberMutation } from "@/features/channels/hooks";
import {
  useBanMemberMutation,
  useModerationRestrictionsQuery,
  useTimeoutMemberMutation,
  useUnbanMemberMutation,
  useUntimeoutMemberMutation,
} from "@/features/moderation/hooks";
import { useMyRelayMembershipQuery } from "@/features/community-members/hooks";
import type { TimelineMessage } from "@/features/messages/types";
import { isTimedOut } from "@/features/moderation/lib/restrictionState";
import {
  TIMEOUT_PRESETS,
  timeoutExpiresAt,
} from "@/features/moderation/lib/timeout";
import { useIdentityQuery } from "@/shared/api/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * Mod-only per-message actions against the message *author*: time out, ban, and
 * kick from the current channel. Self-contained (wires its own hooks, no props
 * threaded from the message row), mirroring ReportMessageDialog.
 *
 * Renders nothing unless the viewer is a relay owner/admin, the message has a
 * real signer, and that signer is not the viewer. Actions target
 * `signerPubkey` — the raw signer, never a relay-delegated display author — per
 * the security note on TimelineMessage.
 */
export function MessageModerationMenuItems({
  channelId,
  message,
}: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  const { i18n, t } = useLingui();
  const relayMembershipQuery = useMyRelayMembershipQuery();
  const relayRole = relayMembershipQuery.data?.role;
  const canModerate = relayRole === "owner" || relayRole === "admin";

  const identityQuery = useIdentityQuery();
  // Moderate the raw signer, never a relay-delegated display author. A message
  // without a signer is not moderatable here; render nothing.
  const targetPubkey = message.signerPubkey ?? null;
  const isSelf =
    targetPubkey != null &&
    identityQuery.data?.pubkey != null &&
    normalizePubkey(targetPubkey) ===
      normalizePubkey(identityQuery.data.pubkey);

  const enabled = canModerate && targetPubkey != null && !isSelf;

  const restrictionsQuery = useModerationRestrictionsQuery(enabled);
  const banMutation = useBanMemberMutation();
  const unbanMutation = useUnbanMemberMutation();
  const timeoutMutation = useTimeoutMemberMutation();
  const untimeoutMutation = useUntimeoutMemberMutation();
  const removeMutation = useRemoveChannelMemberMutation(channelId ?? null);
  const isPending =
    banMutation.isPending ||
    unbanMutation.isPending ||
    timeoutMutation.isPending ||
    untimeoutMutation.isPending ||
    removeMutation.isPending;

  const restriction = React.useMemo(() => {
    if (targetPubkey == null) return null;
    const key = normalizePubkey(targetPubkey);
    return (
      restrictionsQuery.data?.find((r) => normalizePubkey(r.pubkey) === key) ??
      null
    );
  }, [restrictionsQuery.data, targetPubkey]);

  const isBanned = restriction?.banned ?? false;
  const timedOut = isTimedOut(restriction?.mutedUntil ?? null);

  const run = React.useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      try {
        await action();
        toast.success(success);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t`Moderation action failed`,
        );
      }
    },
    [t],
  );

  if (!enabled || targetPubkey == null) return null;

  return (
    <>
      <DropdownMenuSeparator />
      {timedOut ? (
        <DropdownMenuItem
          data-testid={`message-untimeout-${message.id}`}
          disabled={isPending}
          onClick={() =>
            void run(
              () => untimeoutMutation.mutateAsync(targetPubkey),
              t`Timeout lifted`,
            )
          }
        >
          <ShieldCheck className="h-4 w-4" />
          <Trans>Lift timeout</Trans>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-testid={`message-timeout-${message.id}`}
            disabled={isPending}
          >
            <Clock className="h-4 w-4" />
            <Trans>Time out author</Trans>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TIMEOUT_PRESETS.map((preset) => (
              <DropdownMenuItem
                data-testid={`message-timeout-${preset.seconds}-${message.id}`}
                disabled={isPending}
                key={preset.seconds}
                onClick={() =>
                  void run(
                    () =>
                      timeoutMutation.mutateAsync({
                        pubkey: targetPubkey,
                        expiresAt: timeoutExpiresAt(preset.seconds),
                      }),
                    t`Author timed out`,
                  )
                }
              >
                {i18n._(preset.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {channelId ? (
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          data-testid={`message-kick-${message.id}`}
          disabled={isPending}
          onClick={() =>
            void run(
              () => removeMutation.mutateAsync(targetPubkey),
              t`Author removed from channel`,
            )
          }
        >
          <UserMinus className="h-4 w-4" />
          <Trans>Kick from channel</Trans>
        </DropdownMenuItem>
      ) : null}

      {isBanned ? (
        <DropdownMenuItem
          data-testid={`message-unban-${message.id}`}
          disabled={isPending}
          onClick={() =>
            void run(
              () => unbanMutation.mutateAsync(targetPubkey),
              t`Ban lifted`,
            )
          }
        >
          <CircleSlash className="h-4 w-4" />
          <Trans>Lift ban</Trans>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          data-testid={`message-ban-${message.id}`}
          disabled={isPending}
          onClick={() =>
            void run(
              () => banMutation.mutateAsync({ pubkey: targetPubkey }),
              t`Author banned`,
            )
          }
        >
          <Ban className="h-4 w-4" />
          <Trans>Ban author from community</Trans>
        </DropdownMenuItem>
      )}
    </>
  );
}
