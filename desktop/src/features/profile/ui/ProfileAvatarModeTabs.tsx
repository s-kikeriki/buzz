import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import * as React from "react";
import { createPortal } from "react-dom";

import type {
  AvatarEditorPresentation,
  AvatarMode,
} from "@/features/profile/ui/ProfileAvatarEditor.types";
import { cn } from "@/shared/lib/cn";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const MODE_TAB_ORDER: AvatarMode[] = ["image", "emoji", "animated"];
/**
 * Descriptors, not strings. The tab labels are keyed by mode rather than
 * living in a `label:` field, which is why the coverage detector never saw
 * them — they still render on screen, so they still have to translate.
 */
const MODE_TAB_LABELS: Record<AvatarMode, MessageDescriptor> = {
  animated: msg`Animated`,
  emoji: msg`Emoji`,
  image: msg`Image`,
};

type ProfileAvatarModeTabsProps = {
  disabled: boolean;
  mode: AvatarMode;
  onModeChange: (mode: AvatarMode) => void;
  presentation: AvatarEditorPresentation;
  portalContainer?: HTMLElement | null;
};

export function ProfileAvatarModeTabs({
  disabled,
  mode,
  onModeChange,
  presentation,
  portalContainer,
}: ProfileAvatarModeTabsProps) {
  const { i18n, t } = useLingui();
  const isOnboardingModal = presentation === "onboarding-modal";
  const isOnboardingInline = presentation === "onboarding-inline";
  // Rebuilt per render so a locale switch re-resolves the labels.
  const modeSegmentOptions = React.useMemo(
    () =>
      MODE_TAB_ORDER.map((value) => ({
        label: i18n._(MODE_TAB_LABELS[value]),
        value,
      })),
    [i18n],
  );
  const tabs = isOnboardingInline ? (
    <SegmentedControl
      className="w-full bg-muted"
      disabled={disabled}
      indicatorTestId="onboarding-avatar-mode-indicator"
      legend={t`Avatar type`}
      onValueChange={onModeChange}
      optionTestIdPrefix="onboarding-avatar-mode"
      options={modeSegmentOptions}
      testId="onboarding-avatar-mode-control"
      value={mode}
    />
  ) : (
    <Tabs
      className={isOnboardingModal ? "flex w-full justify-center" : "w-full"}
      onValueChange={(nextMode) => {
        if (!disabled) onModeChange(nextMode as AvatarMode);
      }}
      value={mode}
    >
      <TabsList
        aria-label={t`Avatar type`}
        className={cn(
          isOnboardingModal
            ? "relative isolate grid h-10 w-full max-w-[320px] grid-cols-3 overflow-hidden rounded-full bg-[color:rgb(var(--buzz-onboarding-avatar-control-fg)_/_0.12)] p-1 text-muted-foreground"
            : "relative isolate grid h-14 w-full grid-cols-3 overflow-hidden rounded-full bg-muted p-1 text-muted-foreground",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "absolute z-0 rounded-full transition-transform motion-reduce:transition-none",
            "bottom-1 left-1 top-1 shadow duration-[250ms] ease-out",
            isOnboardingModal
              ? "bg-[rgb(var(--buzz-onboarding-avatar-action-bg))]"
              : "bg-background",
          )}
          style={{
            transform: `translateX(${MODE_TAB_ORDER.indexOf(mode) * 100}%)`,
            width: "calc((100% - 8px) / 3)",
          }}
        />
        {MODE_TAB_ORDER.map((tabMode) => (
          <TabsTrigger
            className={cn(
              isOnboardingModal
                ? "relative z-10 h-full rounded-full bg-transparent px-4 text-sm font-normal shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:text-[rgb(var(--buzz-onboarding-avatar-action-fg))] data-[state=active]:shadow-none"
                : "relative z-10 h-full rounded-full bg-transparent text-sm font-medium shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
            )}
            disabled={disabled}
            key={tabMode}
            value={tabMode}
          >
            {i18n._(MODE_TAB_LABELS[tabMode])}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return portalContainer === undefined
    ? tabs
    : portalContainer
      ? createPortal(tabs, portalContainer)
      : null;
}
