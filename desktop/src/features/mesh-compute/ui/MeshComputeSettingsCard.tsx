import * as React from "react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import {
  AgentConfigTextInput,
  AgentDropdownSelect,
  type AgentDropdownOption,
} from "@/features/agents/ui/agentConfigControls";
import {
  CUSTOM_MODEL_DROPDOWN_VALUE,
  PERSONA_FIELD_CONTROL_CLASS,
  PERSONA_FIELD_SHELL_CLASS,
} from "@/features/agents/ui/agentConfigOptions";

import {
  meshStartNode,
  meshStopNode,
  meshInstalledModels,
  meshModelCatalog,
} from "@/shared/api/tauriMesh";
import type {
  MeshCatalogEntry,
  MeshModelCatalog,
  MeshModelOption,
  MeshNodeStatus,
} from "@/shared/api/tauriMesh";
import { SettingsOptionGroup } from "@/features/settings/ui/SettingsOptionGroup";
import { SettingsSectionHeader } from "@/features/settings/ui/SettingsSectionHeader";
import { classifyModelRef } from "../classifyModelRef";
import {
  downloadPercent,
  formatDownloadBytes,
  useMeshDownloadProgress,
} from "../hooks/useMeshDownloadProgress";
import { useMeshNodeStatus } from "../hooks/useMeshNodeStatus";
import { useMeshServingUsage } from "../hooks/useMeshServingUsage";
import { deriveMeshShareToggle } from "../shareToggleState";
import { deriveServingIndicator } from "../servingUsage";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

const MODEL_DRAFT_STORAGE_KEY = "buzz.mesh-compute.share.model.v1";
const MAX_VRAM_DRAFT_STORAGE_KEY = "buzz.mesh-compute.share.max-vram-gb.v1";

// Keep the Share compute controls visually and behaviorally aligned with the
// agent configuration fields. This is intentionally the same shell used by
// AgentDefaultsEditor rather than a local approximation of a select.
const MESH_SELECT_TRIGGER_CLASS = cn(
  PERSONA_FIELD_CONTROL_CLASS,
  PERSONA_FIELD_SHELL_CLASS,
  "h-11 px-3 py-2 leading-6 hover:bg-muted/40 focus:bg-muted/40 [&>svg]:text-muted-foreground/60",
);

const SHARE_COMPUTE_REVEAL_TRANSITION = {
  duration: 0.22,
  ease: [0.23, 1, 0.32, 1],
} as const;

function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  try {
    if (value === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore unavailable/full storage; the input still works for this session.
  }
}

/**
 * Settings → Compute → Share compute.
 *
 * One toggle, one model field, an "Already installed" picklist, an Advanced
 * group. User-facing copy describes the shared-compute behavior without
 * exposing implementation protocols or raw mesh controls.
 */
export function MeshComputeSettingsCard() {
  const { i18n, t } = useLingui();
  const shouldReduceMotion = useReducedMotion();
  const { status, error, refresh } = useMeshNodeStatus();
  const [installedModels, setInstalledModels] = React.useState<
    MeshModelOption[]
  >([]);
  const [catalog, setCatalog] = React.useState<MeshModelCatalog | null>(null);
  const [modelInput, setModelInput] = React.useState(() =>
    readDraft(MODEL_DRAFT_STORAGE_KEY),
  );
  const [maxVramGb, setMaxVramGb] = React.useState<string>(() =>
    readDraft(MAX_VRAM_DRAFT_STORAGE_KEY),
  );
  const [isCustomModelEditing, setIsCustomModelEditing] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [actionInFlight, setActionInFlight] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<
    "start" | "stop" | null
  >(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const { progress: downloadProgress, reset: resetDownloadProgress } =
    useMeshDownloadProgress();

  // Fetch installed models. Called on mount and whenever the running state
  // changes (a fresh start may have downloaded a new model). Stale-tolerant —
  // the picklist is a convenience, not load-bearing.
  const refreshInstalled = React.useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await meshInstalledModels();
        if (!cancelled) setInstalledModels(list);
      } catch {
        // Non-fatal — picklist just stays empty; user can still type a ref.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: status?.state is the intentional trigger — re-fetch installed models when the node transitions (a fresh start may have downloaded a new model)
  React.useEffect(() => refreshInstalled(), [refreshInstalled, status?.state]);

  // One-shot hardware-aware catalog fetch. Purely additive: when it fails
  // (stub build, survey error) the card falls back to the free-text field.
  // When there is no saved choice, make the curated recommendation the actual
  // default so a new member can turn Share Compute on directly. An explicit
  // saved draft always wins.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await meshModelCatalog();
        if (cancelled) return;
        setCatalog(value);
        setModelInput((current) => {
          if (current.trim() !== "" || !value.recommended) return current;
          writeDraft(MODEL_DRAFT_STORAGE_KEY, value.recommended);
          return value.recommended;
        });
      } catch {
        // Non-fatal — picker just doesn't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror only a SERVE runtime's model into the field. A client reports the
  // remote model it is consuming; copying that value here both loses the
  // member's local sharing choice and can cause this machine to download the
  // remote member's much larger model when sharing is enabled.
  React.useEffect(() => {
    if (
      status?.state === "running" &&
      status.mode === "serve" &&
      status.modelId &&
      status.modelId !== modelInput
    ) {
      setModelInput(status.modelId);
      writeDraft(MODEL_DRAFT_STORAGE_KEY, status.modelId);
    }
  }, [status?.state, status?.mode, status?.modelId, modelInput]);

  // The Share toggle reflects ONLY serve-mode occupancy. A client-mode runtime
  // (this machine consuming a peer's compute) shares the single runtime slot
  // and also reports state:"running" — but it must NOT light this switch, and
  // toggling off must never tear down that unrelated consume session.
  const { isSharing, isConsuming, slotOccupied } =
    deriveMeshShareToggle(status);
  // Host-side "who is using the compute I'm sharing" — only polled while
  // actively sharing (serve mode). Read-only; reads the node's own metrics.
  const servingUsage = useMeshServingUsage(isSharing);
  const servingIndicator = deriveServingIndicator(
    i18n,
    servingUsage,
    isSharing,
  );
  // A consuming client may be intentionally replaced by a serve runtime, so
  // keep the local model controls available in client mode. Serve and unknown
  // occupants remain locked until stopped/recovered.
  const controlsDisabled = actionInFlight || (slotOccupied && !isConsuming);
  const refClass = classifyModelRef(modelInput);
  const canStart = refClass.kind !== "unknown" && !actionInFlight;
  const showSharingControls = isSharing || pendingAction === "start";

  async function handleToggle(next: boolean) {
    // Never let the Share switch tear down a consume session. The switch is
    // already disabled while consuming, but status can be stale between polls,
    // so refuse a stop that isn't stopping OUR serve node as a belt-and-braces
    // guard (the backend enforces this authoritatively too).
    if (!next && !isSharing) {
      return;
    }
    setActionError(null);
    setPendingAction(next ? "start" : "stop");
    setActionInFlight(true);
    try {
      if (next) {
        const maxVram =
          maxVramGb.trim() === "" ? undefined : Number.parseFloat(maxVramGb);
        await meshStartNode({
          mode: "serve",
          modelId: modelInput.trim() || undefined,
          maxVramGb:
            typeof maxVram === "number" && !Number.isNaN(maxVram)
              ? maxVram
              : undefined,
        });
      } else {
        await meshStopNode();
      }
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInFlight(false);
      setPendingAction(null);
      resetDownloadProgress();
    }
  }

  return (
    <section className="min-w-0" data-testid="settings-mesh-share-compute">
      <SettingsSectionHeader
        title={<Trans>Share compute</Trans>}
        description={
          <Trans>
            Share this machine with members of this relay so they can run agents
            here.
          </Trans>
        }
      />

      {error ? (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Trans>Couldn’t check shared compute: {error}</Trans>
        </p>
      ) : null}
      {actionError ? (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {downloadProgress ? (
        <DownloadProgressBar progress={downloadProgress} />
      ) : null}

      <SettingsOptionGroup title={<Trans>Sharing</Trans>}>
        <div className="space-y-5 px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-6">
            <div className="min-w-0">
              <label
                className="text-sm font-medium"
                htmlFor="mesh-share-compute-toggle"
              >
                <Trans>Share this machine</Trans>
              </label>
              {!isSharing ? (
                <StatusLine
                  isConsuming={isConsuming}
                  pendingAction={pendingAction}
                  status={status}
                />
              ) : null}
            </div>
            <Switch
              checked={isSharing}
              data-testid="mesh-share-compute-toggle"
              disabled={
                // A serve node can always be stopped. An off node or consuming
                // client can start sharing once a valid local model is selected.
                // Unknown occupants remain protected from replacement.
                actionInFlight ||
                (isSharing
                  ? false
                  : slotOccupied && !isConsuming
                    ? true
                    : !canStart)
              }
              id="mesh-share-compute-toggle"
              onCheckedChange={handleToggle}
            />
          </div>

          <MeshModelPicker
            catalog={catalog}
            disabled={controlsDisabled}
            installedModels={installedModels}
            isCustomModelEditing={isCustomModelEditing}
            model={modelInput}
            onCustomModelEditingChange={setIsCustomModelEditing}
            onModelChange={(next) => {
              setModelInput(next);
              writeDraft(MODEL_DRAFT_STORAGE_KEY, next);
            }}
          />

          <div className="pt-3">
            <button
              aria-expanded={advancedOpen}
              className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="mesh-share-compute-advanced-toggle"
              onClick={() => setAdvancedOpen((current) => !current)}
              type="button"
            >
              <span>
                <Trans>Advanced</Trans>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-150 ease-out",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
            {advancedOpen ? (
              <div className="mt-3 space-y-1.5">
                <label className="text-sm font-medium" htmlFor="mesh-vram">
                  <Trans>Max VRAM (GB)</Trans>
                </label>
                <AgentConfigTextInput
                  data-testid="mesh-share-compute-vram"
                  disabled={controlsDisabled}
                  id="mesh-vram"
                  inputMode="decimal"
                  onChange={(e) => {
                    const next = e.target.value;
                    setMaxVramGb(next);
                    writeDraft(MAX_VRAM_DRAFT_STORAGE_KEY, next);
                  }}
                  placeholder={t`No limit`}
                  usePersonaInputStyle
                  value={maxVramGb}
                />
                {status?.consoleUrl ? (
                  <p className="text-sm font-normal text-muted-foreground">
                    <Trans>Debug console:</Trans>{" "}
                    <a
                      className="underline"
                      href={status.consoleUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {status.consoleUrl}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {showSharingControls ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                data-testid="mesh-share-compute-options-motion"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                key="mesh-share-compute-options"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : SHARE_COMPUTE_REVEAL_TRANSITION
                }
              >
                <section
                  className="space-y-1"
                  data-testid="mesh-share-compute-sharing-status"
                >
                  <h3 className="text-sm font-medium">
                    <Trans>Status</Trans>
                  </h3>
                  <div className="space-y-1 rounded-lg bg-muted/30 px-3 py-2">
                    <StatusLine
                      isConsuming={isConsuming}
                      omitSharingVerb
                      pendingAction={pendingAction}
                      status={status}
                    />
                    {servingIndicator.show ? (
                      <p
                        className={
                          servingIndicator.hasRemoteConsumers
                            ? "text-2xs text-emerald-600 dark:text-emerald-400"
                            : "text-2xs text-muted-foreground"
                        }
                        data-testid="mesh-serving-usage"
                        title={servingIndicator.detail ?? undefined}
                      >
                        {servingIndicator.label}
                        {servingIndicator.detail ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {servingIndicator.detail}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </SettingsOptionGroup>
    </section>
  );
}

/**
 * Renders the lifecycle/health text under the toggle. Maps Max's `state` ×
 * `health` matrix to honest copy — no "starting…" stuck forever when mesh
 * is actually downloading weights or has failed.
 */
/**
 * Live model-download progress: name, bytes, percent bar. Rendered above the
 * option group while the backend streams mesh-download-progress events —
 * the answer to "it just greys out while downloading".
 */
function DownloadProgressBar({
  progress,
}: {
  progress: NonNullable<ReturnType<typeof useMeshDownloadProgress>["progress"]>;
}) {
  const { t } = useLingui();
  const percent = downloadPercent(progress);
  const bytes = formatDownloadBytes(progress);
  const label = progress.label;
  return (
    <div
      className="mb-3 rounded-lg bg-muted/30 px-3 py-2"
      data-testid="mesh-download-progress"
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        {/* Whole sentences per state: German puts the model name and the verb
            in an order English does not, so the verb cannot be a prefix. */}
        <span className="min-w-0 truncate font-medium">
          {progress.status === "preparing"
            ? t`Preparing ${label}`
            : t`Downloading ${label}`}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {percent != null ? `${percent}%` : bytes || "…"}
        </span>
      </div>
      {bytes && percent != null ? (
        <p className="mt-0.5 text-sm font-normal text-muted-foreground">
          {bytes}
        </p>
      ) : null}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-300",
            percent == null && "w-1/4 animate-pulse",
          )}
          style={percent != null ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}

// Descriptors, not resolved strings: a `Record<fit, string>` built at module
// scope would freeze these four labels in whichever locale booted first.
const FIT_LABEL: Record<MeshCatalogEntry["fit"], ReturnType<typeof msg>> = {
  comfortable: msg`Fits well`,
  tight: msg`Tight fit`,
  tradeoff: msg`Trade-off`,
  too_large: msg`Too large`,
};

function fitLabel(i18n: I18n, fit: MeshCatalogEntry["fit"]): string {
  return i18n._(FIT_LABEL[fit]);
}

const FIT_CLASS: Record<MeshCatalogEntry["fit"], string> = {
  comfortable: "text-green-600 dark:text-green-400",
  tight: "text-amber-600 dark:text-amber-400",
  tradeoff: "text-orange-600 dark:text-orange-400",
  too_large: "text-destructive",
};

/**
 * Share Compute's models use the agent configuration picker instead of a
 * second, hand-rolled option system. The catalog remains hardware-aware, but
 * its recommendations, installed models, and advanced choices now appear in
 * the same searchable dropdown used when customizing an agent.
 */
function MeshModelPicker({
  catalog,
  disabled,
  installedModels,
  isCustomModelEditing,
  model,
  onCustomModelEditingChange,
  onModelChange,
}: {
  catalog: MeshModelCatalog | null;
  disabled: boolean;
  installedModels: readonly MeshModelOption[];
  isCustomModelEditing: boolean;
  model: string;
  onCustomModelEditingChange: (editing: boolean) => void;
  onModelChange: (model: string) => void;
}) {
  const { t } = useLingui();
  const options = React.useMemo<AgentDropdownOption[]>(() => {
    const seen = new Set<string>();
    const catalogOptions = (catalog?.entries ?? []).map((entry) => {
      seen.add(entry.name);
      return {
        disabled: entry.fit === "too_large",
        label: <MeshModelOptionLabel entry={entry} />,
        value: entry.name,
      };
    });
    const localOptions = installedModels.flatMap((installed) => {
      if (seen.has(installed.id)) return [];
      return [
        {
          label: (
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {installed.name ?? installed.id}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground">
                <Trans>Installed</Trans>
              </span>
            </div>
          ),
          value: installed.id,
        },
      ];
    });
    return [
      ...catalogOptions,
      ...localOptions,
      { label: t`Custom model…`, value: CUSTOM_MODEL_DROPDOWN_VALUE },
    ];
  }, [catalog?.entries, installedModels, t]);
  const knownModel = options.some((option) => option.value === model.trim());
  const showCustomModelInput =
    isCustomModelEditing || (model.trim().length > 0 && !knownModel);
  const selectedValue = showCustomModelInput
    ? CUSTOM_MODEL_DROPDOWN_VALUE
    : model.trim();

  function handleModelChange(next: string) {
    if (next === CUSTOM_MODEL_DROPDOWN_VALUE) {
      onCustomModelEditingChange(true);
      return;
    }
    onCustomModelEditingChange(false);
    onModelChange(next);
  }

  return (
    <div className="space-y-1.5" data-testid="mesh-share-compute-catalog">
      <label className="text-sm font-medium" htmlFor="mesh-share-compute-model">
        <Trans>Model</Trans>
      </label>
      <AgentDropdownSelect
        className={MESH_SELECT_TRIGGER_CLASS}
        disabled={disabled}
        id="mesh-share-compute-model"
        onValueChange={handleModelChange}
        options={options}
        placeholder={t`Select a model`}
        placeholderClassName="text-muted-foreground/55"
        searchable
        testId="mesh-share-compute-model"
        value={selectedValue}
      />
      {showCustomModelInput ? (
        <AgentConfigTextInput
          aria-label={t`Custom model reference`}
          autoCorrect="off"
          disabled={disabled}
          onChange={(event) => {
            // A stored custom ref starts out inferred rather than explicitly
            // selected. Mark it as an active custom edit before applying a
            // cleared value so the field stays mounted while it is replaced.
            onCustomModelEditingChange(true);
            onModelChange(event.target.value);
          }}
          placeholder="Qwen3-8B-Q4_K_M or hf://meshllm/qwen3-8b@main"
          usePersonaInputStyle
          value={model}
        />
      ) : null}
      <p
        className="text-sm font-normal text-muted-foreground/70"
        data-settings-subcopy
      >
        {catalogSubcopy(t, catalog)}{" "}
        <Trans>
          {productName} downloads remote models when sharing starts.
        </Trans>
      </p>
    </div>
  );
}

/**
 * One whole sentence per case rather than an optional parenthetical appended to
 * a stem: German inflects the stem differently once the hardware is named, so
 * the "(GPU, N GB AI memory)" tail is not a suffix a translator can move.
 */
function catalogSubcopy(
  t: ReturnType<typeof useLingui>["t"],
  catalog: MeshModelCatalog | null,
): string {
  if (!catalog) {
    return t`Choose a model or enter a model reference or local file.`;
  }
  const gpuName = catalog.gpuName;
  const vramDisplay = catalog.vramDisplay;
  if (!gpuName) {
    return t`Recommended for this machine.`;
  }
  return t`Recommended for this machine (${gpuName}, ${vramDisplay} AI memory).`;
}

function MeshModelOptionLabel({ entry }: { entry: MeshCatalogEntry }) {
  const { i18n } = useLingui();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
      <span className="shrink-0 text-muted-foreground">{entry.size}</span>
      <span className={cn("shrink-0", FIT_CLASS[entry.fit])}>
        {fitLabel(i18n, entry.fit)}
      </span>
      {entry.recommended ? (
        <span className="shrink-0 rounded bg-primary/15 px-1.5 text-2xs font-medium text-primary">
          <Trans>Recommended</Trans>
        </span>
      ) : null}
      {entry.installed ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          <Trans>Installed</Trans>
        </span>
      ) : null}
      {!entry.curated ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          <Trans>Advanced</Trans>
        </span>
      ) : null}
    </div>
  );
}

function StatusLine({
  displayModel,
  isConsuming,
  omitSharingVerb = false,
  pendingAction,
  status,
}: {
  displayModel?: string;
  isConsuming: boolean;
  omitSharingVerb?: boolean;
  pendingAction: "start" | "stop" | null;
  status: MeshNodeStatus | null;
}) {
  if (pendingAction === "start") {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Starting…</Trans>
      </p>
    );
  }
  if (pendingAction === "stop") {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Stopping…</Trans>
      </p>
    );
  }
  // A client-mode runtime owns the single slot: this machine is consuming a
  // peer's compute, not sharing. The switch stays off, but remains available
  // so the member can replace the client with a serving runtime.
  if (isConsuming) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>
          This machine is currently using another member’s shared compute. Turn
          on sharing to switch to the selected local model; {productName} may
          briefly restart.
        </Trans>
      </p>
    );
  }
  if (!status) {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Checking status…</Trans>
      </p>
    );
  }
  const { state, health, modelId, modelName } = status;
  const modelLabel = displayModel ?? modelName ?? modelId ?? "";

  if (state === "off") {
    return null;
  }
  if (state === "starting") {
    // `health.reason` is backend text, not catalogue copy — pass it through.
    if (health.status === "degraded" || health.status === "failed") {
      return <p className="text-sm text-muted-foreground">{health.reason}</p>;
    }
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Starting…</Trans>
      </p>
    );
  }
  if (state === "running") {
    const reason = health.reason;
    if (health.status === "failed") {
      return (
        <p className="text-sm text-destructive">
          <Trans>Couldn’t load: {reason}</Trans>
        </p>
      );
    }
    if (health.status === "degraded") {
      return (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {modelLabel ? (
            <Trans>
              Active — {modelLabel}. {reason}
            </Trans>
          ) : (
            <Trans>Active. {reason}</Trans>
          )}
        </p>
      );
    }
    // Whole sentences per case. German puts "mit den Mitgliedern des Relays"
    // after a verb that itself moves, so neither "Sharing" nor the model name
    // can be a fragment concatenated onto a shared tail.
    return (
      <p className="text-sm text-muted-foreground">
        {omitSharingVerb ? (
          modelLabel ? (
            <Trans>{modelLabel} with relay members.</Trans>
          ) : (
            <Trans>Shared with relay members.</Trans>
          )
        ) : modelLabel ? (
          <Trans>Sharing {modelLabel} with relay members.</Trans>
        ) : (
          <Trans>Sharing with relay members.</Trans>
        )}
      </p>
    );
  }
  if (state === "stopping") {
    return (
      <p className="text-sm text-muted-foreground">
        <Trans>Stopping…</Trans>
      </p>
    );
  }
  if (state === "failed") {
    if (health.status === "failed" || health.status === "degraded") {
      return <p className="text-sm text-destructive">{health.reason}</p>;
    }
    return (
      <p className="text-sm text-destructive">
        <Trans>Couldn’t start.</Trans>
      </p>
    );
  }
  return null;
}
