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
  dialogTitle: "Add agent",
  dialogDescription: "Browse agents shared to this relay.",
  emptyTitle: "You're all set",
  emptyDescription: "Everything in Agent Catalog is already in My Agents.",
  emptyCatalogDescription: "Shared agents will appear here.",
  emptyCatalogTitle: "No agents are being shared",
  detailsAction: "View details",
  selectAction: "Choose",
  deselectAction: "Deselect",
  selectedState: "Selected",
  availableState: "Available",
  detailSelectedTitle: "Selected for My Agents",
  detailSelectedDescription:
    "Turn this off to remove the agent from teams and agent creation in this app.",
  detailAvailableTitle: "Available in Agent Catalog",
  detailAvailableDescription:
    "Turn this on to make the agent available for teams and agent creation.",
  useAction: "Add agent",
  addedAction: "Added to My Agents",
  teamEmptyState:
    "No agents in My Agents yet. Create one or choose one from Agent Catalog first.",
} as const;

export function getPersonaCatalogSelectionActionCopy(isActive: boolean) {
  return isActive
    ? personaCatalogCopy.deselectAction
    : personaCatalogCopy.selectAction;
}

export function getPersonaCatalogSelectionAriaLabel(
  displayName: string,
  isActive: boolean,
) {
  return t`${isActive ? "Deselect" : "Select"} ${displayName} in My Agents`;
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
