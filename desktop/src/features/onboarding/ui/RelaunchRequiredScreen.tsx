import { BRAND } from "@/shared/branding/brand";
import { RecoveryScreen } from "./RecoveryScreen";

export function RelaunchRequiredScreen() {
  return (
    <RecoveryScreen
      testId="relaunch-required"
      title={`Restart ${BRAND.productName} to finish recovery`}
      body={`Your identity was updated. ${BRAND.productName} needs to restart so syncing and agents run under it.`}
    />
  );
}
