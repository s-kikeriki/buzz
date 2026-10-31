import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFileForHardcodedCopy } from "./check-i18n-coverage-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/**
 * Files that have been converted to the i18n catalogue and must stay that way.
 *
 * This list is a **ratchet**, not an inventory: it only ever grows, and a file
 * joins it in the same change that converts it. A sweep that converts a screen
 * without adding its files here has no regression protection — the next
 * hardcoded string someone adds to that screen ships silently.
 */
const CONVERTED_FILES = [
  "src/features/settings/ui/AppearanceSettingsControls.tsx",
  "src/features/settings/ui/LanguageSettingsControl.tsx",
  "src/features/settings/ui/AppearanceSettingsPanel.tsx",
  // Settings chrome: the nav rail and group headers that frame every panel.
  "src/features/settings/ui/SettingsView.tsx",
  // Sidebar navigation: the rows, section titles, badges and channel menu a
  // person reads before they ever open Settings.
  "src/features/sidebar/ui/AppSidebar.tsx",
  "src/features/sidebar/ui/AppSidebarPinnedHeader.tsx",
  "src/features/sidebar/ui/ChannelContextMenu.tsx",
  "src/features/sidebar/ui/CommunityRail.tsx",
  "src/features/sidebar/ui/SectionUnreadThreadCount.tsx",
  "src/features/sidebar/ui/SidebarSection.tsx",
  // Tranche 1 — the surfaces Ian named, plus the rest of the sidebar.
  // Search palette: the dialog, its scope chip, the rotating placeholder and
  // every result row.
  "src/features/search/ui/HighlightedSearchText.tsx",
  "src/features/search/ui/SearchPromptPlaceholder.tsx",
  "src/features/search/ui/SearchResultItem.tsx",
  "src/features/search/ui/SearchScopeControls.tsx",
  "src/features/search/ui/TopbarSearch.tsx",
  // Channel browser.
  "src/features/channels/ui/ChannelBrowserDialog.tsx",
  // Keyboard-shortcut help, and the table it reads. The table is the reason
  // the detector had to learn about copy fields in object literals: 58 of its
  // strings appear in no JSX node at all.
  "src/features/settings/ui/KeyboardShortcutsCard.tsx",
  "src/shared/lib/keyboard-shortcuts.ts",
  // The rest of the sidebar.
  "src/features/sidebar/ui/ChannelActivityPopover.tsx",
  "src/features/sidebar/ui/ChannelSectionDialogs.tsx",
  "src/features/sidebar/ui/CreateChannelDialog.tsx",
  "src/features/sidebar/ui/CreateChannelFormFields.tsx",
  "src/features/sidebar/ui/CustomChannelSection.tsx",
  "src/features/sidebar/ui/MoreUnreadButton.tsx",
  "src/features/sidebar/ui/SidebarDnd.tsx",
  "src/features/sidebar/ui/SidebarProfileCard.tsx",
  "src/features/sidebar/ui/SidebarProjectsSection.tsx",
  "src/features/sidebar/ui/SidebarRelayConnectionCard.tsx",
  "src/features/sidebar/ui/sidebarLoadingSkeleton.tsx",
  "src/features/sidebar/ui/sidebarMenuHelpers.tsx",
  // Tranche 2 — the inbox Ian named, and the home screen it lives on.
  // `inbox.ts` and `homeMessageCapabilities.ts` are libraries, not UI, and are
  // listed because they *produce* copy: the inbox row phrases, the eleven
  // event-kind headlines and the three empty-body previews all come from
  // there, and no JSX node mentions any of them.
  "src/features/home/lib/homeMessageCapabilities.ts",
  "src/features/home/lib/inbox.ts",
  "src/features/home/ui/FeedSection.tsx",
  "src/features/home/ui/HomeView.tsx",
  "src/features/home/ui/InboxDetailPane.tsx",
  "src/features/home/ui/InboxFilterMenu.tsx",
  "src/features/home/ui/InboxListPane.tsx",
  "src/features/home/ui/ProjectInboxDetail.tsx",
  "src/features/home/ui/ProjectInboxDetailPane.tsx",
  "src/features/home/ui/RecentNotesSection.tsx",
  // The drafts view *is* the inbox's Drafts filter, so leaving it English
  // would have made that one filter half-German — the exact seam this tranche
  // exists to close. Its own e2e assertion is what found it.
  "src/features/messages/ui/DraftDetailPane.tsx",
  "src/features/messages/ui/DraftsPanel.tsx",
  // The shared ladder grew a forward-pointing half for the reminder
  // countdown, so it now holds copy of its own ("in less than a minute").
  "src/shared/lib/relativeTime.ts",
  // Tranche 3 — first run. The very first screen a new install shows and the
  // two screens its two visible controls lead to: the landing page, the
  // identity-key explainer behind "What's an identity key?", and the
  // create-a-key introduction. Everything a person reads before they have an
  // account, which is also before they can reach the language setting.
  //
  // The later steps of the same flow — backup, harness setup, the default
  // config, and the key-import form itself — are still English and are the
  // next tranche. They are reachable only after a key exists.
  "src/features/onboarding/ui/IdentityKeyHelpDialog.tsx",
  "src/features/onboarding/ui/IdentityKeyIntroduction.tsx",
  "src/features/onboarding/ui/MachineOnboardingFlow.tsx",
  // Tranche 4 — the projects area. Every screen under
  // src/features/projects that now speaks through the catalogue, including
  // the library modules that produce the copy those screens render.
  "src/features/projects/branchMutations.ts",
  "src/features/projects/lib/discussionChannels.ts",
  "src/features/projects/lib/projectBranches.ts",
  "src/features/projects/lib/projectDetailAgentContext.ts",
  "src/features/projects/lib/projectGitError.ts",
  "src/features/projects/lib/projectLabels.ts",
  "src/features/projects/lib/projectRepoAvailability.ts",
  "src/features/projects/lib/projectSelection.ts",
  "src/features/projects/lib/projectsActivityDigest.ts",
  "src/features/projects/lib/projectsViewHelpers.ts",
  "src/features/projects/projectEnumeration.ts",
  "src/features/projects/projectIssues.mjs",
  "src/features/projects/projectOwnerControl.ts",
  "src/features/projects/projectPullRequests.mjs",
  "src/features/projects/projectTaskCategories.ts",
  "src/features/projects/repoSyncHooks.ts",
  "src/features/projects/ui/AddProjectRepositoryDialog.tsx",
  "src/features/projects/ui/AgentContextPayloadPreview.tsx",
  "src/features/projects/ui/AttachProjectRepositoryDialog.tsx",
  "src/features/projects/ui/CreateIssueDialog.tsx",
  "src/features/projects/ui/CreateProjectFormContent.tsx",
  "src/features/projects/ui/CreateProjectFormSettings.tsx",
  "src/features/projects/ui/CreateProjectIssueDialog.tsx",
  "src/features/projects/ui/CreateProjectWorkItemDialog.tsx",
  "src/features/projects/ui/CreatePullRequestDialog.tsx",
  "src/features/projects/ui/DiscussionChannels.tsx",
  "src/features/projects/ui/IssueAssigneesRow.tsx",
  "src/features/projects/ui/MergePullRequestButton.tsx",
  "src/features/projects/ui/ProjectAgentChatPanel.tsx",
  "src/features/projects/ui/ProjectAgentContextStrip.tsx",
  "src/features/projects/ui/ProjectAgentSelectionComposerBanner.tsx",
  "src/features/projects/ui/ProjectAgentSubmittedContextPill.tsx",
  "src/features/projects/ui/ProjectBranchDialogs.tsx",
  "src/features/projects/ui/ProjectBrowserDialog.tsx",
  "src/features/projects/ui/ProjectCards.tsx",
  "src/features/projects/ui/ProjectChannelHome.tsx",
  "src/features/projects/ui/ProjectChannelManagement.tsx",
  "src/features/projects/ui/ProjectChannelRequestDialog.tsx",
  "src/features/projects/ui/ProjectCommitCopyButton.tsx",
  "src/features/projects/ui/ProjectCommitDetailPanel.tsx",
  "src/features/projects/ui/ProjectConversationPanel.tsx",
  "src/features/projects/ui/ProjectConversationPanelContext.tsx",
  "src/features/projects/ui/ProjectDetailChrome.tsx",
  "src/features/projects/ui/ProjectDetailFeedPanels.tsx",
  "src/features/projects/ui/ProjectDetailScreen.tsx",
  "src/features/projects/ui/ProjectDetailUnavailableState.tsx",
  "src/features/projects/ui/ProjectEntityListRow.tsx",
  "src/features/projects/ui/ProjectHomeCodebasePanel.tsx",
  "src/features/projects/ui/ProjectHomeCommitsPanel.tsx",
  "src/features/projects/ui/ProjectHomeContextPanel.tsx",
  "src/features/projects/ui/ProjectHomeWorkspaceSheet.tsx",
  "src/features/projects/ui/ProjectIssueCommentTimeline.tsx",
  "src/features/projects/ui/ProjectIssuesPanel.tsx",
  "src/features/projects/ui/ProjectOriginReference.tsx",
  "src/features/projects/ui/ProjectProfileIdentity.tsx",
  "src/features/projects/ui/ProjectPullRequestFilesChangedPanel.tsx",
  "src/features/projects/ui/ProjectPullRequestInlineComments.tsx",
  "src/features/projects/ui/ProjectPullRequestsPanel.tsx",
  "src/features/projects/ui/ProjectReadmePanel.tsx",
  "src/features/projects/ui/ProjectRepositoryActionsPanel.tsx",
  "src/features/projects/ui/ProjectRepositoryManagement.tsx",
  "src/features/projects/ui/ProjectRepositoryPanel.tsx",
  "src/features/projects/ui/ProjectRepositorySource.tsx",
  "src/features/projects/ui/ProjectRepositoryUnavailableState.tsx",
  "src/features/projects/ui/ProjectRightPanelControls.tsx",
  "src/features/projects/ui/ProjectSelectableGroup.tsx",
  "src/features/projects/ui/ProjectSelectionDiscussAction.tsx",
  "src/features/projects/ui/ProjectWorkItemCommunicationActions.tsx",
  "src/features/projects/ui/ProjectWorkItemContextDetails.tsx",
  "src/features/projects/ui/ProjectWorkItemRow.tsx",
  "src/features/projects/ui/ProjectWorkspaceTabList.tsx",
  "src/features/projects/ui/ProjectWorkspaceTabs.tsx",
  "src/features/projects/ui/ProjectsActivityFeed.tsx",
  "src/features/projects/ui/ProjectsAgentPromptPage.tsx",
  "src/features/projects/ui/ProjectsCategoryCreateDialogs.tsx",
  "src/features/projects/ui/ProjectsChannelsList.tsx",
  "src/features/projects/ui/ProjectsIssuesList.tsx",
  "src/features/projects/ui/ProjectsListHeaderBar.tsx",
  "src/features/projects/ui/ProjectsOverviewChromeActions.tsx",
  "src/features/projects/ui/ProjectsOverviewContextSheet.tsx",
  "src/features/projects/ui/ProjectsOverviewItems.tsx",
  "src/features/projects/ui/ProjectsOverviewPanel.tsx",
  "src/features/projects/ui/ProjectsPullRequestsList.tsx",
  "src/features/projects/ui/ProjectsSectionSearch.tsx",
  "src/features/projects/ui/ProjectsSelectionCountMenu.tsx",
  "src/features/projects/ui/ProjectsToolbar.tsx",
  "src/features/projects/ui/ProjectsView.tsx",
  "src/features/projects/ui/ProjectsWorkItemTable.tsx",
  "src/features/projects/ui/ProjectsWorkItemsLoadNotice.tsx",
  "src/features/projects/ui/PullRequestMetaRail.tsx",
  "src/features/projects/ui/PullRequestReviewCard.tsx",
  "src/features/projects/ui/PullRequestReviewersRow.tsx",
  "src/features/projects/ui/PullRequestsPanelSurface.tsx",
  "src/features/projects/ui/RepositoryCards.tsx",
  "src/features/projects/ui/ShareLinkButton.tsx",
  "src/features/projects/ui/UnavailableProjectRepositories.tsx",
  "src/features/projects/ui/buildProjectsViewAgentContext.ts",
  "src/features/projects/ui/projectDetailHelpers.ts",
  "src/features/projects/ui/projectsOverviewContext.ts",
  "src/features/projects/ui/projectsViewWorkItems.ts",
  "src/features/projects/ui/useCreateProjectFormSettings.ts",
  "src/features/projects/ui/useOpenProjectTerminal.ts",
  "src/features/projects/ui/useProjectRepositoryOpenActions.ts",
  "src/features/projects/useAddProjectChannel.ts",
  "src/features/projects/useAddProjectRepository.ts",
  "src/features/projects/useProjectChannelRequests.ts",
];

/**
 * `path:line` exceptions. Every entry needs a reason — if a string genuinely
 * is not copy, the comment is how a reviewer checks that claim.
 */
const OVERRIDES = new Map([
  [
    "src/features/projects/lib/projectDetailAgentContext.ts:9",
    "Stable agent-prompt marker. The parser and its tests match this exact English line; it is not rendered as UI copy.",
  ],
  [
    "src/features/projects/lib/projectDetailAgentContext.ts:11",
    "Stable agent-prompt marker. The parser and its tests match this exact English line; it is not rendered as UI copy.",
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
      // A converted file that no longer exists means the ratchet list is
      // stale. Fail loudly rather than quietly checking nothing.
      violations.push({
        file: relativePath,
        line: 0,
        kind: "missing-file",
        text: "listed in CONVERTED_FILES but not found — update the list",
      });
      continue;
    }

    const findings = await checkFileForHardcodedCopy(absolutePath, source);
    for (const finding of findings) {
      const key = `${relativePath}:${finding.line}`;
      if (OVERRIDES.has(key)) continue;
      violations.push({ file: relativePath, ...finding });
    }
  }

  if (violations.length === 0) {
    console.log(
      `i18n coverage: ${CONVERTED_FILES.length} converted file(s) clean.`,
    );
    return;
  }

  console.error("Hardcoded user-facing copy in an i18n-converted file:\n");
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}  [${violation.kind}]  ${JSON.stringify(violation.text)}`,
    );
  }
  console.error(
    [
      "",
      "Wrap JSX text in <Trans>, and copy-bearing props in the t`` macro:",
      "",
      "  <p>Accent color</p>            ->  <p><Trans>Accent color</Trans></p>",
      '  aria-label="Glass opacity"     ->  aria-label={t`Glass opacity`}',
      "",
      "For a module-level table, use msg`` and resolve it per render with",
      "i18n._(descriptor) — a plain string there freezes in the boot locale.",
      "",
      "If a string genuinely is not user-facing copy, add a `path:line` entry",
      "to OVERRIDES in desktop/scripts/check-i18n-coverage.mjs with a reason.",
      "",
      "Then run: pnpm --filter buzz exec lingui extract",
    ].join("\n"),
  );
  process.exitCode = 1;
}

await main();
