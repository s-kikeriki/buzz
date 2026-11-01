import { Trans } from "@lingui/react/macro";

import { AgentDefaultsEditor } from "@/features/agents/ui/AgentDefaultsEditor";
import { SettingsOptionGroup } from "./SettingsOptionGroup";

export function AgentDefaultsSettingsCard() {
  return (
    <SettingsOptionGroup
      data-testid="settings-global-agent-config"
      description={
        <Trans>
          Provider, model, effort, and environment settings inherited by local
          agents. Agent-specific settings always take priority.
        </Trans>
      }
      title={<Trans>Agent defaults</Trans>}
    >
      <div className="px-4 py-4">
        <AgentDefaultsEditor layout="flat" />
      </div>
    </SettingsOptionGroup>
  );
}
