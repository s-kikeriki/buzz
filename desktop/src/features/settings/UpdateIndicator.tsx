import { openUrl } from "@tauri-apps/plugin-opener";
import type { ComponentType } from "react";
import { ExternalLink, RefreshCcw, RotateCw } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";

import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

import { useUpdaterContext } from "./hooks/UpdaterProvider";
import type { UpdateStatus } from "./hooks/use-updater";

const indicatorButtonClass =
  "relative text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground";

type IndicatorIcon = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

const variants: Record<
  "available" | "downloading" | "installing" | "manual-required" | "ready",
  {
    Icon: IndicatorIcon;
    iconClassName?: string;
    label: MessageDescriptor;
    badgeColor: string;
  }
> = {
  available: {
    Icon: RefreshCcw,
    label: msg`Update available`,
    badgeColor: "bg-primary",
  },
  downloading: {
    Icon: Spinner,
    iconClassName: "h-4 w-4 border-2",
    label: msg`Downloading update\u2026`,
    badgeColor: "bg-primary",
  },
  installing: {
    Icon: Spinner,
    iconClassName: "h-4 w-4 border-2",
    label: msg`Installing update\u2026`,
    badgeColor: "bg-primary",
  },
  "manual-required": {
    Icon: ExternalLink,
    label: msg`Update available — download from GitHub (use AppImage for auto-updates)`,
    badgeColor: "bg-primary",
  },
  ready: {
    Icon: RotateCw,
    label: msg`Update now`,
    badgeColor: "bg-emerald-500",
  },
};

function getVariant(state: UpdateStatus["state"]) {
  if (
    state === "available" ||
    state === "downloading" ||
    state === "installing" ||
    state === "manual-required" ||
    state === "ready"
  ) {
    return variants[state];
  }
  return null;
}

export function UpdateIndicator({ className }: { className?: string }) {
  const { status, installAndRelaunch } = useUpdaterContext();
  const { i18n } = useLingui();
  const variant = getVariant(status.state);

  if (!variant) {
    return null;
  }

  const {
    Icon,
    iconClassName = "h-4 w-4",
    label: labelDescriptor,
    badgeColor,
  } = variant;
  const label = i18n._(labelDescriptor);
  const isActionable =
    status.state === "ready" || status.state === "manual-required";
  const handleClick =
    status.state === "ready"
      ? installAndRelaunch
      : status.state === "manual-required"
        ? () => {
            void openUrl(status.releaseUrl);
          }
        : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={`${indicatorButtonClass} ${className ?? ""}`}
          disabled={!isActionable}
          onClick={() => {
            if (handleClick) {
              void handleClick();
            }
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon aria-hidden className={iconClassName} />
          <span
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${badgeColor} animate-pulse`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
