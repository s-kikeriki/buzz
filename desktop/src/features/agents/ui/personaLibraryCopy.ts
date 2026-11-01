import { msg, t } from "@lingui/core/macro";
export const personaLibraryCopy = {
  title: msg`My agents`,
  description: msg`The agents you have chosen for this app. Use them to create teams and launch agents.`,
  chooseFromCatalog: msg`Choose from catalog`,
  createNew: msg`New agent`,
  import: msg`Import snapshot`,
  emptyTitle: msg`No agents yet`,
  emptyDescription: msg`Choose one from Agent Catalog, create your own, or import one to get started.`,
  emptyImportHint: msg`Or drop an .agent.json or .agent.png snapshot here to import.`,
} as const;

export const personaCatalogCopy = {
  title: msg`Agent Catalog`,
  description: msg`Browse agents shared to this relay.`,
  dialogTitle: msg`Add agent`,
  dialogDescription: msg`Browse agents shared to this relay.`,
  emptyTitle: msg`You're all set`,
  emptyDescription: msg`Everything in Agent Catalog is already in My Agents.`,
  emptyCatalogDescription: msg`Shared agents will appear here.`,
  emptyCatalogTitle: msg`No agents are being shared`,
  detailsAction: msg`View details`,
  selectAction: msg`Choose`,
  deselectAction: msg`Deselect`,
  selectedState: msg`Selected`,
  availableState: msg`Available`,
  detailSelectedTitle: msg`Selected for My Agents`,
  detailSelectedDescription: msg`Turn this off to remove the agent from teams and agent creation in this app.`,
  detailAvailableTitle: msg`Available in Agent Catalog`,
  detailAvailableDescription: msg`Turn this on to make the agent available for teams and agent creation.`,
  useAction: msg`Add agent`,
  addedAction: msg`Added to My Agents`,
  teamEmptyState: msg`No agents in My Agents yet. Create one or choose one from Agent Catalog first.`,
} as const;

export function getPersonaCatalogSelectionActionCopy(isActive: boolean) {
  return isActive
    ? personaCatalogCopy.deselectAction
    : personaCatalogCopy.selectAction;
}

/**
 * Two whole sentences, not one with the verb interpolated.
 *
 * `t`${isActive ? "Deselect" : "Select"} …`` looks translated and is not: the
 * verb is substituted after the lookup, so the German catalogue holds
 * "{0} {displayName} in My Agents" and a screen reader announces an English
 * verb inside a German label. German also moves the verb, which a placeholder
 * at the front cannot express.
 */
export function getPersonaCatalogSelectionAriaLabel(
  displayName: string,
  isActive: boolean,
) {
  return isActive
    ? t`Deselect ${displayName} in My Agents`
    : t`Select ${displayName} in My Agents`;
}

export function getPersonaCatalogDetailSelectionCopy(isActive: boolean) {
  return isActive
    ? {
        title: personaCatalogCopy.detailSelectedTitle,
        description: personaCatalogCopy.detailSelectedDescription,
      }
    : {
        title: personaCatalogCopy.detailAvailableTitle,
        description: personaCatalogCopy.detailAvailableDescription,
      };
}
