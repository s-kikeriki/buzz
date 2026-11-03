import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { AgentManagementMarker } from "@/features/agents/ui/OtherSetupAgentMarker";
import { CopyButton } from "@/features/agents/ui/CopyButton";
import { MemoryRefreshButton } from "@/features/agent-memory/ui/MemorySection";
import {
  PROFILE_PANEL_VIEW_TITLES,
  type ProfilePanelView,
} from "@/features/profile/ui/UserProfilePanelUtils";
import {
  AuxiliaryPanelHeaderActions,
  AuxiliaryPanelHeaderGroup,
  AuxiliaryPanelHeaderTitleBlock,
} from "@/shared/layout/AuxiliaryPanel";
import { Button } from "@/shared/ui/button";

/**
 * `i18n` is a required parameter, not a module import: this builder runs on a
 * render path, and a module-scope default would let a caller resolve the
 * header once and freeze it in the boot locale.
 */
export function getUserProfilePanelHeaderContent({
  agentSettingsMenu,
  effectivePubkey,
  i18n,
  ownerPubkey,
  logCopyValue,
  logSubtitle,
  onBack,
  onEditAgent,
  view,
  viewerIsOwner,
}: {
  agentSettingsMenu: ReactNode;
  effectivePubkey: string | null;
  i18n: I18n;
  ownerPubkey?: string | null;
  logCopyValue?: string | null;
  logSubtitle?: string | null;
  onBack: () => void;
  onEditAgent?: () => void;
  view: ProfilePanelView;
  viewerIsOwner: boolean;
}) {
  const title = i18n._(PROFILE_PANEL_VIEW_TITLES[view]);
  const shouldShowLogDetails =
    (view === "diagnostics" || view === "logs") && Boolean(logSubtitle);
  const headerLeftContent = (
    <AuxiliaryPanelHeaderGroup
      align={shouldShowLogDetails ? "start" : "center"}
      backButtonAriaLabel={i18n._(msg`Back to profile`)}
      backButtonTestId="user-profile-panel-back"
      onBack={view !== "summary" ? onBack : undefined}
    >
      <AuxiliaryPanelHeaderTitleBlock
        subtitle={shouldShowLogDetails ? logSubtitle : null}
        subtitleTitle={logSubtitle ?? undefined}
        title={title}
      />
      {view !== "summary" ? (
        <AgentManagementMarker
          pubkey={effectivePubkey}
          ownerPubkey={ownerPubkey}
          testId="user-profile-header-agent-provenance"
        />
      ) : null}
    </AuxiliaryPanelHeaderGroup>
  );
  const headerActions = (
    <AuxiliaryPanelHeaderActions>
      {view === "memories" && viewerIsOwner && effectivePubkey ? (
        <MemoryRefreshButton
          agentPubkey={effectivePubkey}
          variant="outline"
          viewerIsOwner={viewerIsOwner}
        />
      ) : null}
      {view === "summary" ? agentSettingsMenu : null}
      {view === "summary" && onEditAgent ? (
        <Button
          aria-label={i18n._(msg`Edit agent`)}
          className="text-sm"
          data-testid="user-profile-header-edit-agent"
          onClick={onEditAgent}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trans>Edit</Trans>
        </Button>
      ) : null}
      {shouldShowLogDetails ? (
        <CopyButton
          className="text-muted-foreground hover:text-foreground"
          iconOnly
          label={i18n._(msg`Copy log`)}
          size="icon"
          value={logCopyValue ?? ""}
          variant="ghost"
        />
      ) : null}
    </AuxiliaryPanelHeaderActions>
  );

  return { headerActions, headerLeftContent };
}
