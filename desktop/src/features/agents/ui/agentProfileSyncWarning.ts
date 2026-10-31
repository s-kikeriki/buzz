import { t } from "@lingui/core/macro";
import { toast } from "sonner";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

export function showAgentProfileSyncWarning(
  agentName: string,
  profileSyncError: string | null,
) {
  if (!profileSyncError) return;
  toast.warning(
    t`${agentName} was saved locally, but relay sync failed: ${profileSyncError}. Remote users may still see the previous name or access policy until ${productName} retries the sync.`,
  );
}
