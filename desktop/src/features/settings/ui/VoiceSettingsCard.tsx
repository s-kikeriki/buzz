import * as React from "react";
import { ChevronDown, Play, Trash2, Upload, Volume2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

import { invokeTauri } from "@/shared/api/tauri";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Switch } from "@/shared/ui/switch";
import {
  SettingsOptionGroup,
  SettingsOptionGroupList,
  SettingsOptionRow,
} from "./SettingsOptionGroup";
import { SettingsSectionHeader } from "./SettingsSectionHeader";
import {
  selectedVoiceForBackend,
  type VoiceRegistryEntry,
  voiceOptionLabel,
  voicesForBackend,
} from "./voiceSettingsLogic";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

/** Shipped default voice; its name is data, not copy, so it stays literal. */
const DEFAULT_VOICE_NAME = "Mary";

export type TtsSettings = {
  version: number;
  agentTextToSpeech: boolean;
  voicePreferences: string[];
};

type TtsVoiceMutation = {
  settings: TtsSettings;
  registry: VoiceRegistryEntry[];
};

export function VoiceSettingsCard() {
  const { t } = useLingui();
  const [settings, setSettings] = React.useState<TtsSettings | null>(null);
  const [registry, setRegistry] = React.useState<VoiceRegistryEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [deleteCandidate, setDeleteCandidate] =
    React.useState<VoiceRegistryEntry | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let disposed = false;
    Promise.all([
      invokeTauri<TtsSettings>("get_tts_settings"),
      invokeTauri<VoiceRegistryEntry[]>("list_voice_registry"),
    ])
      .then(([nextSettings, nextRegistry]) => {
        if (!disposed) {
          setSettings(nextSettings);
          setRegistry(nextRegistry);
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t`Voice settings could not be loaded.`,
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, [t]);

  const saveEnabled = React.useCallback(
    async (enabled: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const saved = await invokeTauri<TtsSettings>("set_tts_enabled", {
          enabled,
        });
        setSettings(saved);
      } catch (saveError) {
        try {
          const state = await invokeTauri<{ tts_enabled: boolean }>(
            "get_huddle_state",
          );
          setSettings((current) =>
            current
              ? { ...current, agentTextToSpeech: state.tts_enabled }
              : current,
          );
        } catch {
          // Keep the last confirmed state when native reconciliation is
          // unavailable; the visible save error makes the failure explicit.
        }
        setError(
          saveError instanceof Error
            ? saveError.message
            : t`Voice settings could not be saved.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const savePocketVoice = React.useCallback(
    async (voiceKey: string) => {
      setBusy(true);
      setError(null);
      try {
        const saved = await invokeTauri<TtsSettings>("set_pocket_voice", {
          voiceKey,
        });
        setSettings(saved);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : t`Voice settings could not be saved.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const importPocketVoice = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await invokeTauri<TtsVoiceMutation | null>(
        "import_pocket_voice",
      );
      if (result) {
        setSettings(result.settings);
        setRegistry(result.registry);
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : t`Voice could not be imported.`,
      );
    } finally {
      setBusy(false);
    }
  }, [t]);

  const deletePocketVoice = React.useCallback(
    async (voiceKey: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await invokeTauri<TtsVoiceMutation>(
          "delete_pocket_voice",
          { voiceKey },
        );
        setSettings(result.settings);
        setRegistry(result.registry);
        setDeleteCandidate(null);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : t`Voice could not be deleted.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const voices = voicesForBackend(registry, "pocket");
  const selectedVoice = selectedVoiceForBackend(
    settings?.voicePreferences ?? [],
    voices,
  );
  const enabled = settings?.agentTextToSpeech ?? true;
  const controlsDisabled = !settings || busy || !enabled;

  return (
    <section className="min-w-0" data-testid="settings-voice">
      <SettingsSectionHeader
        title={<Trans>Voice</Trans>}
        description={
          <Trans>
            Choose whether {productName} reads new agent responses aloud during
            an active huddle.
          </Trans>
        }
      />

      <SettingsOptionGroupList>
        <SettingsOptionGroup title={<Trans>Playback</Trans>}>
          <SettingsOptionRow>
            <div className="min-w-0">
              <label
                className="text-sm font-medium"
                htmlFor="agent-text-to-speech-switch"
              >
                <Trans>Agent text to speech</Trans>
              </label>
              <p
                className="text-sm text-muted-foreground/70"
                data-settings-subcopy
              >
                <Trans>
                  Read new agent messages aloud in the order they arrive.
                </Trans>
              </p>
            </div>
            <Switch
              checked={enabled}
              data-testid="agent-text-to-speech-toggle"
              disabled={!settings || busy}
              id="agent-text-to-speech-switch"
              onCheckedChange={(checked) => {
                if (settings) void saveEnabled(checked);
              }}
            />
          </SettingsOptionRow>
        </SettingsOptionGroup>

        <div
          aria-disabled={!enabled}
          className={cn(
            "transition-opacity",
            !enabled && "pointer-events-none opacity-45",
          )}
          data-testid="pocket-voice-controls"
        >
          <SettingsOptionGroup title={<Trans>Voice</Trans>}>
            <SettingsOptionRow>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <Trans>Pocket TTS voice</Trans>
                </p>
                <p
                  className="text-sm text-muted-foreground/70"
                  data-settings-subcopy
                >
                  <Trans>Voice files stay private on this device.</Trans>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={t`Pocket TTS voice: ${
                        selectedVoice?.displayName ?? DEFAULT_VOICE_NAME
                      }`}
                      className="min-w-32 justify-between"
                      data-testid="pocket-voice-selector"
                      disabled={controlsDisabled}
                      variant="outline"
                    >
                      {selectedVoice
                        ? voiceOptionLabel(selectedVoice, voices)
                        : DEFAULT_VOICE_NAME}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-80 overflow-y-auto"
                  >
                    <DropdownMenuRadioGroup
                      onValueChange={(voiceKey) => {
                        if (settings) void savePocketVoice(voiceKey);
                      }}
                      value={selectedVoice?.key}
                    >
                      {voices.map((voice) => (
                        <DropdownMenuRadioItem
                          key={voice.key}
                          value={voice.key}
                        >
                          {voiceOptionLabel(voice, voices)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  aria-label={t`Preview ${
                    selectedVoice?.displayName ?? DEFAULT_VOICE_NAME
                  }`}
                  data-testid="pocket-voice-preview"
                  disabled={controlsDisabled || previewing || !selectedVoice}
                  onClick={() => {
                    if (!selectedVoice) return;
                    setPreviewing(true);
                    setError(null);
                    void invokeTauri<void>("preview_pocket_voice", {
                      voiceKey: selectedVoice.key,
                    })
                      .catch((previewError) => {
                        setError(
                          previewError instanceof Error
                            ? previewError.message
                            : t`Voice preview could not be played.`,
                        );
                      })
                      .finally(() => setPreviewing(false));
                  }}
                  size="sm"
                  variant="outline"
                >
                  {previewing ? (
                    <Volume2 className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <Trans>Preview</Trans>
                </Button>
                <Button
                  data-testid="pocket-voice-import"
                  disabled={controlsDisabled}
                  onClick={() => void importPocketVoice()}
                  size="sm"
                  variant="outline"
                >
                  <Upload className="h-4 w-4" />
                  <Trans>Add voice</Trans>
                </Button>
                {selectedVoice?.key.startsWith("pocket:imported:") && (
                  <Button
                    aria-label={t`Delete ${selectedVoice.displayName}`}
                    data-testid="pocket-voice-delete"
                    disabled={controlsDisabled}
                    onClick={() => setDeleteCandidate(selectedVoice)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </SettingsOptionRow>
          </SettingsOptionGroup>
        </div>
      </SettingsOptionGroupList>
      {error && (
        <p
          className="mt-4 text-sm text-destructive"
          data-testid="voice-settings-error"
          role="alert"
        >
          {error}
        </p>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
        open={deleteCandidate !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete imported voice?</Trans>
            </AlertDialogTitle>
            {/* One message per case rather than a sentence plus an appended
                clause: German puts the verb last, so a half-sentence
                concatenated at render cannot be translated. */}
            <AlertDialogDescription>
              {deleteCandidate ? (
                selectedVoice?.key === deleteCandidate.key ? (
                  <Trans>
                    {deleteCandidate.displayName} and its local audio file will
                    be removed. {DEFAULT_VOICE_NAME} will be selected instead.
                  </Trans>
                ) : (
                  <Trans>
                    {deleteCandidate.displayName} and its local audio file will
                    be removed.
                  </Trans>
                )
              ) : (
                <Trans>
                  This imported voice and its local audio file will be removed.
                </Trans>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-pocket-voice-delete"
              disabled={busy || !deleteCandidate}
              onClick={(event) => {
                event.preventDefault();
                if (deleteCandidate) {
                  void deletePocketVoice(deleteCandidate.key);
                }
              }}
            >
              <Trans>Delete voice</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
