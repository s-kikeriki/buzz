import { Trans, useLingui } from "@lingui/react/macro";

import type { TimelineMessage } from "@/features/messages/types";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { BestiePopover, BestieTriggerVisual } from "./BestiePopover";
import { useBestie } from "./useBestie";

export function BestieMessageAction({
  channelId,
  message,
}: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  const { t } = useLingui();
  const bestie = useBestie();
  const [open, setOpen] = React.useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t`Ask Sidekick about this message`}
              className="h-8 w-8 rounded-full p-0"
              data-testid={`bestie-message-${message.id}`}
              size="sm"
              type="button"
              variant="ghost"
            >
              <BestieTriggerVisual agent={bestie.assignedAgent} compact />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <Trans>Ask Sidekick</Trans>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80" side="top" sideOffset={10}>
        <BestiePopover
          contextChannelId={channelId}
          contextMessage={message}
          onRequestClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
import * as React from "react";
