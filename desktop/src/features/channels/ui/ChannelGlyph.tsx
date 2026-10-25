import { FileText, Hash, Lock } from "lucide-react";
import * as React from "react";

import { resolveChannelLogoSrc } from "@/features/channels/lib/channelLogo";
import { useChannelLogo } from "@/features/channels/useChannelLogo";
import { useIsProjectHomeChannel } from "@/features/projects/lib/projectHomeChannel";
import { ProjectChannelIcon } from "@/features/projects/ui/ProjectChannelIcon";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { rewriteRelayUrl } from "@/shared/lib/mediaUrl";

/**
 * Stream/forum glyph for a channel, using the project mark on project homes
 * and the channel's own logo when an admin has set one.
 *
 * An explicitly set logo wins over every built-in mark, including the project
 * one: picking it was a deliberate act by a channel admin. Without a logo — or
 * when the image fails to load — this renders exactly what it rendered before
 * logos existed.
 *
 * The image is decorative: every call site already renders the channel name
 * next to it, so announcing it again would add a second screen-reader stop for
 * one piece of information.
 */
export function ChannelGlyph({
  channel,
  className,
}: {
  channel: Pick<Channel, "channelType" | "id" | "visibility">;
  className?: string;
}) {
  const projectHome = useIsProjectHomeChannel(channel.id);
  // DMs render a participant avatar, never this glyph, so they never need the
  // per-channel relay read a logo lookup costs.
  const isDm = channel.channelType === "dm";
  const logoQuery = useChannelLogo(isDm ? null : channel.id);
  const [failedLogoUrl, setFailedLogoUrl] = React.useState<string | null>(null);
  const iconClass = cn("size-4 shrink-0", className);

  const logoUrl = resolveChannelLogoSrc(logoQuery.data, failedLogoUrl);
  if (logoUrl !== null) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn(iconClass, "rounded-[3px] object-cover")}
        data-testid="channel-glyph-logo"
        onError={() => setFailedLogoUrl(logoUrl)}
        src={rewriteRelayUrl(logoUrl)}
      />
    );
  }

  if (projectHome) {
    return <ProjectChannelIcon className={iconClass} />;
  }
  if (channel.visibility === "private") {
    return <Lock className={iconClass} />;
  }
  if (channel.channelType === "forum") {
    return <FileText className={iconClass} />;
  }
  return <Hash className={iconClass} />;
}
