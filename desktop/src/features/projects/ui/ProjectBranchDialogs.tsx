import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Loader2 } from "lucide-react";
import * as React from "react";

import {
  normalizeProjectBranchName,
  projectBranchNameError,
} from "@/features/projects/lib/projectBranches";
import { projectBranchErrorMessage } from "@/features/projects/lib/projectBranchErrors";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

export function CreateProjectBranchDialog({
  existingBranches,
  onCreate,
  onOpenChange,
  open,
  pending,
  sourceBranch,
  sourceCommit,
}: {
  existingBranches: string[];
  onCreate: (branch: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  sourceBranch: string;
  sourceCommit: string | null;
}) {
  const { i18n } = useLingui();
  void i18n;
  const [branchName, setBranchName] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const validationError = projectBranchNameError(branchName, existingBranches);

  React.useEffect(() => {
    if (!open) return;
    setBranchName("");
    setSubmitError(null);
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = normalizeProjectBranchName(branchName);
    if (!branch || validationError || !sourceCommit) return;
    setSubmitError(null);
    try {
      await onCreate(branch);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        projectBranchErrorMessage(error, "Failed to create branch."),
      );
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent data-testid="project-create-branch-dialog">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              <Trans>Create branch</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Create a remote branch from</Trans>{" "}
              <span className="font-mono text-foreground">{sourceBranch}</span>
              {sourceCommit ? ` at ${sourceCommit.slice(0, 7)}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <label
            className="block space-y-2 text-sm font-medium"
            htmlFor="project-create-branch-name"
          >
            <span>
              <Trans>Branch name</Trans>
            </span>
            <Input
              autoFocus
              data-testid="project-create-branch-name"
              disabled={pending}
              id="project-create-branch-name"
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={t`feature/my-change`}
              value={branchName}
            />
          </label>
          {branchName && validationError ? (
            <p className="text-sm text-destructive">{validationError}</p>
          ) : null}
          {!sourceCommit ? (
            <p className="text-sm text-destructive">
              <Trans>Refresh the repository before creating a branch.</Trans>
            </p>
          ) : null}
          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              data-testid="project-create-branch-submit"
              disabled={pending || Boolean(validationError) || !sourceCommit}
              type="submit"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? t`Creating…` : t`Create branch`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectBranchDialog({
  branch,
  onDelete,
  onOpenChange,
  open,
  pending,
}: {
  branch: string;
  onDelete: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const { i18n } = useLingui();
  void i18n;
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setSubmitError(null);
  }, [open]);

  async function handleDelete() {
    setSubmitError(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        projectBranchErrorMessage(error, "Failed to delete branch."),
      );
    }
  }

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <AlertDialogContent data-testid="project-delete-branch-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Delete branch?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Delete the remote branch</Trans>{" "}
            <span className="font-mono text-foreground">{branch}</span>
            <Trans>
              . This cannot be undone and may be rejected by repository
              protection rules.
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button disabled={pending} type="button" variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          </AlertDialogCancel>
          <Button
            data-testid="project-delete-branch-submit"
            disabled={pending}
            onClick={() => void handleDelete()}
            type="button"
            variant="destructive"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? t`Deleting…` : t`Delete branch`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
