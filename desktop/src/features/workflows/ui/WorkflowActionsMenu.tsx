import { Trans, useLingui } from "@lingui/react/macro";
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Play,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type WorkflowActionsMenuProps = {
  isEnabled: boolean;
  isTogglingEnabled?: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onToggleEnabled: () => void;
  onTrigger: () => void;
  showEnabledToggle?: boolean;
};

export function WorkflowActionsMenu({
  isEnabled,
  isTogglingEnabled = false,
  onDelete,
  onDuplicate,
  onEdit,
  onToggleEnabled,
  onTrigger,
  showEnabledToggle = true,
}: WorkflowActionsMenuProps) {
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`Workflow actions`}
          className="h-8 w-8 text-muted-foreground hover:bg-background/80 hover:text-foreground data-[state=open]:bg-background/80 data-[state=open]:text-foreground"
          size="icon"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onTrigger}>
          <Play className="mr-2 h-4 w-4" />
          {/*
            Same collision the detail panel's button already carries a context
            for: `Trigger` is the canvas node and the template-variable group
            heading (a noun, "Auslöser") and this menu item (a verb,
            "Auslösen"). One msgid holds one translation, so this one reuses
            that context rather than quietly inheriting the noun.
          */}
          {t({
            message: `Trigger`,
            context: "button that runs a workflow now",
          })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          <Trans>Edit</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          <Trans>Duplicate</Trans>
        </DropdownMenuItem>
        {showEnabledToggle ? (
          <DropdownMenuCheckboxItem
            checked={isEnabled}
            className="gap-2 pl-2 [&>span:first-child]:hidden"
            disabled={isTogglingEnabled}
            onCheckedChange={(checked) => {
              if (checked !== isEnabled) onToggleEnabled();
            }}
            onSelect={(event) => event.preventDefault()}
          >
            {isEnabled ? (
              <Power className="mr-2 h-4 w-4 shrink-0" />
            ) : (
              <PowerOff className="mr-2 h-4 w-4 shrink-0" />
            )}
            <span>
              <Trans>Enable</Trans>
            </span>
            <span
              aria-hidden="true"
              className={
                "ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors " +
                (isEnabled ? "bg-primary" : "bg-input")
              }
              data-testid="workflow-enabled-switch-visual"
            >
              <span
                className={
                  "block h-4 w-4 rounded-full bg-background transition-transform " +
                  (isEnabled ? "translate-x-4" : "translate-x-0")
                }
              />
            </span>
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          <Trans>Delete</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
