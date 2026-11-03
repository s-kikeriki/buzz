import { useLingui } from "@lingui/react/macro";

import { BRAND } from "@/shared/branding/brand";
import { RecoveryScreen } from "./RecoveryScreen";

export function RelaunchRequiredScreen() {
  const { t } = useLingui();
  return (
    <RecoveryScreen
      testId="relaunch-required"
      title={t`Restart ${BRAND.productName} to finish recovery`}
      body={t`Your identity was updated. ${BRAND.productName} needs to restart so syncing and agents run under it.`}
    />
  );
}
