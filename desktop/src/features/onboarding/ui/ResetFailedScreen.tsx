import { BRAND } from "@/shared/branding/brand";
import { RecoveryScreen } from "./RecoveryScreen";

export function ResetFailedScreen() {
  return (
    <RecoveryScreen
      testId="reset-failed"
      title="Sign out could not complete"
      body={`${BRAND.productName} was unable to fully clear your local data. Try relaunching — the reset will resume automatically. If this persists, contact support.`}
    />
  );
}
