import { t } from "@lingui/core/macro";
import { toast } from "sonner";

import { attachManagedAgentToChannel } from "./channelAgents";
import type { Channel, CreateManagedAgentResponse } from "@/shared/api/types";

type TargetChannel = Pick<Channel, "id" | "name">;

async function attach(
  created: CreateManagedAgentResponse,
  targetChannel: TargetChannel,
) {
  const attached = await attachManagedAgentToChannel(targetChannel.id, {
    agent: created.agent,
    role: "bot",
    ensureRunning: true,
  });
  created.agent = attached.agent;
}

function showAttachmentFailure(
  created: CreateManagedAgentResponse,
  targetChannel: TargetChannel,
  cause: unknown,
  toastId?: string | number,
) {
  const error =
    cause instanceof Error ? cause.message : t`Failed to add agent.`;
  const id = toast.warning(t`Agent created`, {
    description: t`${created.agent.name} couldn’t be added to #${targetChannel.name}. ${error}`,
    id: toastId,
    action: {
      label: t`Try again`,
      onClick: (event) => {
        event.preventDefault();
        toast.loading(t`Agent created`, {
          description: t`Adding ${created.agent.name} to #${targetChannel.name}…`,
          id,
        });
        void attach(created, targetChannel).then(
          () => {
            toast.success(t`Agent created`, {
              description: t`Added ${created.agent.name} to #${targetChannel.name}`,
              id,
            });
          },
          (retryCause: unknown) => {
            showAttachmentFailure(created, targetChannel, retryCause, id);
          },
        );
      },
    },
  });
}

/** Keeps creation successful when its optional channel attachment fails. */
export function useCreatedAgentChannelAttachment() {
  async function presentCreatedAgent(
    created: CreateManagedAgentResponse,
    targetChannel?: TargetChannel | null,
  ) {
    if (created.spawnError || !targetChannel) {
      toast.success("Agent created");
      return;
    }

    try {
      await attach(created, targetChannel);
      toast.success("Agent created");
    } catch (cause) {
      showAttachmentFailure(created, targetChannel, cause);
    }
  }

  return { presentCreatedAgent };
}
