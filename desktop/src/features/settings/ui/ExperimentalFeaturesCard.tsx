import { Trans } from "@lingui/react/macro";

import { setAgentManagedProfiles } from "@/shared/api/tauriWorkspace";
import { desktopFeatures, useFeatureToggle } from "@/shared/features";
import type { FeatureDefinition } from "@/shared/features";
import { Switch } from "@/shared/ui/switch";
import { SettingsOptionGroup, SettingsOptionRow } from "./SettingsOptionGroup";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

/**
 * The row's own copy — `feature.name` and `feature.description` — comes from
 * the bundled `preview-features.json` manifest, not from source, so no macro
 * can reach it and it stays English until that manifest grows a translation
 * mechanism of its own. Only the chrome around it is translated here.
 */
function FeatureRow({ feature }: { feature: FeatureDefinition }) {
  const [enabled, toggle] = useFeatureToggle(feature.id);
  const switchId = `feature-toggle-${feature.id}`;

  return (
    <SettingsOptionRow>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" id={`${switchId}-label`}>
          {feature.name}
        </p>
        <p className="text-xs text-muted-foreground/70" data-settings-subcopy>
          {feature.description}
        </p>
      </div>
      <Switch
        aria-labelledby={`${switchId}-label`}
        checked={enabled}
        data-testid={switchId}
        onCheckedChange={(value) => {
          toggle(value);
          if (feature.id === "agentManagedProfiles") {
            void setAgentManagedProfiles(value).catch((error) => {
              console.error(
                "Failed to apply agent-managed profiles setting:",
                error,
              );
            });
          }
        }}
      />
    </SettingsOptionRow>
  );
}

export function ExperimentalFeaturesCard() {
  // Manifest is preview-only by definition; every desktop entry is a preview
  // feature.
  const previewFeatures = desktopFeatures;

  return (
    <section className="min-w-0" data-testid="settings-experimental">
      <SettingsSectionHeader
        title={<Trans>Experiments</Trans>}
        description={
          <Trans>
            These features are functional but still being refined. Enable them
            to try new capabilities early.
          </Trans>
        }
      />

      <SettingsOptionGroup title={<Trans>Features</Trans>}>
        {previewFeatures.map((f) => (
          <FeatureRow feature={f} key={f.id} />
        ))}
      </SettingsOptionGroup>
    </section>
  );
}
