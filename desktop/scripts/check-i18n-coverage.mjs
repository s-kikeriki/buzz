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
  // Tranche 5 — the agents area.
  "src/features/agents/cardMintStore.ts",
  "src/features/agents/channelAgents.ts",
  "src/features/agents/hooks.ts",
  "src/features/agents/lib/agentAccessWarning.ts",
  "src/features/agents/lib/agentCardModelLabel.ts",
  "src/features/agents/lib/agentConfigCore.ts",
  "src/features/agents/lib/agentParallelism.ts",
  "src/features/agents/lib/friendlyAgentLastError.ts",
  "src/features/agents/lib/instanceInputForDefinition.ts",
  "src/features/agents/lib/managedAgentControlActions.ts",
  "src/features/agents/lib/personaSaveNotice.ts",
  "src/features/agents/lib/resolvePersonaRuntime.ts",
  "src/features/agents/lib/useAgentAvailability.ts",
  "src/features/agents/managedAgentRuntimeStatus.ts",
  "src/features/agents/observerRelayStore.ts",
  "src/features/agents/ui/AcpCommandField.tsx",
  "src/features/agents/ui/AddAgentToChannelDialog.tsx",
  "src/features/agents/ui/AddCustomHarnessDialog.tsx",
  "src/features/agents/ui/AddTeamToChannelDialog.tsx",
  "src/features/agents/ui/AdvancedRequiredBadge.tsx",
  "src/features/agents/ui/AgentAiConfigurationMode.tsx",
  "src/features/agents/ui/AgentAiDefaults.tsx",
  "src/features/agents/ui/AgentCardMintDialog.tsx",
  "src/features/agents/ui/AgentCardViewerDialog.tsx",
  "src/features/agents/ui/AgentConfigFields.tsx",
  "src/features/agents/ui/AgentConfigPanel.tsx",
  "src/features/agents/ui/AgentCreationPreview.tsx",
  "src/features/agents/ui/AgentDefaultsDialog.tsx",
  "src/features/agents/ui/AgentDefaultsEditor.tsx",
  "src/features/agents/ui/AgentDefinitionDialog.tsx",
  "src/features/agents/ui/AgentDefinitionDialogFooter.tsx",
  "src/features/agents/ui/AgentDefinitionMetadata.tsx",
  "src/features/agents/ui/AgentDescriptionField.tsx",
  "src/features/agents/ui/AgentHarnessField.tsx",
  "src/features/agents/ui/AgentInstanceEditDialog.tsx",
  "src/features/agents/ui/AgentManagementDialogs.tsx",
  "src/features/agents/ui/AgentRuntimeAvatarControl.tsx",
  "src/features/agents/ui/AgentSessionToolItem/CompactMessageSummary.tsx",
  "src/features/agents/ui/AgentSessionToolItem/SentMessageContextDialog.tsx",
  "src/features/agents/ui/AgentSessionToolItem/TodoToolSummary.tsx",
  "src/features/agents/ui/AgentSessionToolItem/ToolDetailBlocks.tsx",
  "src/features/agents/ui/AgentSessionToolItem/ViewImageToolPreview.tsx",
  "src/features/agents/ui/AgentSessionTranscriptList.tsx",
  "src/features/agents/ui/AgentSnapshotExportDialog.tsx",
  "src/features/agents/ui/AgentSnapshotImportDialog.tsx",
  "src/features/agents/ui/AgentsView.tsx",
  "src/features/agents/ui/CardMintComposerChip.tsx",
  "src/features/agents/ui/CardMintKeyCue.tsx",
  "src/features/agents/ui/CommunityCatalogDialog.tsx",
  "src/features/agents/ui/EditAgentAdvancedFields.tsx",
  "src/features/agents/ui/EditAgentProviderModelFields.tsx",
  "src/features/agents/ui/EffortPickerField.tsx",
  "src/features/agents/ui/EnvVarsEditor.tsx",
  "src/features/agents/ui/HarnessCatalogRetryNotice.tsx",
  "src/features/agents/ui/ManagedAgentLogPanel.tsx",
  "src/features/agents/ui/ManagedAgentRow.tsx",
  "src/features/agents/ui/ManagedAgentSessionPanel.tsx",
  "src/features/agents/ui/McpServersSection.tsx",
  "src/features/agents/ui/ModelPicker.tsx",
  "src/features/agents/ui/OtherSetupAgentMarker.tsx",
  "src/features/agents/ui/OwnerOnlyAccessField.tsx",
  "src/features/agents/ui/PersonaActionsMenu.tsx",
  "src/features/agents/ui/PersonaAddedBy.tsx",
  "src/features/agents/ui/PersonaAdvancedFields.tsx",
  "src/features/agents/ui/PersonaDeleteDialog.tsx",
  "src/features/agents/ui/PersonaModelCombobox.tsx",
  "src/features/agents/ui/PersonaModelField.tsx",
  "src/features/agents/ui/PersonaProviderApiKeyField.tsx",
  "src/features/agents/ui/PersonaShareDialog.tsx",
  "src/features/agents/ui/PersonaShareRecipients.tsx",
  "src/features/agents/ui/PromptSectionAccordion.tsx",
  "src/features/agents/ui/RawEventRail.tsx",
  "src/features/agents/ui/RemoveMembersConfirmDialog.tsx",
  "src/features/agents/ui/RespondToField.tsx",
  "src/features/agents/ui/RestartDiffBadge.tsx",
  "src/features/agents/ui/RunOnSummarySection.tsx",
  "src/features/agents/ui/TeamDeleteDialog.tsx",
  "src/features/agents/ui/TeamDialog.tsx",
  "src/features/agents/ui/TeamIdentityCard.tsx",
  "src/features/agents/ui/TeamShareDialog.tsx",
  "src/features/agents/ui/TeamSnapshotExportDialog.tsx",
  "src/features/agents/ui/TeamSnapshotImportDialog.tsx",
  "src/features/agents/ui/TeamsSection.tsx",
  "src/features/agents/ui/TurnLivenessIndicator.tsx",
  "src/features/agents/ui/UnifiedAgentsSection.tsx",
  "src/features/agents/ui/WhereToRunSection.tsx",
  "src/features/agents/ui/acpCommandPicker.ts",
  "src/features/agents/ui/activityRenderClasses/MessageLinkHoverCue.tsx",
  "src/features/agents/ui/activityRenderClasses/PlanActivity.tsx",
  "src/features/agents/ui/activityRenderClasses/RawRailActivity.tsx",
  "src/features/agents/ui/activityRenderClasses/ThoughtActivity.tsx",
  "src/features/agents/ui/activityRenderClasses/UserMessageBubble.tsx",
  "src/features/agents/ui/addCustomHarness.ts",
  "src/features/agents/ui/agentAiConfigurationPolicy.ts",
  "src/features/agents/ui/agentConfigControls.tsx",
  "src/features/agents/ui/agentConfigOptions.tsx",
  "src/features/agents/ui/agentProfileSyncWarning.ts",
  "src/features/agents/ui/agentSessionToolCatalog.ts",
  "src/features/agents/ui/agentSessionToolClassifier.ts",
  "src/features/agents/ui/agentSessionToolSummary.ts",
  "src/features/agents/ui/agentSessionTranscript.ts",
  "src/features/agents/ui/agentSessionTranscriptGrouping.ts",
  "src/features/agents/ui/agentSessionTranscriptHelpers.ts",
  "src/features/agents/ui/agentSessionTranscriptPresentation.ts",
  "src/features/agents/ui/agentUi.ts",
  "src/features/agents/ui/bakedEnvHelpers.ts",
  "src/features/agents/ui/buzzAgentModelTuningFields.tsx",
  "src/features/agents/ui/cardMintKeyUtils.ts",
  "src/features/agents/ui/catalogOwnerLabel.ts",
  "src/features/agents/ui/effortPicker.ts",
  "src/features/agents/ui/personaDialogState.ts",
  "src/features/agents/ui/personaLibraryCopy.ts",
  "src/features/agents/ui/personaModelDiscoveryStatus.ts",
  "src/features/agents/ui/providerApiKeyFieldState.ts",
  "src/features/agents/ui/relayMeshModelPicker.ts",
  "src/features/agents/ui/runOnSummary.ts",
  "src/features/agents/ui/runtimeAvailabilityWarning.ts",
  "src/features/agents/ui/teamLibraryCopy.ts",
  "src/features/agents/ui/teamSnapshotImport.lib.ts",
  "src/features/agents/ui/useManagedAgentActions.ts",
  "src/features/agents/ui/usePersonaActions.ts",
  "src/features/agents/ui/usePersonaModelDiscovery.ts",
  "src/features/agents/ui/useSnapshotSendController.ts",
  "src/features/agents/ui/useTeamActions.ts",
  "src/features/agents/useAgentManagement.ts",
  "src/features/agents/useCreatedAgentChannelAttachment.ts",
  "src/features/agents/useOpenAgentActivity.ts",
  // Tranche 4 — the rest of Settings. Appearance, language, the nav rail and
  // the shortcut table were already here; this is every other panel a person
  // reaches from it: profile and identity, notifications and sounds, voice,
  // agents and the harness catalogue, channel templates, hosted communities,
  // mobile pairing, experiments, updates, and the key-backup flows.
  "src/features/settings/EncryptedBackupProvider.tsx",
  "src/features/settings/SidebarUpdateCard.tsx",
  "src/features/settings/UpdateChecker.tsx",
  "src/features/settings/UpdateIndicator.tsx",
  "src/features/settings/ui/AgentDefaultsSettingsCard.tsx",
  "src/features/settings/ui/AgentsSettingsPanel.tsx",
  "src/features/settings/ui/BackupTestFlow.tsx",
  "src/features/settings/ui/ChannelTemplatesSettingsCard.tsx",
  "src/features/settings/ui/CustomHarnessForm.tsx",
  "src/features/settings/ui/EncryptedBackupCreator.tsx",
  "src/features/settings/ui/ExperimentalFeaturesCard.tsx",
  "src/features/settings/ui/HarnessCatalogDialog.tsx",
  "src/features/settings/ui/HarnessRow.tsx",
  "src/features/settings/ui/HarnessesSettingsPanel.tsx",
  "src/features/settings/ui/HostedCommunitiesSettingsCard.tsx",
  "src/features/settings/ui/MobilePairingCard.tsx",
  "src/features/settings/ui/NotificationSettingsCard.tsx",
  "src/features/settings/ui/PreventSleepSettingsCard.tsx",
  "src/features/settings/ui/PrivateKeyBackupRow.tsx",
  "src/features/settings/ui/ProfileSettingsCard.tsx",
  "src/features/settings/ui/SendFeedbackDialog.tsx",
  "src/features/settings/ui/SettingsPanels.tsx",
  "src/features/settings/ui/SignOutSection.tsx",
  "src/features/settings/ui/SoundPicker.tsx",
  "src/features/settings/ui/VoiceSettingsCard.tsx",
  // Libraries that *produce* settings copy. None of these renders anything,
  // so no JSX node mentions their strings: the harness status chips, the
  // curated runtime descriptions, the comma-in-argument error, the
  // delete-blast-radius warning, and the notification slot labels and
  // descriptions all come from here. `sound.ts` lives under `notifications`
  // but its only copy consumer is the Notifications panel.
  "src/features/notifications/lib/sound.ts",
  "src/features/settings/ui/harnessCatalogCopy.ts",
  "src/features/settings/ui/harnessCatalogLogic.ts",
  "src/features/settings/ui/harnessFormLogic.ts",
  "src/features/settings/ui/harnessGalleryLogic.ts",
  // Tranche 5 — the channel area: everything inside `features/channels`.
  // 281 call sites across 43 files, measured with the coverage detector rather
  // than estimated. The libraries are listed with the components because they
  // *produce* copy — the canvas conflict guidance, the channel tooltip, the
  // lifecycle label and the channel-kind noun phrase all come from there and
  // appear in no JSX node.
  "src/features/channels/canvasConflict.ts",
  "src/features/channels/lib/channelDescription.ts",
  "src/features/channels/lib/channelLifecycle.ts",
  "src/features/channels/lib/channelMemberAdmission.ts",
  "src/features/channels/ui/AddChannelBotDialog.tsx",
  "src/features/channels/ui/AddChannelBotGenericSection.tsx",
  "src/features/channels/ui/AddChannelBotPersonasSection.tsx",
  "src/features/channels/ui/AddChannelBotReuseGuard.tsx",
  "src/features/channels/ui/AddChannelBotTeamsSection.tsx",
  "src/features/channels/ui/AddMemberSearchResultRow.tsx",
  "src/features/channels/ui/AgentSessionThreadPanel.tsx",
  "src/features/channels/ui/BotActivityBar.tsx",
  "src/features/channels/ui/CanvasHistoryPanel.tsx",
  "src/features/channels/ui/ChannelCanvas.tsx",
  "src/features/channels/ui/ChannelLogoEditor.tsx",
  "src/features/channels/ui/ChannelManagementModerationActions.tsx",
  "src/features/channels/ui/ChannelManagementSheet.tsx",
  "src/features/channels/ui/ChannelManagementSheetRows.tsx",
  "src/features/channels/ui/ChannelMemberAvatarStack.tsx",
  "src/features/channels/ui/ChannelMemberInviteCard.tsx",
  "src/features/channels/ui/ChannelMembersBar.tsx",
  "src/features/channels/ui/ChannelPane.helpers.ts",
  "src/features/channels/ui/ChannelPane.tsx",
  "src/features/channels/ui/ChannelPermissionsSettings.tsx",
  "src/features/channels/ui/ChannelScreenEmptyState.tsx",
  "src/features/channels/ui/ChannelScreenHeader.tsx",
  "src/features/channels/ui/ChannelTypePicker.tsx",
  "src/features/channels/ui/ChannelTypeSettings.tsx",
  "src/features/channels/ui/ChannelWorkflowsSection.tsx",
  "src/features/channels/ui/EditRespondToDialog.tsx",
  "src/features/channels/ui/FocusThreadDrawer.tsx",
  "src/features/channels/ui/ForumChannelContent.tsx",
  "src/features/channels/ui/MembersSidebar.tsx",
  "src/features/channels/ui/MembersSidebarAgentControls.tsx",
  "src/features/channels/ui/MembersSidebarMemberCard.tsx",
  "src/features/channels/ui/QuickBotBar.tsx",
  "src/features/channels/ui/RightAuxiliaryPane.tsx",
  "src/features/channels/ui/ThreadViewModeToggle.tsx",
  "src/features/channels/ui/WelcomeAgentCreateDialog.tsx",
  "src/features/channels/ui/WelcomeComposerBanner.tsx",
  "src/features/channels/ui/useChannelIntro.tsx",
  "src/features/channels/ui/useMembersSidebarActions.ts",
  "src/features/channels/ui/useMembersSidebarModeration.ts",
  "src/features/channels/ui/useQuickBotDrop.ts",
  "src/features/channels/useWelcomeAgentCreate.ts",
  // Three files outside `features/channels` are converted here because the
  // copy they render belongs to the channel area and is imported from it:
  // `PRIVATE_CHANNEL_ADD_DENIED_MESSAGE` (channels/lib) is set or rendered by
  // all three, and `ChannelIntroBlock` holds the frame the channel-kind
  // descriptors are translated for. Converting the string without its
  // readers would have left the German phrase inside an English sentence.
  "src/features/forum/ui/useForumMentionPreparation.ts",
  "src/features/messages/ui/ChannelIntroBlock.tsx",
  "src/features/messages/ui/NonMemberMentionDialog.tsx",
  "src/features/messages/ui/useNonMemberInvite.ts",
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
  [
    "src/features/agents/lib/friendlyAgentLastError.ts:49",
    "JSON-RPC machine token. The function compares the harness message to this exact English string before choosing the translated hint.",
  ],
  [
    "src/features/agents/managedAgentRuntimeStatus.ts:13",
    "Status token compared by the sidebar and its tests. The badge translates it at the render site.",
  ],
  // Input placeholders that are examples of a *format*, not prose: a German
  // reader needs the same `my-runtime`, the same shell command and the same
  // `npub1…` prefix, because what they type has to match the format, not the
  // sentence. The detector flags any copy-bearing prop containing a letter,
  // which is the right default — these are the exceptions to it.
  [
    "src/features/settings/ui/CustomHarnessForm.tsx:175",
    "`KEY` is the literal shape of an environment-variable name, not a word.",
  ],
  [
    "src/features/settings/ui/CustomHarnessForm.tsx:371",
    "Example id showing the required lowercase-hyphenated format.",
  ],
  [
    "src/features/settings/ui/CustomHarnessForm.tsx:394",
    "Example executable name; a translated binary name would be misleading.",
  ],
  [
    "src/features/settings/ui/CustomHarnessForm.tsx:444",
    "Example URL. `example.com` is reserved for exactly this and is not prose.",
  ],
  [
    "src/features/settings/ui/CustomHarnessForm.tsx:465",
    "Example shell command; npm's flags are the same in every language.",
  ],
  [
    "src/features/settings/ui/HostedCommunitiesSettingsCard.tsx:1040",
    "`npub1…` is the literal prefix of a Nostr public key.",
  ],
  [
    "src/features/settings/ui/HarnessesSettingsPanel.tsx:40",
    "Git Bash is a product name, and the row is about that product.",
  ],
  [
    "src/features/channels/ui/WelcomeComposerBanner.tsx:251",
    "`@Fizz` is the welcome agent's handle, read out by the screen-reader-only " +
      "twin of the animated mention. A name, not copy — translating it would " +
      "announce an agent that does not exist. The visible half renders the " +
      "same handle from `WELCOME_PERSONA_NAMES`.",
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

  // An override that no longer matches anything is worse than a missing one:
  // the line numbers drift every time somebody edits above them, and a drifted
  // entry silently exempts whatever the next person writes on that line. This
  // list was empty until the Settings tranche, so nothing had carried the cost
  // of a stale entry yet; `check-product-name.mjs` already does this and this
  // is the same check against the same failure.
  for (const key of OVERRIDES.keys()) {
    const separator = key.lastIndexOf(":");
    const relativePath = key.slice(0, separator);
    const lineText = key.slice(separator + 1);
    const absolutePath = path.join(projectRoot, relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      violations.push({
        file: relativePath,
        line: 0,
        kind: "missing-file",
        text: "has an override but the file is missing",
      });
      continue;
    }
    const findings = await checkFileForHardcodedCopy(absolutePath, source);
    if (!findings.some((finding) => String(finding.line) === lineText)) {
      violations.push({
        file: relativePath,
        line: Number(lineText),
        kind: "stale-override",
        text: "nothing on this line is hardcoded copy — remove or move it",
      });
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
