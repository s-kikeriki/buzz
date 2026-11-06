import { useLingui } from "@lingui/react/macro";

import { BRAND } from "@/shared/branding/brand";
import { RecoveryScreen } from "./RecoveryScreen";

export function ResetFailedScreen() {
  const { t } = useLingui();
  return (
    <RecoveryScreen
      testId="reset-failed"
      title={t`Sign out could not complete`}
      body={t`${BRAND.productName} was unable to fully clear your local data. Try relaunching — the reset will resume automatically. If this persists, contact support.`}
    />
  );
}
