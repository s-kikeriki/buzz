import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { PRIVATE_CHANNEL_ADD_DENIED_MESSAGE } from "@/features/channels/lib/channelMemberAdmission";

type NonMemberMentionDialogProps = {
  /** False in a private channel the viewer doesn't own/administer. */
  canInvite: boolean;
  error: string | null;
  isInvitePending: boolean;
  names: string[];
  onDismiss: () => void;
  /** Omit when publication requires the intended recipients to be invited. */
  onDoNothing?: () => void;
  onInvite: () => void;
  open: boolean;
  /** Restore the initiating editor when it still owns the visible draft. */
  onRestoreFocus?: () => void;
};

export function NonMemberMentionDialog({
  canInvite,
  error,
  isInvitePending,
  names,
  onDismiss,
  onDoNothing,
  onInvite,
  open,
  onRestoreFocus,
}: NonMemberMentionDialogProps) {
  const { i18n, t } = useLingui();
  const safeActionRef = React.useRef<HTMLButtonElement>(null);
  const restoreFocusRef = React.useRef(onRestoreFocus);
  // Two whole sentences, each its own message. The first inflects its verb on
  // the name count, which `plural` owns; the second is the guidance. Splicing
  // the name list and an "is"/"are" fragment separately leaves a translator
  // with no sentence to agree, and German agreement is not the same cut.
  const nameList = names.join(", ");
  const membershipSentence = i18n._(
    plural(names.length, {
      one: `${nameList} is not in this channel.`,
      other: `${nameList} are not in this channel.`,
    }),
  );
  const guidance = onDoNothing
    ? canInvite
      ? t`Invite them to the channel, or send without inviting them.`
      : `${i18n._(PRIVATE_CHANNEL_ADD_DENIED_MESSAGE)} ${t`You can still send without inviting them.`}`
    : canInvite
      ? t`Invite them to the channel, or cancel to keep your draft.`
      : i18n._(PRIVATE_CHANNEL_ADD_DENIED_MESSAGE);
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
      open={open}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current = onRestoreFocus;
          safeActionRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!restoreFocusRef.current) return;
          event.preventDefault();
          // Pending state/inert is released by the async cancellation continuation.
          // Wait for its React commit; the source checks that it is still visible.
          requestAnimationFrame(() => restoreFocusRef.current?.());
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Mention people outside this channel?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {membershipSentence} {guidance}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <Button
            ref={safeActionRef}
            disabled={Boolean(onDoNothing) && isInvitePending}
            onClick={onDoNothing ?? onDismiss}
            size="sm"
            type="button"
            variant="outline"
          >
            {onDoNothing
              ? canInvite
                ? t`Do nothing`
                : t`Send anyway`
              : t`Cancel`}
          </Button>
          {canInvite ? (
            <Button
              disabled={isInvitePending}
              onClick={onInvite}
              size="sm"
              type="button"
            >
              {isInvitePending ? t`Inviting...` : t`Invite`}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
