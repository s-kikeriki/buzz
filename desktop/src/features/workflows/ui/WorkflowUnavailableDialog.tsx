import { Trans, useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";

type WorkflowUnavailableDialogProps = {
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  open: boolean;
};

export function WorkflowUnavailableDialog({
  loading,
  onOpenChange,
  onRetry,
  open,
}: WorkflowUnavailableDialogProps) {
  const { t } = useLingui();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {loading ? t`Loading workflow…` : t`Workflow unavailable`}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? t`Resolving workflow details.`
              : t`This workflow could not be loaded. It may no longer be available to you.`}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div
            aria-label={t`Loading workflow`}
            className="space-y-3"
            role="status"
          >
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X className="h-4 w-4" />
                <Trans>Close</Trans>
              </Button>
            </DialogClose>
            <Button onClick={onRetry} type="button">
              <Trans>Retry</Trans>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
