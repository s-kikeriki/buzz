import { useLingui } from "@lingui/react/macro";
import { LoaderCircle } from "lucide-react";

import { UserAvatar } from "@/shared/ui/UserAvatar";
import { splitWorkflowAuthorDescription } from "./workflowTriggerDescription";
import type { WorkflowTriggerDescriptor } from "./workflowTriggerDescriptor";

export function WorkflowRichTriggerDescription({
  avatarUrl,
  description,
  descriptor,
  isAgent,
  label,
  loading,
}: {
  avatarUrl?: string | null;
  description: string;
  descriptor?: WorkflowTriggerDescriptor | null;
  isAgent?: boolean;
  label?: string | null;
  loading?: boolean;
}) {
  const { i18n, t } = useLingui();

  if (loading) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{description}</span>
        <LoaderCircle
          aria-label={t`Loading author`}
          className="h-3.5 w-3.5 shrink-0 animate-spin"
          role="status"
        />
      </span>
    );
  }

  // The avatar goes where the sentence puts the author's name, which only the
  // sentence knows: the name can sit anywhere in it, and in German it sits
  // somewhere else again. The renderer marks that position itself rather than
  // searching the finished sentence for the name.
  const segments = descriptor
    ? splitWorkflowAuthorDescription(descriptor, i18n)
    : null;
  if (!label || !segments) return description;

  const { prefix, suffix } = segments;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {prefix ? <span className="shrink-0">{prefix}</span> : null}
      <UserAvatar
        avatarUrl={avatarUrl ?? null}
        className="h-4 w-4"
        displayName={label}
        fallbackDelayMs={0}
        shape={isAgent ? "squircle" : "circle"}
        size="xs"
        testId="workflow-trigger-author-avatar"
      />
      <span className="min-w-0 truncate">
        {label}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </span>
  );
}
