import { Trans } from "@lingui/react/macro";
import type { ManagedAgent } from "@/shared/api/types";

type AddChannelBotReuseGuardProps = {
  reusableAgent: ManagedAgent;
  forceNew: boolean;
  onForceNewChange: (forceNew: boolean) => void;
  disabled: boolean;
};

export function AddChannelBotReuseGuard({
  reusableAgent,
  forceNew,
  onForceNewChange,
  disabled,
}: AddChannelBotReuseGuardProps) {
  const statusLabel =
    reusableAgent.status === "running" || reusableAgent.status === "deployed"
      ? "running"
      : "stopped";

  return (
    <div className="space-y-2" data-testid="agent-instance-mode">
      <label className="text-sm font-medium" htmlFor="agent-instance-mode">
        <Trans>Agent instance</Trans>
      </label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
        disabled={disabled}
        id="agent-instance-mode"
        onChange={(e) => onForceNewChange(e.target.value === "new")}
        value={forceNew ? "new" : "reuse"}
      >
        <option value="reuse">
          <Trans>Reuse existing agent</Trans>
        </option>
        <option value="new">
          <Trans>Create new instance</Trans>
        </option>
      </select>
      <p className="text-xs text-muted-foreground">
        {/*
         * One <Trans> around the whole sentence, including the bolded name:
         * German moves "schon" and the participle, so handing a translator
         * "is already" and the tail as separate messages makes the sentence
         * unbuildable.
         */}
        <Trans>
          <span className="font-medium text-foreground">
            {reusableAgent.name}
          </span>{" "}
          is already {statusLabel}. Reusing adds it to this channel without
          creating a duplicate keypair.
        </Trans>
      </p>
    </div>
  );
}
