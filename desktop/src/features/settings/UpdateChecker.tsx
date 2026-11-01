import { openUrl } from "@tauri-apps/plugin-opener";
import { Trans } from "@lingui/react/macro";

import { useUpdaterContext } from "./hooks/UpdaterProvider";
import { Button } from "@/shared/ui/button";
import {
  SettingsOptionGroup,
  SettingsOptionRow,
} from "./ui/SettingsOptionGroup";
import { SettingsSectionHeader } from "./ui/SettingsSectionHeader";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

export function UpdateChecker() {
  const { status, checkForUpdate, installAndRelaunch } = useUpdaterContext();

  return (
    <section className="min-w-0" data-testid="settings-updates">
      <SettingsSectionHeader
        title={<Trans>Software Updates</Trans>}
        description={
          <Trans>
            Keep {productName} up to date with the latest features and fixes.
          </Trans>
        }
      />

      <SettingsOptionGroup title={<Trans>Update status</Trans>}>
        {status.state === "idle" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Check if a new version is available.</Trans>
              </p>
            </div>
            <Button size="sm" onClick={checkForUpdate}>
              <Trans>Check for Updates</Trans>
            </Button>
          </SettingsOptionRow>
        )}

        {status.state === "checking" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Checking for updates...</Trans>
              </p>
            </div>
          </SettingsOptionRow>
        )}

        {status.state === "up-to-date" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>You're on the latest version.</Trans>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={checkForUpdate}>
              <Trans>Check Again</Trans>
            </Button>
          </SettingsOptionRow>
        )}

        {status.state === "unavailable" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>
                  Automatic updates aren't available on this build. Download
                  the latest release manually.
                </Trans>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={checkForUpdate}>
              <Trans>Check Again</Trans>
            </Button>
          </SettingsOptionRow>
        )}

        {status.state === "manual-required" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <Trans>Update available — v{status.version}</Trans>
              </p>
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>
                  In-app updates aren't supported on this Linux package.
                  Download the new version from GitHub. Switch to the AppImage
                  build for automatic updates.
                </Trans>
              </p>
            </div>
            <Button size="sm" onClick={() => void openUrl(status.releaseUrl)}>
              <Trans>Download Update</Trans>
            </Button>
          </SettingsOptionRow>
        )}

        {status.state === "available" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Preparing update...</Trans>
              </p>
            </div>
          </SettingsOptionRow>
        )}

        {status.state === "downloading" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Downloading update...</Trans>
              </p>
            </div>
          </SettingsOptionRow>
        )}

        {status.state === "installing" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Installing update...</Trans>
              </p>
            </div>
          </SettingsOptionRow>
        )}

        {status.state === "ready" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p
                className="text-sm font-normal text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>Update downloaded. Click to apply.</Trans>
              </p>
            </div>
            <Button size="sm" onClick={installAndRelaunch}>
              <Trans>Update Now</Trans>
            </Button>
          </SettingsOptionRow>
        )}

        {status.state === "error" && (
          <SettingsOptionRow>
            <div className="min-w-0">
              <p className="text-sm font-normal text-destructive">
                <Trans>Update failed: {status.message}</Trans>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={checkForUpdate}>
              <Trans>Retry</Trans>
            </Button>
          </SettingsOptionRow>
        )}
      </SettingsOptionGroup>
    </section>
  );
}
