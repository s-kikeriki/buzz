import { Trans, useLingui } from "@lingui/react/macro";
import { Trash2, Upload } from "lucide-react";
import * as React from "react";

import {
  useChannelLogo,
  useSetChannelLogoMutation,
} from "@/features/channels/useChannelLogo";
import { useAvatarUpload } from "@/features/profile/useAvatarUpload";
import { rewriteRelayUrl } from "@/shared/lib/mediaUrl";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Set or remove a channel's logo, for owners and admins.
 *
 * Upload only, no URL field: every logo is then a blob on the community's own
 * relay, which keeps the image behind the authenticated media proxy and means a
 * logo can never point members' clients at a third-party host.
 *
 * Unlike the name and description fields next to it, this applies immediately
 * rather than on Save. A logo is a separate kind:9002 write from the one the
 * Save button makes, so deferring it would turn one user action into two
 * independent persists that can tear — and an image control that shows the new
 * logo the moment it uploads is also the clearer affordance.
 */
export function ChannelLogoEditor({
  channelId,
  channelName,
  disabled,
}: {
  channelId: string;
  channelName: string;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const logoQuery = useChannelLogo(channelId);
  const setLogo = useSetChannelLogoMutation(channelId);
  const [failedPreviewUrl, setFailedPreviewUrl] = React.useState<string | null>(
    null,
  );

  const onUploadSuccess = React.useCallback(
    (url: string) => {
      setFailedPreviewUrl(null);
      setLogo.mutate(url);
    },
    [setLogo],
  );

  const {
    errorMessage: uploadErrorMessage,
    handleFileChange,
    inputRef,
    isUploading,
    openPicker,
  } = useAvatarUpload({
    fallbackErrorMessage: "Could not upload that logo.",
    onUploadSuccess,
  });

  const logoUrl = logoQuery.data ?? null;
  const isBusy = disabled || isUploading || setLogo.isPending;
  const previewUrl =
    logoUrl !== null && logoUrl !== failedPreviewUrl ? logoUrl : null;
  const writeErrorMessage =
    setLogo.error instanceof Error ? setLogo.error.message : null;
  const errorMessage = uploadErrorMessage ?? writeErrorMessage;

  return (
    <div className="space-y-2" data-testid="channel-management-logo">
      <p
        className="text-sm font-medium text-foreground"
        id="channel-logo-label"
      >
        <Trans>Channel logo</Trans>
      </p>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/40"
        >
          {previewUrl !== null ? (
            <img
              alt=""
              className="size-full object-cover"
              data-testid="channel-logo-preview"
              onError={() => setFailedPreviewUrl(previewUrl)}
              src={rewriteRelayUrl(previewUrl)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {channelName.slice(0, 1).toUpperCase() || "#"}
            </span>
          )}
        </div>
        <Button
          aria-describedby="channel-logo-label"
          data-testid="channel-logo-upload"
          disabled={isBusy}
          onClick={() => openPicker()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isUploading || setLogo.isPending ? (
            <Spinner aria-hidden className="size-4 border-2" />
          ) : (
            <Upload aria-hidden className="size-4" />
          )}
          {logoUrl === null ? t`Upload logo` : t`Replace logo`}
        </Button>
        {logoUrl !== null ? (
          <Button
            data-testid="channel-logo-remove"
            disabled={isBusy}
            onClick={() => {
              setFailedPreviewUrl(null);
              setLogo.mutate(null);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden className="size-4" />
            <Trans>Remove</Trans>
          </Button>
        ) : null}
        <input
          accept="image/gif,image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="channel-logo-input"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans>
          Shown instead of the channel icon, for everyone in the channel. PNG,
          JPG, GIF, or WebP.
        </Trans>
      </p>
      {errorMessage ? (
        <p
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="channel-logo-error"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
