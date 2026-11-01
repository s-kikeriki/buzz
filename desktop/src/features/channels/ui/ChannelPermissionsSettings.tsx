import { msg } from "@lingui/core/macro";
import * as React from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, Globe, Lock } from "lucide-react";

import type { ChannelVisibility } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/cn";
import { SegmentedControl } from "@/shared/ui/segmented-control";

// `msg` descriptors, not strings: this table is built once at module load,
// before any catalogue is active, so a plain string would freeze in the boot
// locale. Each consumer resolves it per render with `i18n._()`.
const VISIBILITY_OPTIONS = [
  { value: "private", label: msg`Private`, Icon: Lock },
  { value: "open", label: msg`Public`, Icon: Globe },
] as const;

export function ChannelPermissionsSettings({
  disabled,
  onVisibilityChange,
  testIdPrefix,
  visibility,
  variant = "dropdown",
}: {
  disabled?: boolean;
  onVisibilityChange: (visibility: ChannelVisibility) => void;
  testIdPrefix: string;
  visibility: ChannelVisibility;
  variant?: "dropdown" | "segmented";
}) {
  const { i18n, t } = useLingui();
  const visibilityLabel = visibility === "private" ? t`Private` : t`Public`;
  // `SegmentedControl` takes plain strings, so the descriptors are resolved
  // here rather than inside the shared control. `i18n` is in the dependency
  // list: without it the labels keep the locale that was active when the
  // control first rendered.
  const visibilityOptions = React.useMemo(
    () =>
      VISIBILITY_OPTIONS.map((option) => ({
        ...option,
        label: i18n._(option.label),
      })),
    [i18n],
  );

  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-4 rounded-xl border border-input bg-background px-3 py-3",
        disabled && variant === "dropdown" && "opacity-50",
      )}
      data-testid={`${testIdPrefix}-permissions-container`}
    >
      <span
        className={cn(
          "text-sm font-medium text-foreground",
          disabled && variant === "segmented" && "opacity-50",
        )}
      >
        <Trans>Visibility</Trans>
      </span>
      {variant === "segmented" ? (
        <SegmentedControl
          disabled={disabled}
          legend={t`Visibility`}
          onValueChange={onVisibilityChange}
          optionTestIdPrefix={`${testIdPrefix}-permissions-option`}
          options={visibilityOptions}
          testId={`${testIdPrefix}-permissions`}
          value={visibility}
        />
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t`Visibility: ${visibilityLabel}`}
              className="-mr-2.5 ml-auto h-9 w-fit justify-end px-2.5 text-right text-sm font-medium text-foreground hover:bg-muted/50"
              data-testid={`${testIdPrefix}-permissions`}
              disabled={disabled}
              type="button"
              variant="ghost"
            >
              <span aria-live="polite" className="text-right">
                {visibilityLabel}
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
              onValueChange={(nextVisibility) =>
                onVisibilityChange(
                  nextVisibility === "private" ? "private" : "open",
                )
              }
              value={visibility}
            >
              <DropdownMenuRadioItem
                data-testid={`${testIdPrefix}-permissions-option-open`}
                value="open"
              >
                <Trans>Public</Trans>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                data-testid={`${testIdPrefix}-permissions-option-private`}
                value="private"
              >
                <Trans>Private</Trans>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
