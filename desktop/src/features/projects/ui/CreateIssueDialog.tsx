import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
  CreateProjectWorkItemDialog,
  type CreateProjectWorkItemDialogInput,
} from "./CreateProjectWorkItemDialog";

export type CreateIssueDialogInput = CreateProjectWorkItemDialogInput;

export function CreateIssueDialog({
  isCreating,
  onCreate,
  onOpenChange,
  open,
  projectName,
}: {
  isCreating: boolean;
  onCreate: (input: CreateIssueDialogInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectName: string;
}) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <CreateProjectWorkItemDialog
      bodyPlaceholder="Add context, expected behavior, or reproduction steps"
      description={t`Create a task in ${projectName}`}
      isCreating={isCreating}
      itemName="issue"
      onCreate={onCreate}
      onOpenChange={onOpenChange}
      open={open}
      title={t`Create a task`}
      titlePlaceholder="Describe the task"
    />
  );
}
