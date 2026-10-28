import {
  BRAND_ACCENT_STYLE,
  BRAND_INK_SHELL_CLASS,
  BRAND_ONBOARDING_SURFACE,
  brandOnboardingColorScheme,
} from "@/features/onboarding/brandSurface";
import { useCommunityOnboarding } from "@/features/onboarding/communityOnboarding";
import { cn } from "@/shared/lib/cn";
import { useSystemColorScheme } from "@/shared/theme/useSystemColorScheme";
import { BrandMark } from "@/shared/ui/BrandMark";
import { Button } from "@/shared/ui/button";
import { FlappingBee } from "@/shared/ui/buzz-logo/FlappingBee";
import { StartupWindowDragRegion } from "@/shared/ui/StartupWindowDragRegion";

/**
 * Acknowledge a community deep link received before machine onboarding is
 * complete. The transaction is already persisted; claiming and connecting
 * wait until setup finishes so only the user's final identity is admitted.
 */
export function PendingInviteGate() {
  const { transaction, update, clear } = useCommunityOnboarding();
  const systemColorScheme = useSystemColorScheme();

  if (!transaction) return null;

  return (
    <div
      className={cn(
        "buzz-onboarding-neutral-theme buzz-startup-shell fixed inset-0 z-50 flex items-center justify-center bg-background px-4 py-8 text-foreground",
        BRAND_INK_SHELL_CLASS,
      )}
      data-brand-onboarding={BRAND_INK_SHELL_CLASS ? "ink" : undefined}
      data-system-color-scheme={brandOnboardingColorScheme(systemColorScheme)}
      data-testid="pending-invite-gate"
      style={BRAND_ACCENT_STYLE}
    >
      <StartupWindowDragRegion />
      <div className="relative flex w-full max-w-[500px] flex-col items-center text-center">
        <BrandMark
          className="h-auto w-24"
          fallback={<FlappingBee className="h-auto w-24" />}
          motion
          surface={BRAND_ONBOARDING_SURFACE}
        />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Opening community link
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          You’ll connect to {transaction.communityName} once setup is finished.
        </p>
        <div className="mt-8 flex w-full max-w-[300px] flex-col gap-3">
          <Button
            className="h-10 w-full"
            data-testid="pending-invite-continue"
            onClick={() => update({ acknowledged: true })}
            type="button"
          >
            Continue setup
          </Button>
          <Button
            className="h-10 w-full"
            data-testid="pending-invite-cancel"
            onClick={clear}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
