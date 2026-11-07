import { Trans } from "@lingui/react/macro";

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
import { Button } from "@/shared/ui/button";

import type { ForumDeletableKind } from "./forumDeletableKind";

/**
 * The deletable thing is named by `kind` rather than interpolated as a noun:
 * German inflects the article with the noun's gender ("diesen Beitrag" vs
 * "diese Antwort"), so a sentence assembled around a `{label}` hole has no
 * translatable shape. Each case is written out as a whole sentence instead.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  kind: ForumDeletableKind;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {kind === "post" ? (
              <Trans>Delete post?</Trans>
            ) : (
              <Trans>Delete reply?</Trans>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "post" ? (
              <Trans>
                This will permanently delete this post and cannot be undone.
              </Trans>
            ) : (
              <Trans>
                This will permanently delete this reply and cannot be undone.
              </Trans>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onConfirm} type="button" variant="destructive">
              {kind === "post" ? (
                <Trans>Delete post</Trans>
              ) : (
                <Trans>Delete reply</Trans>
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
