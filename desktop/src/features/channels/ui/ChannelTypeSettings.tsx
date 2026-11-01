import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as React from "react";
import { ChevronDown, ClockFading, Hash } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  channelLifecycle,
  channelLifecycleLabel,
} from "@/features/channels/lib/channelLifecycle";
import {
  DEFAULT_EPHEMERAL_TTL_SECONDS,
  formatTtlDuration,
} from "@/features/channels/lib/ephemeralChannel";
import { useIsProjectHomeChannel } from "@/features/projects/lib/projectHomeChannel";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { EditableInfoFieldRow } from "./ChannelManagementSheetRows";
import { ChannelTypePicker } from "./ChannelTypePicker";

// Both tables are built once at module load, before a catalogue is active, so
// their labels are `msg` descriptors and the component resolves each one with
// `i18n._()` on render. A plain string here renders the boot locale forever.
//
// The durations are whole labels per value, not a count plus a unit: German
// inflects the unit ("1 Stunde" / "6 Stunden") and these are a fixed set, so
// nine messages are simpler and safer than a plural rule.
const CHANNEL_TYPE_OPTIONS = [
  { value: "temporary", label: msg`Temporary`, Icon: ClockFading },
  { value: "ongoing", label: msg`Ongoing`, Icon: Hash },
] as const;

const EPHEMERAL_TIMEOUT_OPTIONS = [
  { label: msg`30 minutes`, seconds: 30 * 60 },
  { label: msg`1 hour`, seconds: 60 * 60 },
  { label: msg`6 hours`, seconds: 6 * 60 * 60 },
  { label: msg`12 hours`, seconds: 12 * 60 * 60 },
  { label: msg`1 day`, seconds: 24 * 60 * 60 },
  { label: msg`3 days`, seconds: 3 * 24 * 60 * 60 },
  { label: msg`7 days`, seconds: DEFAULT_EPHEMERAL_TTL_SECONDS },
  { label: msg`14 days`, seconds: 14 * 24 * 60 * 60 },
  { label: msg`30 days`, seconds: 30 * 24 * 60 * 60 },
] as const;

const CHANNEL_TYPE_RESIZE_TRANSITION = {
  duration: 0.22,
  ease: [0.23, 1, 0.32, 1],
} as const;

export function ChannelTypeDetailRow({
  canEdit,
  channel,
  onEdit,
}: {
  canEdit: boolean;
  channel: Channel;
  onEdit?: () => void;
}) {
  const { i18n, t } = useLingui();
  const projectHome = useIsProjectHomeChannel(channel.id);
  const lifecycle = channelLifecycle({
    projectHome,
    temporary: channel.ttlSeconds !== null,
  });

  return (
    <EditableInfoFieldRow
      editTestId="channel-management-edit-channel-type"
      label={t`Channel type`}
      onEdit={canEdit ? onEdit : undefined}
      testId="channel-management-type"
      value={channelLifecycleLabel(i18n, lifecycle, channel.ttlSeconds)}
    />
  );
}

export function ChannelTypeSettings({
  channelId,
  disabled,
  label: labelOverride,
  onOpenChange,
  onTemporaryChange,
  onTtlSecondsChange,
  open,
  temporary,
  testIdPrefix,
  ttlSeconds,
  variant = "dropdown",
}: {
  channelId?: string | null;
  disabled?: boolean;
  label?: string;
  onOpenChange?: (open: boolean) => void;
  onTemporaryChange: (temporary: boolean) => void;
  onTtlSecondsChange: (ttlSeconds: number) => void;
  open?: boolean;
  temporary: boolean;
  testIdPrefix: string;
  ttlSeconds: number;
  variant?: "dropdown" | "segmented";
}) {
  const { i18n, t } = useLingui();
  // Resolved in the component, not as a default parameter: a default literal
  // is evaluated with no catalogue in reach, and `check-i18n-coverage` cannot
  // see a default either — this one shipped "Channel type" in English inside
  // the otherwise German edit dialog.
  const label = labelOverride ?? t`Channel type`;
  const projectHome = useIsProjectHomeChannel(channelId);
  const lifecycle = channelLifecycle({ projectHome, temporary });
  const shouldReduceMotion = useReducedMotion();
  const channelTypeResizeTransition = shouldReduceMotion
    ? { duration: 0 }
    : CHANNEL_TYPE_RESIZE_TRANSITION;
  const selectedTimeoutOption = EPHEMERAL_TIMEOUT_OPTIONS.find(
    (option) => option.seconds === ttlSeconds,
  );
  const currentTtlLabel = t`Current (${formatTtlDuration(ttlSeconds)})`;
  const timeoutOptions: ReadonlyArray<{ label: string; seconds: number }> =
    selectedTimeoutOption
      ? EPHEMERAL_TIMEOUT_OPTIONS.map((option) => ({
          label: i18n._(option.label),
          seconds: option.seconds,
        }))
      : [
          { label: currentTtlLabel, seconds: ttlSeconds },
          ...EPHEMERAL_TIMEOUT_OPTIONS.map((option) => ({
            label: i18n._(option.label),
            seconds: option.seconds,
          })),
        ];
  // `SegmentedControl` takes plain strings, so the descriptors are resolved
  // here and not inside the shared control.
  const channelTypeOptions = React.useMemo(
    () =>
      CHANNEL_TYPE_OPTIONS.map((option) => ({
        ...option,
        label: i18n._(option.label),
      })),
    [i18n],
  );

  return (
    <div
      className="overflow-hidden rounded-xl border border-input bg-background"
      data-testid={`${testIdPrefix}-channel-type-container`}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 py-3"
        data-testid={`${testIdPrefix}-channel-type-row`}
      >
        <span
          className={cn(
            "text-sm font-medium text-foreground",
            disabled && variant === "segmented" && "opacity-50",
          )}
        >
          {label}
        </span>
        {variant === "segmented" ? (
          <SegmentedControl
            disabled={disabled}
            legend={t`Channel type`}
            onValueChange={(value) => onTemporaryChange(value === "temporary")}
            optionTestIdPrefix={`${testIdPrefix}-channel-type-option`}
            options={channelTypeOptions}
            testId={`${testIdPrefix}-channel-type`}
            value={temporary ? "temporary" : "ongoing"}
          />
        ) : (
          <ChannelTypePicker
            align="end"
            allowProject={projectHome}
            className="-mr-2.5"
            disabled={disabled}
            lifecycle={lifecycle}
            onLifecycleChange={(next) =>
              onTemporaryChange(next === "temporary")
            }
            onOpenChange={onOpenChange}
            open={open}
            testId={`${testIdPrefix}-channel-type`}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {temporary && !projectHome ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            key={`${testIdPrefix}-ephemeral-settings`}
            transition={channelTypeResizeTransition}
          >
            <div
              className="relative flex items-center justify-between gap-3 px-3 py-3 before:absolute before:inset-x-3 before:top-0 before:border-t before:border-border/70"
              data-testid={`${testIdPrefix}-ephemeral-settings`}
            >
              <label
                className={cn(
                  "text-sm font-medium",
                  disabled && variant === "segmented" && "opacity-50",
                )}
                htmlFor={`${testIdPrefix}-ttl`}
              >
                <Trans>Expires after</Trans>
              </label>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t`Expires after`}
                    className="-mr-2.5 ml-auto h-9 w-fit justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
                    data-testid={`${testIdPrefix}-ttl`}
                    disabled={disabled}
                    id={`${testIdPrefix}-ttl`}
                    type="button"
                    variant="ghost"
                  >
                    <span className="text-right">
                      {selectedTimeoutOption
                        ? i18n._(selectedTimeoutOption.label)
                        : currentTtlLabel}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  style={{
                    minWidth: "var(--radix-dropdown-menu-trigger-width)",
                  }}
                >
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => onTtlSecondsChange(Number(value))}
                    value={String(ttlSeconds)}
                  >
                    {timeoutOptions.map((option) => (
                      <DropdownMenuRadioItem
                        data-testid={`${testIdPrefix}-ttl-option-${option.seconds}`}
                        key={option.seconds}
                        value={String(option.seconds)}
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
