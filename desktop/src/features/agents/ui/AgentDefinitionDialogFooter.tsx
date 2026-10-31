import { Trans, useLingui } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { Button } from "@/shared/ui/button";

type AgentDefinitionDialogFooterProps = {
  canSubmit: boolean;
  isAvatarUploadPending: boolean;
  isPending: boolean;
  onCancel: () => void;
  publishesCatalogUpdates: boolean;
  submitLabel: string;
};

export function AgentDefinitionDialogFooter({
  canSubmit,
  isAvatarUploadPending,
  isPending,
  onCancel,
  publishesCatalogUpdates,
  submitLabel,
}: AgentDefinitionDialogFooterProps) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-3">
        {publishesCatalogUpdates ? (
          <p
            className="max-w-sm text-xs text-muted-foreground"
            data-testid="persona-dialog-catalog-publish-notice"
          >
            <Trans>
              This agent is in the community catalog. Your changes will be
              published when you save.
            </Trans>
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={isPending || isAvatarUploadPending}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          data-testid="persona-dialog-submit"
          disabled={!canSubmit}
          form="persona-dialog-form"
          type="submit"
        >
          {isPending
            ? "Saving..."
            : isAvatarUploadPending
              ? "Uploading..."
              : publishesCatalogUpdates
                ? t`Save and publish`
                : submitLabel}
        </Button>
      </div>
    </div>
  );
}
