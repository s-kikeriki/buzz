import { Trans, useLingui } from "@lingui/react/macro";
import { msg, t } from "@lingui/core/macro";
import * as React from "react";
import { AlertCircle, Brain, Download, FileType2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type {
  SnapshotFormat,
  SnapshotMemoryLevel,
} from "@/shared/api/tauriPersonas";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { SnapshotOptionMenu } from "./SnapshotOptionMenu";

type AgentSnapshotExportDialogProps = {
  agentName: string;
  isSavePending: boolean;
  open: boolean;
  /** Pubkey of the linked agent instance to use as the memory source.
   *  When null, memory levels are disabled — the definition has no agent
   *  instance with a keypair to read memory from. */
  linkedAgentPubkey: string | null;
  onSaveFile: (
    memoryLevel: SnapshotMemoryLevel,
    format: SnapshotFormat,
  ) => void;
  onOpenChange: (open: boolean) => void;
};

const MEMORY_LEVELS: {
  value: SnapshotMemoryLevel;
  label: ReturnType<typeof msg>;
}[] = [
  {
    value: "none",
    label: msg`Agent only`,
  },
  {
    value: "core",
    label: msg`Agent + core memory`,
  },
  {
    value: "everything",
    label: msg`Agent + all memories`,
  },
];

const FORMAT_OPTIONS: {
  value: SnapshotFormat;
  label: ReturnType<typeof msg>;
}[] = [
  { value: "json", label: msg`JSON` },
  { value: "png", label: msg`PNG` },
];

const MODAL_RESIZE_TRANSITION = {
  duration: 0.22,
  ease: [0.23, 1, 0.32, 1],
} as const;

export function AgentSnapshotExportDialog({
  agentName,
  isSavePending,
  open,
  linkedAgentPubkey,
  onSaveFile,
  onOpenChange,
}: AgentSnapshotExportDialogProps) {
  const { i18n } = useLingui();
  void i18n;
  const [memoryLevel, setMemoryLevel] =
    React.useState<SnapshotMemoryLevel>("none");
  const [format, setFormat] = React.useState<SnapshotFormat>("png");
  const shouldReduceMotion = useReducedMotion();

  const hasLinkedAgent = linkedAgentPubkey !== null;
  const showMemoryWarning = memoryLevel !== "none";
  const modalResizeTransition = shouldReduceMotion
    ? { duration: 0 }
    : MODAL_RESIZE_TRANSITION;

  // Reset state when the dialog opens for a fresh export.
  React.useEffect(() => {
    if (open) {
      setMemoryLevel("none");
      setFormat("png");
    }
  }, [open]);

  const isPending = isSavePending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md"
        data-testid="agent-snapshot-export-dialog"
        showCloseButton={false}
      >
        <DialogHeader className="space-y-0">
          <DialogTitle className="truncate">
            <Trans>Export</Trans> {agentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <div className="flex min-h-8 items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Trans>Memories</Trans>
              </span>
              {hasLinkedAgent ? (
                <SnapshotOptionMenu
                  ariaLabel={t`Memories`}
                  className="font-medium text-foreground"
                  disabled={isPending}
                  onValueChange={(value) =>
                    setMemoryLevel(value as SnapshotMemoryLevel)
                  }
                  options={MEMORY_LEVELS.map((option) => ({
                    ...option,
                    label: i18n._(option.label),
                  }))}
                  testId="agent-snapshot-memory-trigger"
                  value={memoryLevel}
                />
              ) : (
                <span
                  className="inline-flex h-8 w-auto items-center justify-end px-2 text-sm font-medium"
                  data-testid="agent-snapshot-memory-value"
                >
                  <Trans>Agent only</Trans>
                </span>
              )}
            </div>

            <div className="flex min-h-8 items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <FileType2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Trans>File format</Trans>
              </span>
              <SnapshotOptionMenu
                ariaLabel={t`File format`}
                className="font-medium text-foreground"
                disabled={isPending}
                onValueChange={(value) => setFormat(value as SnapshotFormat)}
                options={FORMAT_OPTIONS.map((option) => ({
                  ...option,
                  label: i18n._(option.label),
                }))}
                testId="agent-snapshot-format-trigger"
                value={format}
              />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showMemoryWarning ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                data-testid="agent-snapshot-memory-warning-motion"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                key="agent-snapshot-memory-warning"
                transition={modalResizeTransition}
              >
                <div
                  className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
                  data-testid="agent-snapshot-memory-warning"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <Trans>Memory is stored as</Trans>{" "}
                    <strong>
                      <Trans>plaintext</Trans>
                    </strong>{" "}
                    <Trans>
                      in the snapshot. Only share it with people you trust.
                    </Trans>
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            className="flex items-center justify-end gap-2 pt-2"
            data-testid="agent-snapshot-export-footer"
          >
            <DialogClose asChild>
              <Button
                disabled={isPending}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trans>Cancel</Trans>
              </Button>
            </DialogClose>
            <Button
              data-testid="agent-snapshot-export-confirm"
              disabled={isPending}
              onClick={() => onSaveFile(memoryLevel, format)}
              size="sm"
              type="button"
            >
              <Download className="h-4 w-4" />
              <Trans>Export</Trans>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
