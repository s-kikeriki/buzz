import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  isChannelReferenceOpenable,
  useChannelReference,
} from "@/features/channels/openChannelDirectory";

export function ProjectOriginReference({
  agentName,
  channelId,
}: {
  agentName?: string | null;
  channelId?: string | null;
}) {
  const { i18n } = useLingui();
  void i18n;
  const { goChannel } = useAppNavigation();
  const channel = useChannelReference(channelId);

  if (channelId) {
    const isOpenable = isChannelReferenceOpenable(channel);
    return (
      <span
        className="inline-flex max-w-full min-w-0 items-center gap-1"
        title={
          isOpenable
            ? t`Origin is claimed by the event author and is not relay-verified.`
            : // Resolved via a bounded per-id lookup ({@link useChannelReference}),
              // so an unresolved id is a private, deleted, or otherwise
              // inaccessible channel — a non-member open channel still names it.
              t`Origin channel ${channelId} is not visible to you. Origin is claimed by the event author and is not relay-verified.`
        }
      >
        <span
          className="shrink-0 whitespace-nowrap"
          data-project-metadata-phrase
        >
          <Trans>started from</Trans>
        </span>
        {isOpenable ? (
          <button
            aria-label={t`Open author-claimed origin channel #${channel.name}`}
            className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => void goChannel(channel.id)}
            type="button"
          >
            #{channel.name}
          </button>
        ) : (
          <span className="shrink-0 whitespace-nowrap">
            <Trans>a private channel</Trans>
          </span>
        )}
        <span
          className="shrink-0 whitespace-nowrap"
          data-project-metadata-phrase
        >
          <Trans>(author-claimed)</Trans>
        </span>
      </span>
    );
  }

  if (agentName) {
    return (
      <span
        className="inline-flex max-w-full min-w-0 items-center gap-1"
        title={t`The private conversation identifier is intentionally omitted.`}
      >
        <span
          className="shrink-0 whitespace-nowrap"
          data-project-metadata-phrase
        >
          <Trans>started privately with</Trans>
        </span>
        <span className="truncate font-medium text-foreground">
          {agentName}
        </span>
      </span>
    );
  }

  return null;
}
