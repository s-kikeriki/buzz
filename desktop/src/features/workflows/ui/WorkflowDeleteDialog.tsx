import { Trans, useLingui } from "@lingui/react/macro";
import type { Workflow } from "@/shared/api/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

type WorkflowDeleteDialogProps = {
  error?: string | null;
  isPending?: boolean;
  open: boolean;
  workflow: Workflow | null;
  onConfirm: (workflow: Workflow) => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

export function WorkflowDeleteDialog({
  error,
  isPending = false,
  open,
  workflow,
  onConfirm,
  onOpenChange,
}: WorkflowDeleteDialogProps) {
  const { t } = useLingui();
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete workflow?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {workflow
              ? t`Delete "${workflow.name}". This removes the current workflow and stops new triggers. Publishing its definition again, even an older version, can recreate it.`
              : t`Delete this workflow.`}
          </AlertDialogDescription>
          {error ? (
            <p
              aria-live="polite"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <Trans>
                Couldn’t delete workflow. {error} Try again or cancel to keep
                editing.
              </Trans>
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button disabled={isPending} type="button" variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          </AlertDialogCancel>
          <Button
            disabled={!workflow || isPending}
            onClick={() => {
              if (workflow) {
                void onConfirm(workflow);
              }
            }}
            type="button"
            variant="destructive"
          >
            {isPending ? t`Deleting…` : t`Delete`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
