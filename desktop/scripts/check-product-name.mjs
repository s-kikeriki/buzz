import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findHardcodedProductName } from "./check-product-name-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/**
 * Files whose user-facing copy takes the product name from `BRAND.productName`
 * and must keep doing so.
 *
 * A **ratchet**, not an inventory, exactly like `CONVERTED_FILES` in
 * `check-i18n-coverage.mjs`: it only grows, and a file joins it in the change
 * that converts it. The sweeps in #21, #23 and #24 each converted a screen and
 * left nothing behind to catch the next hardcoded name — which is why #24
 * found the *Settings* copy of `BackupTestFlow` still saying "Buzz" months
 * after the onboarding copy was fixed. This list is that missing half.
 */
const CONVERTED_FILES = [
  // Agents: runtime names, the tool catalogue, transcript labels, the
  // shared-compute provider and the restart hint.
  "src/features/agents/ui/AgentCardMintDialog.tsx",
  "src/features/agents/ui/RestartDiffBadge.tsx",
  "src/features/agents/ui/acpCommandPicker.ts",
  "src/features/agents/ui/agentConfigOptions.tsx",
  "src/features/agents/ui/agentProfileSyncWarning.ts",
  "src/features/agents/ui/agentSessionToolCatalog.ts",
  "src/features/agents/ui/agentSessionToolClassifier.ts",
  "src/features/agents/ui/agentSessionTranscriptGrouping.ts",
  "src/features/agents/ui/agentSessionTranscriptHelpers.ts",
  "src/features/agents/ui/personaModelDiscoveryStatus.ts",
  // Projects: repository errors, contributor roles, the terminal panel and the
  // agent-context disclosure.
  "src/features/projects/lib/projectGitError.ts",
  "src/features/projects/lib/projectHomeTemplate.ts",
  "src/features/projects/lib/projectRepoAvailability.ts",
  "src/features/projects/ui/AgentContextPayloadPreview.tsx",
  "src/features/projects/ui/ProjectCards.tsx",
  "src/features/projects/ui/ProjectDetailFeedPanels.tsx",
  "src/features/projects/ui/ProjectReadmePanel.tsx",
  "src/features/projects/ui/ProjectRightPanelControls.tsx",
  "src/features/projects/ui/RepositoryCards.tsx",
  "src/features/projects/ui/ProjectWorkspaceTabs.tsx",
  "src/features/projects/ui/useOpenProjectTerminal.ts",
  "src/features/projects/ui/useProjectRepositoryOpenActions.ts",
  "src/features/projects/useAddProjectChannel.ts",
  // Settings: the panels a person reads after first run.
  "src/features/settings/EncryptedBackupProvider.tsx",
  "src/features/settings/UpdateChecker.tsx",
  "src/features/settings/hooks/useSendFeedback.ts",
  "src/features/settings/ui/BackupTestFlow.tsx",
  "src/features/settings/ui/CustomHarnessForm.tsx",
  "src/features/settings/ui/EncryptedBackupCreator.tsx",
  "src/features/settings/ui/HarnessesSettingsPanel.tsx",
  "src/features/settings/ui/HostedCommunitiesSettingsCard.tsx",
  "src/features/settings/ui/ProfileSettingsCard.tsx",
  "src/features/settings/ui/SendFeedbackDialog.tsx",
  "src/features/settings/ui/SignOutSection.tsx",
  "src/features/settings/ui/VoiceSettingsCard.tsx",
  "src/features/settings/ui/harnessCatalogLogic.ts",
  // Onboarding: the other half of the duplicated backup-test flow. Listed
  // alongside its Settings twin on purpose — the two drifted once.
  "src/features/onboarding/ui/BackupTestFlow.tsx",
  // Settings, German tranche: the rest of the panels, joining in the change
  // that marked their copy for translation. Two of them already *named* the
  // product in copy that nothing was watching — `harnessCatalogCopy.ts` said
  // two runtimes connect "to Buzz", and that is our half of the sentence, not
  // the vendor's.
  "src/features/notifications/lib/sound.ts",
  "src/features/settings/SidebarUpdateCard.tsx",
  "src/features/settings/UpdateIndicator.tsx",
  "src/features/settings/ui/AgentDefaultsSettingsCard.tsx",
  "src/features/settings/ui/AgentsSettingsPanel.tsx",
  "src/features/settings/ui/ChannelTemplatesSettingsCard.tsx",
  "src/features/settings/ui/ExperimentalFeaturesCard.tsx",
  "src/features/settings/ui/HarnessCatalogDialog.tsx",
  "src/features/settings/ui/HarnessRow.tsx",
  "src/features/settings/ui/MobilePairingCard.tsx",
  "src/features/settings/ui/NotificationSettingsCard.tsx",
  "src/features/settings/ui/PreventSleepSettingsCard.tsx",
  "src/features/settings/ui/PrivateKeyBackupRow.tsx",
  "src/features/settings/ui/SettingsPanels.tsx",
  "src/features/settings/ui/SoundPicker.tsx",
  "src/features/settings/ui/harnessCatalogCopy.ts",
  "src/features/settings/ui/harnessFormLogic.ts",
  "src/features/settings/ui/harnessGalleryLogic.ts",
];

/**
 * `path:line` exceptions. Every entry carries the reason, because the reason
 * is the only way a reviewer can check the claim.
 */
const MOBILE_APP_NAME_REASON =
  "The mobile app this pairs with is published as Buzz and is not part of " +
  "this fork's de-branding: a flavored desktop build still pairs with the " +
  "Buzz mobile app, so renaming it here would send people looking for an " +
  "app that does not exist. Open question for Ian — if the mobile app is " +
  "ever flavored too, these four strings follow it.";

const OVERRIDES = new Map([
  [
    "src/features/settings/ui/HostedCommunitiesSettingsCard.tsx:413",
    "A hosted-community address really is a Buzz address — this page is only " +
      "for relay hosting provided by Block, and names Block two lines above. " +
      "Renaming it would claim the flavor hosts a namespace it does not.",
  ],
  ["src/features/settings/ui/MobilePairingCard.tsx:69", MOBILE_APP_NAME_REASON],
  [
    "src/features/settings/ui/MobilePairingCard.tsx:160",
    MOBILE_APP_NAME_REASON,
  ],
  [
    "src/features/settings/ui/MobilePairingCard.tsx:186",
    MOBILE_APP_NAME_REASON,
  ],
  [
    "src/features/settings/ui/MobilePairingCard.tsx:480",
    MOBILE_APP_NAME_REASON,
  ],
]);

async function main() {
  const violations = [];

  for (const relativePath of CONVERTED_FILES) {
    const absolutePath = path.join(projectRoot, relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      // A converted file that no longer exists means this list is stale. Fail
      // loudly rather than quietly checking nothing — a missing file would
      // otherwise read as a pass.
      violations.push({
        file: relativePath,
        line: 0,
        text: "listed in CONVERTED_FILES but not found — update the list",
      });
      continue;
    }

    for (const finding of findHardcodedProductName(source)) {
      if (OVERRIDES.has(`${relativePath}:${finding.line}`)) continue;
      violations.push({ file: relativePath, ...finding });
    }
  }

  // An override that no longer matches anything is worse than a missing one:
  // it silences a line somebody else may later write there.
  for (const key of OVERRIDES.keys()) {
    const [relativePath, lineText] = [
      key.slice(0, key.lastIndexOf(":")),
      key.slice(key.lastIndexOf(":") + 1),
    ];
    const absolutePath = path.join(projectRoot, relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      violations.push({
        file: relativePath,
        line: 0,
        text: "has an override but the file is missing",
      });
      continue;
    }
    const stillMatches = findHardcodedProductName(source).some(
      (finding) => String(finding.line) === lineText,
    );
    if (!stillMatches) {
      violations.push({
        file: relativePath,
        line: Number(lineText),
        text: "stale override — nothing on this line names the product",
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      `product name: ${CONVERTED_FILES.length} converted file(s) clean, ` +
        `${OVERRIDES.size} documented exception(s).`,
    );
    return;
  }

  console.error("Hardcoded product name in converted file(s):\n");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.text}`);
  }
  console.error(
    "\nUse `BRAND.productName` from `@/shared/branding/brand`, or add a " +
      "`path:line` override with the reason it is not copy.",
  );
  process.exitCode = 1;
}

await main();
