import { Trans, useLingui } from "@lingui/react/macro";

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
import { Button, buttonVariants } from "@/shared/ui/button";

// Archive is relay-scoped + reversible (NIP-IA), so this gates with a calm,
// reassuring confirmation rather than a destructive warning. The confirm action
// renders `secondary` to match the trigger and the non-alarming tone — we pass
// the secondary classes straight to `AlertDialogAction` (whose base style is the
// default/primary variant) so tailwind-merge overrides the primary background;
// `asChild` + a nested Button would concatenate both variants and leave the
// primary fill winning on source order.
export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isBot,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isBot: boolean;
  isPending: boolean;
}) {
  const { t } = useLingui();
  const title = isBot ? t`Archive this agent?` : t`Archive this identity?`;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent data-testid="archive-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {/* Two whole sentences rather than one with a "this agent" /
              "this person" fragment: German inflects the article with the
              noun ("diesen Agenten" vs "diese Person"), so substituting the
              subject into a shared sentence cannot be made grammatical. */}
          <AlertDialogDescription>
            {isBot ? (
              <Trans>Archiving hides this agent from the space.</Trans>
            ) : (
              <Trans>Archiving hides this person from the space.</Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* The list + closing paragraph sit outside AlertDialogDescription on
            purpose — that component renders a <p>, which can't legally contain
            a <ul> or another block <p>. */}
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <Trans>
              They won't appear in search, autocomplete, or when adding members
            </Trans>
          </li>
          <li>
            <Trans>
              This only affects{" "}
              <span className="font-medium text-foreground">this space</span> —
              not their account anywhere else
            </Trans>
          </li>
          <li>
            <Trans>You can unarchive them at any time to restore them</Trans>
          </li>
        </ul>
        {isBot ? (
          <p className="text-sm text-muted-foreground">
            <Trans>
              You can also delete this agent from the profile settings menu if
              you want to remove the agent instead of hiding it.
            </Trans>
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "secondary" })}
            data-testid="archive-confirm-action"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? t`Archiving…` : t`Archive`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
