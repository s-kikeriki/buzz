import { Trans } from "@lingui/react/macro";
export function ChannelScreenEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      <p className="text-sm text-muted-foreground">
        <Trans>Select a channel to view messages.</Trans>
      </p>
    </div>
  );
}
