import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Archive, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  createSaveSubscription,
  deleteSaveSubscription,
  listSaveSubscriptions,
  mergeSaveSubscriptionKinds,
  removeSaveSubscriptionKind,
  type SaveSubscription,
  type ScopeType,
} from "@/shared/api/tauriArchive";
import {
  KIND_AGENT_OBSERVER_FRAME,
  KIND_AGENT_TURN_METRIC,
} from "@/shared/constants/kinds";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Switch } from "@/shared/ui/switch";
import {
  SettingsOptionGroup,
  SettingsOptionRow,
} from "@/features/settings/ui/SettingsOptionGroup";
import { SettingsSectionHeader } from "@/features/settings/ui/SettingsSectionHeader";
import { setExplicitAgentMetricArchiveChoice } from "../agentMetricArchivePreference";
import { setExplicitObserverArchiveChoice } from "../observerArchivePreference";

import {
  buildSubscriptionRequest,
  isGroupFullyChecked,
  isGroupIndeterminate,
  kindGroups,
  parseCustomKinds,
  toggleGroup,
  toggleKind,
} from "./localArchiveKinds";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

// ── Helpers ───────────────────────────────────────────────────────────────────

// `scopeLabel` and `kindSummary` take `i18n` rather than importing it, so a
// caller cannot resolve a label once and freeze it in the boot locale.
function scopeLabel(
  i18n: I18n,
  sub: SaveSubscription,
  channelNameById: Map<string, string>,
): string {
  if (sub.scopeType === "channel_h") {
    return channelNameById.get(sub.scopeValue) ?? sub.scopeValue;
  }
  if (sub.scopeType === "owner_p") {
    if (sub.kinds.includes(KIND_AGENT_TURN_METRIC)) {
      return i18n._(msg`My agents’ turn metrics`);
    }
    return i18n._(msg`My agent session frames`);
  }
  return sub.scopeValue;
}

function kindSummary(i18n: I18n, kinds: number[]): string {
  if (kinds.length === 0) return i18n._(msg`no kinds`);
  if (kinds.length <= 4) return kinds.join(", ");
  const head = kinds.slice(0, 3).join(", ");
  const rest = kinds.length - 3;
  return i18n._(msg`${head} +${rest} more`);
}

// ── Observer-feed archive section ─────────────────────────────────────────────

type ObserverSectionProps = {
  enabled: boolean;
  toggling: boolean;
  onToggle: (checked: boolean) => void;
};

function ObserverArchiveSection({
  enabled,
  toggling,
  onToggle,
}: ObserverSectionProps) {
  const toggleDisabled = toggling;
  return (
    <div data-testid="local-archive-observer-section">
      <SettingsOptionGroup title={<Trans>Agent observer feed</Trans>}>
        <SettingsOptionRow>
          <div className="min-w-0 flex-1">
            <label
              className="text-sm font-medium"
              htmlFor="local-archive-observer-toggle"
            >
              <Trans>Archive my agents’ observer frames</Trans>
            </label>
            <p
              className="text-sm font-normal text-muted-foreground/70"
              data-settings-subcopy
            >
              <Trans>
                Saves kind {KIND_AGENT_OBSERVER_FRAME} observer frames addressed
                to your pubkey. These are ephemeral — not stored by the relay —
                so local archiving is the only way to retain them.
              </Trans>
            </p>
          </div>
          <Switch
            checked={enabled}
            data-testid="local-archive-observer-toggle"
            disabled={toggleDisabled}
            id="local-archive-observer-toggle"
            onCheckedChange={onToggle}
          />
        </SettingsOptionRow>
      </SettingsOptionGroup>
    </div>
  );
}

// ── Agent-turn-metric archive section ────────────────────────────────────────

type AgentMetricSectionProps = {
  enabled: boolean;
  toggling: boolean;
  onToggle: (checked: boolean) => void;
};

function AgentMetricArchiveSection({
  enabled,
  toggling,
  onToggle,
}: AgentMetricSectionProps) {
  return (
    <div data-testid="local-archive-agent-metric-section">
      <SettingsOptionGroup title={<Trans>Agent turn metrics</Trans>}>
        <SettingsOptionRow>
          <div className="min-w-0 flex-1">
            <label
              className="text-sm font-medium"
              htmlFor="local-archive-agent-metric-toggle"
            >
              <Trans>Archive my agents’ turn metrics</Trans>
            </label>
            <p
              className="text-sm font-normal text-muted-foreground/70"
              data-settings-subcopy
            >
              <Trans>
                Saves kind {KIND_AGENT_TURN_METRIC} turn-metric events addressed
                to your pubkey. Stored as plaintext in your local archive so
                token-usage calculators can read them directly.
              </Trans>
            </p>
          </div>
          <Switch
            checked={enabled}
            data-testid="local-archive-agent-metric-toggle"
            disabled={toggling}
            id="local-archive-agent-metric-toggle"
            onCheckedChange={onToggle}
          />
        </SettingsOptionRow>
      </SettingsOptionGroup>
    </div>
  );
}

// ── Add-subscription form ─────────────────────────────────────────────────────

type KindChecklistProps = {
  checkedKinds: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
};

function KindChecklist({ checkedKinds, onChange }: KindChecklistProps) {
  const { i18n } = useLingui();
  // Ids and test ids come from `group.id`, never from the translated label.
  return (
    <div className="space-y-4">
      {kindGroups(i18n).map((group) => {
        const fullyChecked = isGroupFullyChecked(group, checkedKinds);
        const indeterminate = isGroupIndeterminate(group, checkedKinds);
        return (
          <div key={group.id}>
            {/* Group header */}
            <div className="mb-1.5 flex items-center gap-2">
              <Checkbox
                checked={indeterminate ? "indeterminate" : fullyChecked}
                data-testid={`local-archive-group-${group.id}`}
                id={`local-archive-group-${group.id}`}
                onCheckedChange={() =>
                  onChange(toggleGroup(group, checkedKinds))
                }
              />
              <label
                className="cursor-pointer text-sm font-medium"
                htmlFor={`local-archive-group-${group.id}`}
              >
                {group.label}
              </label>
            </div>
            {/* Individual kind checkboxes */}
            <div className="ml-6 space-y-1.5">
              {group.items.map(({ kind, label }) => (
                <div key={kind} className="flex items-center gap-2">
                  <Checkbox
                    checked={checkedKinds.has(kind)}
                    data-testid={`local-archive-kind-${kind}`}
                    id={`local-archive-kind-${kind}`}
                    onCheckedChange={() =>
                      onChange(toggleKind(kind, checkedKinds))
                    }
                  />
                  <label
                    className="cursor-pointer text-sm text-muted-foreground"
                    htmlFor={`local-archive-kind-${kind}`}
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom kinds input ────────────────────────────────────────────────────────

type CustomKindsInputProps = {
  value: string;
  onChange: (raw: string) => void;
};

function CustomKindsInput({ value, onChange }: CustomKindsInputProps) {
  const { t } = useLingui();
  const { invalid } = parseCustomKinds(value);
  const hasInvalid = invalid.length > 0;
  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium"
        htmlFor="local-archive-custom-kinds"
      >
        <Trans>Advanced: custom kinds</Trans>
      </label>
      <input
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="local-archive-custom-kinds"
        id="local-archive-custom-kinds"
        onChange={(e) => onChange(e.target.value)}
        placeholder={t`e.g. 30023 1337`}
        type="text"
        value={value}
      />
      <p
        className="mt-1 text-xs text-muted-foreground/70"
        data-settings-subcopy
      >
        <Trans>
          Space- or comma-separated non-negative integers. Kinds already in the
          checklist above are ignored.
        </Trans>
      </p>
      {hasInvalid && (
        <p
          className="mt-1 text-xs text-destructive"
          data-testid="local-archive-custom-kinds-error"
        >
          <Trans>Invalid tokens (ignored):</Trans>{" "}
          {invalid.map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && ", "}
              <code className="font-mono">{t}</code>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

// ── Add-subscription form (Steps 1 + 2) ──────────────────────────────────────

type AddFormProps = {
  channels: Array<{ id: string; name: string }>;
  title?: React.ReactNode;
  onSaved: () => void;
  onCancel: () => void;
};

function AddSubscriptionForm({
  channels,
  title,
  onSaved,
  onCancel,
}: AddFormProps) {
  const { t } = useLingui();
  const [selectedChannelId, setSelectedChannelId] = React.useState("");
  const [checkedKinds, setCheckedKinds] = React.useState<Set<number>>(
    new Set(),
  );
  const [customKindsRaw, setCustomKindsRaw] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);

  const { valid: customKinds } = parseCustomKinds(customKindsRaw);
  const request = buildSubscriptionRequest(
    "channel_h",
    selectedChannelId,
    checkedKinds,
    customKinds,
  );
  const canAdd = request !== null;

  const handleAdd = React.useCallback(async () => {
    if (request === null) return;

    setIsAdding(true);
    try {
      await createSaveSubscription(
        request.scopeType,
        request.scopeValue,
        request.kinds,
      );
      onSaved();
      toast.success(t`Archive subscription created.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t`Failed to create subscription.`,
      );
    } finally {
      setIsAdding(false);
    }
  }, [request, onSaved, t]);

  const handleCancel = () => {
    setSelectedChannelId("");
    setCheckedKinds(new Set());
    setCustomKindsRaw("");
    onCancel();
  };

  return (
    <SettingsOptionGroup title={title}>
      <div className="space-y-5 px-4 py-4">
        {/* Channel picker */}
        <div>
          <label
            className="mb-1.5 block text-sm font-medium"
            htmlFor="local-archive-channel-select"
          >
            <Trans>Channel</Trans>
          </label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="local-archive-channel-select"
            id="local-archive-channel-select"
            onChange={(e) => setSelectedChannelId(e.target.value)}
            value={selectedChannelId}
          >
            <option value="">{t`Select a channel…`}</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </div>

        {/* Event types (per-kind checklist) */}
        <div>
          <p className="mb-3 text-sm font-medium">
            <Trans>Event types</Trans>
          </p>
          <KindChecklist
            checkedKinds={checkedKinds}
            onChange={setCheckedKinds}
          />
        </div>

        {/* Advanced: custom kinds */}
        <CustomKindsInput onChange={setCustomKindsRaw} value={customKindsRaw} />

        <div className="flex justify-end gap-2">
          <Button
            disabled={isAdding}
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            data-testid="local-archive-confirm-add"
            disabled={isAdding || !canAdd}
            onClick={() => void handleAdd()}
            type="button"
          >
            {isAdding ? t`Saving…` : t`Save`}
          </Button>
        </div>
      </div>
    </SettingsOptionGroup>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LocalArchiveSettingsCard() {
  const { i18n, t } = useLingui();
  const identityQuery = useIdentityQuery();
  const channelsQuery = useChannelsQuery();
  const [subs, setSubs] = React.useState<SaveSubscription[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);
  const [isAddingOpen, setIsAddingOpen] = React.useState(false);
  const [observerToggling, setObserverToggling] = React.useState(false);
  const [metricToggling, setMetricToggling] = React.useState(false);

  const pubkey = identityQuery.data?.pubkey ?? "";

  const channelNameById = React.useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const ch of channelsQuery.data ?? []) {
      map.set(ch.id, ch.name);
    }
    return map;
  }, [channelsQuery.data]);

  const joinedChannels = React.useMemo(
    () => (channelsQuery.data ?? []).filter((ch) => ch.isMember),
    [channelsQuery.data],
  );

  const reload = React.useCallback(async () => {
    try {
      const rows = await listSaveSubscriptions();
      setSubs(rows);
    } catch (err) {
      console.warn("[LocalArchiveSettingsCard] list failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const handleDelete = React.useCallback(
    async (scopeType: ScopeType, scopeValue: string) => {
      const key = `${scopeType}:${scopeValue}`;
      setDeletingKey(key);
      try {
        await deleteSaveSubscription(scopeType, scopeValue);
        await reload();
        toast.success(t`Archive subscription removed.`);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t`Failed to remove subscription.`,
        );
      } finally {
        setDeletingKey(null);
      }
    },
    [reload, t],
  );

  const observerEnabled = subs.some(
    (s) =>
      s.scopeType === "owner_p" && s.kinds.includes(KIND_AGENT_OBSERVER_FRAME),
  );
  const metricEnabled = subs.some(
    (s) =>
      s.scopeType === "owner_p" && s.kinds.includes(KIND_AGENT_TURN_METRIC),
  );

  const handleObserverToggle = React.useCallback(
    async (checked: boolean) => {
      if (!pubkey) return;
      setObserverToggling(true);
      try {
        if (checked) {
          await mergeSaveSubscriptionKinds(KIND_AGENT_OBSERVER_FRAME);
        } else {
          await removeSaveSubscriptionKind(KIND_AGENT_OBSERVER_FRAME);
        }
        setExplicitObserverArchiveChoice(pubkey, checked);
        toast.success(
          checked
            ? t`Observer feed archive enabled.`
            : t`Observer feed archive disabled.`,
        );
        await reload();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t`Failed to update observer archive.`,
        );
      } finally {
        setObserverToggling(false);
      }
    },
    [pubkey, reload, t],
  );

  const handleMetricToggle = React.useCallback(
    async (checked: boolean) => {
      if (!pubkey) return;
      setMetricToggling(true);
      try {
        if (checked) {
          await mergeSaveSubscriptionKinds(KIND_AGENT_TURN_METRIC);
        } else {
          await removeSaveSubscriptionKind(KIND_AGENT_TURN_METRIC);
        }
        setExplicitAgentMetricArchiveChoice(pubkey, checked);
        toast.success(
          checked
            ? t`Agent turn metric archive enabled.`
            : t`Agent turn metric archive disabled.`,
        );
        await reload();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t`Failed to update agent metric archive.`,
        );
      } finally {
        setMetricToggling(false);
      }
    },
    [pubkey, reload, t],
  );

  // Non-owner_p subscriptions shown in the active-subscriptions list.
  // observer (24200) and metric (44200) owner_p subs each have their own
  // dedicated section above.
  const channelSubs = subs.filter((s) => s.scopeType !== "owner_p");
  // Bound to a plain identifier before it reaches a message: lingui names the
  // placeholder after the interpolated expression, and a dot inside the ICU
  // braces drops the message from every compiled catalogue.
  const channelSubCount = channelSubs.length;

  return (
    <section className="min-w-0" data-testid="settings-local-archive">
      <SettingsSectionHeader
        title={<Trans>Local archive</Trans>}
        description={
          <Trans>
            Save copies of relay messages to a local SQLite database in your{" "}
            {productName} nest. Events are re-verified against the relay at
            archive time.
          </Trans>
        }
      />

      <div className="space-y-6">
        {/* Observer-feed archive — dedicated first-class section */}
        <ObserverArchiveSection
          enabled={observerEnabled}
          onToggle={(checked) => void handleObserverToggle(checked)}
          toggling={observerToggling}
        />

        {/* Agent-turn-metric archive — dedicated first-class section */}
        <AgentMetricArchiveSection
          enabled={metricEnabled}
          onToggle={(checked) => void handleMetricToggle(checked)}
          toggling={metricToggling}
        />

        {/* Channel subscriptions */}
        <div data-testid="local-archive-subscriptions">
          {isLoading ? (
            <SettingsOptionGroup title={<Trans>Channel subscriptions</Trans>}>
              <div className="px-4 py-3 text-sm font-normal text-muted-foreground">
                <Trans>Loading…</Trans>
              </div>
            </SettingsOptionGroup>
          ) : channelSubs.length === 0 ? (
            <SettingsOptionGroup title={<Trans>Channel subscriptions</Trans>}>
              <div className="px-4 py-3 text-sm font-normal text-muted-foreground">
                <Trans>No channel subscriptions yet. Add one below.</Trans>
              </div>
            </SettingsOptionGroup>
          ) : (
            <SettingsOptionGroup
              title={t`Channel subscriptions (${channelSubCount})`}
            >
              {channelSubs.map((sub) => {
                const key = `${sub.scopeType}:${sub.scopeValue}`;
                const subLabel = scopeLabel(i18n, sub, channelNameById);
                const kindsLabel = kindSummary(i18n, sub.kinds);
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 px-4 py-3"
                    data-testid={`local-archive-sub-${key}`}
                  >
                    <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{subLabel}</p>
                      <p
                        className="text-xs text-muted-foreground/70"
                        data-settings-subcopy
                      >
                        {sub.scopeType} · <Trans>kinds: {kindsLabel}</Trans>
                      </p>
                    </div>
                    <Button
                      aria-label={t`Remove archive subscription for ${subLabel}`}
                      disabled={deletingKey === key}
                      onClick={() =>
                        void handleDelete(sub.scopeType, sub.scopeValue)
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </SettingsOptionGroup>
          )}
        </div>

        {/* Add channel subscription */}
        <div data-testid="local-archive-add">
          {isAddingOpen ? (
            <AddSubscriptionForm
              channels={joinedChannels}
              onCancel={() => setIsAddingOpen(false)}
              onSaved={() => {
                setIsAddingOpen(false);
                void reload();
              }}
              title={<Trans>Add channel subscription</Trans>}
            />
          ) : (
            <SettingsOptionGroup
              title={<Trans>Add channel subscription</Trans>}
            >
              <SettingsOptionRow>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <Trans>Subscribe to a channel</Trans>
                  </p>
                  <p
                    className="text-xs text-muted-foreground/70"
                    data-settings-subcopy
                  >
                    <Trans>
                      Choose a channel and select which event types to archive.
                    </Trans>
                  </p>
                </div>
                <Button
                  data-testid="local-archive-open-add"
                  onClick={() => setIsAddingOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Trans>Add</Trans>
                </Button>
              </SettingsOptionRow>
            </SettingsOptionGroup>
          )}
        </div>
      </div>
    </section>
  );
}
