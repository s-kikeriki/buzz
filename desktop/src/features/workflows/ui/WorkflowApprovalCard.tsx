import { Trans } from "@lingui/react/macro";

import type { WorkflowApproval } from "@/shared/api/types";
import { localeDateTime } from "@/shared/lib/intlLocale";
import { useLocale } from "@/shared/lib/localePreference";

type WorkflowApprovalCardProps = {
  approval: WorkflowApproval;
};

export function WorkflowApprovalCard({ approval }: WorkflowApprovalCardProps) {
  const locale = useLocale();
  const isExpired = new Date(approval.expiresAt) < new Date();
  const expiresAt = localeDateTime(new Date(approval.expiresAt), locale);

  if (approval.status !== "pending" || isExpired) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
      data-testid="workflow-approval-card"
    >
      <p className="mb-2 text-sm font-medium">
        <Trans>Approval Required</Trans>
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        <Trans>Approver: {approval.approverSpec}</Trans>
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        <Trans>Expires: {expiresAt}</Trans>
      </p>
      <p className="text-xs text-muted-foreground" role="status">
        <Trans>Approval actions are not yet available in Desktop.</Trans>
      </p>
    </div>
  );
}
