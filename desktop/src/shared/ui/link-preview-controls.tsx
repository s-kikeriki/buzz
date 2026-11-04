import { EllipsisVertical, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";

import { useAppShell } from "@/app/AppShellContext";
import {
  setLinkPreviewStyle,
  type LinkPreviewStyle,
  useLinkPreviewStyle,
} from "@/shared/lib/linkPreviewStylePreference";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const CONTROL_BUTTON_CLASS =
  "h-5 w-5 rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/message:opacity-100 data-[state=open]:opacity-100";

// Built at import, so the labels are descriptors resolved per render. A plain
// string here would freeze in whatever locale the module first loaded under.
const LINK_PREVIEW_STYLE_OPTIONS: {
  value: LinkPreviewStyle;
  label: MessageDescriptor;
}[] = [
  { value: "rich", label: msg`Rich` },
  { value: "compact", label: msg`Compact` },
];

export function LinkPreviewControls({
  onRemove,
  placement = "right",
}: {
  onRemove?: () => void;
  placement?: "left" | "right";
}) {
  const { i18n, t } = useLingui();
  const style = useLinkPreviewStyle();
  const { onOpenSettings } = useAppShell();

  const handleStyleChange = (nextStyle: string) => {
    if (
      (nextStyle !== "rich" && nextStyle !== "compact") ||
      nextStyle === style
    ) {
      return;
    }

    setLinkPreviewStyle(nextStyle);
    // One whole sentence per style rather than a style name dropped into a
    // frame: German inflects the adjective, so "set to Rich" and "set to
    // Compact" are not the same sentence with a different noun in it.
    toast.success(
      nextStyle === "rich"
        ? t`Link previews set to Rich.`
        : t`Link previews set to Compact.`,
      {
        action: onOpenSettings
          ? {
              label: t`Appearance`,
              onClick: () => onOpenSettings("appearance"),
            }
          : undefined,
        description: t`You can always modify this and other settings in Appearance.`,
      },
    );
  };

  return (
    <div
      className={cn(
        "absolute top-0 z-20 flex flex-col",
        placement === "left" ? "right-full" : "left-full ml-1",
      )}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t`Link display settings`}
            className={CONTROL_BUTTON_CLASS}
            size="icon-xs"
            title={t`Link display settings`}
            type="button"
            variant="ghost"
          >
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Trans>Display</Trans>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                onValueChange={handleStyleChange}
                value={style}
              >
                {LINK_PREVIEW_STYLE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                  >
                    {i18n._(option.label)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {onRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onRemove}
              >
                <EyeOff aria-hidden="true" />
                <Trans>Remove preview</Trans>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
