import * as React from "react";

import {
  BRAND_ACCENT_STYLE,
  BRAND_INK_CARD_CLASS,
  BRAND_INK_SHELL_CLASS,
  brandOnboardingColorScheme,
} from "@/features/onboarding/brandSurface";
import { cn } from "@/shared/lib/cn";
import { Card } from "@/shared/ui/card";
import { useSmoothCorners } from "@/shared/ui/smoothCorners";
import { StartupWindowDragRegion } from "@/shared/ui/StartupWindowDragRegion";
import { OnboardingChrome } from "./OnboardingChrome";
import {
  type OnboardingBackAction,
  OnboardingFooterProvider,
} from "./OnboardingFooter";

const OnboardingCardLayoutContext = React.createContext(false);

export function useOnboardingCardLayout() {
  return React.useContext(OnboardingCardLayoutContext);
}

/**
 * Production onboarding shell for all steps after the landing screen. The
 * page keeps the existing onboarding backdrop while navigation and content
 * live together inside one stable card.
 *
 * On a brand-ink build the backdrop is the brand's ink rather than the Buzz
 * chartreuse gradient — the same declaration and the same class the landing
 * screen uses, so a new install does not walk from a branded first screen
 * onto six Buzz-yellow ones. The card keeps its own light surface: it is the
 * document the person is filling in, not chrome.
 */
export function OnboardingCard({
  allowWideContent = false,
  backAction,
  children,
  current,
  showStepIndicator = true,
  stableWideWidth = false,
  systemColorScheme,
  testId,
  total,
}: {
  allowWideContent?: boolean;
  backAction?: OnboardingBackAction;
  children: React.ReactNode;
  current: number;
  showStepIndicator?: boolean;
  /** Holds wide, mode-switching steps at the card's full width. */
  stableWideWidth?: boolean;
  systemColorScheme?: "dark" | "light";
  testId: string;
  total?: number;
}) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  useSmoothCorners(cardRef);

  return (
    <div
      className={cn(
        "buzz-onboarding-neutral-theme buzz-startup-shell flex max-h-dvh items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 text-foreground",
        BRAND_INK_SHELL_CLASS,
      )}
      data-brand-onboarding={BRAND_INK_SHELL_CLASS ? "ink" : undefined}
      data-system-color-scheme={brandOnboardingColorScheme(systemColorScheme)}
      data-testid={testId}
      style={BRAND_ACCENT_STYLE}
    >
      <StartupWindowDragRegion />
      {showStepIndicator ? (
        <OnboardingChrome current={current} total={total} />
      ) : null}
      <Card
        className={cn(
          "flex h-[min(41.5rem,calc(100dvh-3rem))] min-w-0 flex-col overflow-hidden rounded-[2rem] border-0 bg-white p-6 text-left shadow-lg min-[44rem]:p-12",
          stableWideWidth
            ? "w-[min(calc(100vw-2rem),50rem)]"
            : "w-[min(calc(100vw-2rem),calc(38rem+2px))]",
          "[--buzz-onboarding-cta-label:#fff] [&_.buzz-onboarding-slide]:min-h-0",
          "[&_.buzz-onboarding-transition-content]:w-full [&_.buzz-onboarding-transition-content]:min-w-0 [&_.buzz-onboarding-transition-content]:!text-left",
          "[&_.buzz-onboarding-transition-line]:justify-start [&_h1+p]:!mx-0 [&_h1+p]:!mt-2 [&_h1+p]:!text-left [&_h1+p]:!text-base [&_h1+p]:!leading-6",
          "[&_h1]:!text-left [&_h1]:!text-2xl [&_h1]:!leading-8 [&_h1]:!text-foreground",
          allowWideContent
            ? "[&_.buzz-onboarding-transition-content]:max-w-full"
            : "[&_.buzz-onboarding-transition-content]:max-w-[32rem]",
          BRAND_INK_CARD_CLASS,
        )}
        data-testid="onboarding-content-card"
        ref={cardRef}
      >
        <OnboardingCardLayoutContext.Provider value>
          <OnboardingFooterProvider
            backAction={backAction}
            contentClassName={allowWideContent ? "max-w-full" : "max-w-[32rem]"}
            placement="card"
          >
            <div className="buzz-onboarding-step-frame relative -mx-6 flex min-h-0! w-[calc(100%+3rem)] flex-1 flex-col items-stretch overflow-x-hidden overflow-y-auto overscroll-contain px-6 text-left min-[44rem]:-mx-12 min-[44rem]:w-[calc(100%+6rem)] min-[44rem]:px-12">
              {children}
            </div>
          </OnboardingFooterProvider>
        </OnboardingCardLayoutContext.Provider>
      </Card>
    </div>
  );
}
