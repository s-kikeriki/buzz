import { useLingui } from "@lingui/react";

import { useUsersBatchQuery } from "@/features/profile/hooks";
import { resolveUserLabel } from "@/features/profile/lib/identity";
import { useIdentityQuery } from "@/shared/api/hooks";
import { parseConditionExpressions } from "./workflowConditionExpression";
import { TRIGGER_LABELS } from "./workflowFormTypes";
import type { TriggerConfig } from "./workflowFormTypes";
import { workflowTriggerDescriptorText } from "./workflowTriggerDescription";
import { workflowTriggerDescriptor } from "./workflowTriggerDescriptor";
import type { WorkflowTriggerDescriptor } from "./workflowTriggerDescriptor";

const FULL_HEX_PUBKEY = /^[0-9a-f]{64}$/i;

export type WorkflowAuthorPresentation = {
  avatarUrl: string | null;
  description: string;
  descriptor: WorkflowTriggerDescriptor | null;
  isAgent: boolean;
  label: string | null;
  loading: boolean;
  pubkey: string | null;
};

export function workflowTriggerAuthorPubkey(
  trigger: TriggerConfig,
): string | null {
  const conditions = trigger.filter
    ? parseConditionExpressions(trigger.filter, trigger.on)
    : [];
  const condition = conditions?.find(({ field }) => field === "trigger_author");
  return condition && FULL_HEX_PUBKEY.test(condition.value)
    ? condition.value.toLowerCase()
    : null;
}

export function useWorkflowAuthorPresentation(
  trigger: TriggerConfig,
): WorkflowAuthorPresentation {
  const { i18n } = useLingui();
  const identityQuery = useIdentityQuery();
  const pubkey = workflowTriggerAuthorPubkey(trigger);
  const profilesQuery = useUsersBatchQuery(pubkey ? [pubkey] : []);
  const profile = pubkey ? profilesQuery.data?.profiles[pubkey] : undefined;
  const loading = Boolean(pubkey && !profile && profilesQuery.isPending);
  const label =
    pubkey && !loading
      ? resolveUserLabel({
          currentPubkey: identityQuery.data?.pubkey,
          profiles: profilesQuery.data?.profiles,
          pubkey,
        })
      : null;

  const descriptor = workflowTriggerDescriptor(trigger, {
    authorLabel: label ?? undefined,
    authorLoading: loading,
  });

  return {
    avatarUrl: profile?.avatarUrl ?? null,
    description: descriptor
      ? workflowTriggerDescriptorText(descriptor, i18n)
      : i18n._(TRIGGER_LABELS[trigger.on]),
    descriptor,
    isAgent: profile?.isAgent === true,
    label,
    loading,
    pubkey,
  };
}
