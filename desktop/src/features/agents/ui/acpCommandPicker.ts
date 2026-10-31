import { t } from "@lingui/core/macro";
import type { AcpCommandCandidate } from "@/shared/api/acpCommands";
import type { PersonaDropdownOption } from "./agentConfigOptions";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

export const DEFAULT_ACP_COMMAND_VALUE = "buzz-acp";

export function acpCommandPickerState(
  command: string,
  candidates: readonly AcpCommandCandidate[],
): {
  options: PersonaDropdownOption[];
  selectValue: string;
} {
  const options: PersonaDropdownOption[] = [
    {
      label: t`${productName} ACP (default)`,
      value: DEFAULT_ACP_COMMAND_VALUE,
    },
    ...candidates.map((candidate) => ({
      label: candidate.command,
      value: candidate.command,
    })),
  ];
  if (command && !options.some((option) => option.value === command)) {
    options.push({
      disabled: true,
      label: t`${command} (unavailable)`,
      value: command,
    });
  }
  return { options, selectValue: command || DEFAULT_ACP_COMMAND_VALUE };
}
