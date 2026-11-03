import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Ear,
  Fingerprint,
  Server,
  Terminal,
  UserRound,
} from "lucide-react";
import * as React from "react";
import { AgentStatusBadge } from "@/features/agents/ui/AgentStatusBadge";
import { canonicalNpub, truncateNpub } from "@/shared/lib/pubkey";
import {
  HoverCopyIndicator,
  useCopyFeedback,
} from "@/shared/ui/HoverCopyIndicator";
import { PubKey } from "@/shared/ui/PubKey";
import { PanelSectionGroup } from "@/shared/ui/PanelSectionGroup";
import type {
  AgentPersona,
  ManagedAgent,
  Profile,
  RelayAgent,
} from "@/shared/api/types";

const RUNTIME_LABELS: Record<string, string> = {
  goose: "Goose",
  "claude-code": "Claude Code",
  "codex-acp": "Codex",
  aider: "Aider",
};

function runtimeLabel(command: string): string {
  return RUNTIME_LABELS[command] ?? command;
}

/**
 * The stable identity of a profile row.
 *
 * Every bucketing, ordering and routing decision in this feature used to be
 * made by comparing `field.label` to an English string — in five different
 * files. Translating the labels would have left each of those predicates
 * matching nothing, so in German the runtime rows would silently move to the
 * wrong section and the "Last error" row would stop being pulled out of the
 * diagnostics list. The key is what the code reads; the label is only what a
 * person reads.
 */
export type ProfileFieldKey =
  | "acp-command"
  | "agent-profile"
  | "agent-type"
  | "backend"
  | "capabilities"
  | "last-error"
  | "managed-by"
  | "mcp-command"
  | "nip05"
  | "public-key"
  | "respond-to"
  | "runtime"
  | "start-on-launch"
  | "status"
  | "visibility";

export type ProfileField = {
  /**
   * The machine-readable value behind a yes/no row, for the places that
   * render it as a switch rather than as text. Reading the state off
   * `displayValue` worked only while that value was the English "Yes".
   */
  booleanValue?: boolean;
  copyValue?: string;
  displayValue: string;
  displayNode?: React.ReactNode;
  icon?: LucideIcon;
  key: ProfileFieldKey;
  label: MessageDescriptor;
  onClick?: () => void;
  testId?: string;
  trailingNode?: React.ReactNode;
};

const AGENT_INFO_KEYS = new Set<ProfileFieldKey>([
  "public-key",
  "managed-by",
  "nip05",
  "agent-type",
  "capabilities",
  "backend",
]);
const AGENT_SETTINGS_KEYS = new Set<ProfileFieldKey>([
  "runtime",
  "agent-profile",
  "respond-to",
  "acp-command",
  "mcp-command",
  "start-on-launch",
]);
const DIAGNOSTICS_KEYS = new Set<ProfileFieldKey>(["status", "last-error"]);

export function bucketProfileFields(fields: ProfileField[]) {
  return {
    agentInfoFields: fields.filter((field) => AGENT_INFO_KEYS.has(field.key)),
    agentSettingsFields: fields.filter((field) =>
      AGENT_SETTINGS_KEYS.has(field.key),
    ),
    diagnosticsFields: fields.filter((field) =>
      DIAGNOSTICS_KEYS.has(field.key),
    ),
  };
}

export function useProfileFieldBuckets({
  isBot,
  isOwner,
  managedAgent,
  onOpenProfile,
  ownerDisplayName,
  ownerHandle,
  ownerProfilePubkey,
  ownerPubkey,
  persona,
  presenceLoaded,
  presenceStatus,
  profile,
  pubkey,
  relayAgent,
}: {
  isBot: boolean;
  isOwner: boolean | undefined;
  managedAgent: ManagedAgent | undefined;
  onOpenProfile?: (pubkey: string) => void;
  ownerDisplayName: string | null;
  ownerHandle: string | null;
  ownerProfilePubkey: string | null;
  ownerPubkey: string | null;
  persona: AgentPersona | undefined;
  presenceLoaded: boolean;
  presenceStatus: "online" | "away" | "offline" | undefined;
  profile: Profile | undefined;
  pubkey: string | null;
  relayAgent: RelayAgent | undefined;
}) {
  const { i18n } = useLingui();
  return React.useMemo(() => {
    const metadataFields = [
      ...buildPublicFields({
        i18n,
        pubkey,
        profile,
        relayAgent,
        isBot,
        persona,
      }),
      ...(ownerDisplayName || isOwner === true
        ? buildOwnerFields({
            i18n,
            includeOperationalFields: isOwner === true,
            managedAgent,
            onOpenProfile,
            ownerDisplayName,
            ownerHandle,
            ownerProfilePubkey,
            ownerPubkey,
            persona,
            presenceLoaded,
            presenceStatus,
            relayAgent,
          })
        : []),
    ];
    return bucketProfileFields(metadataFields);
  }, [
    i18n,
    isBot,
    isOwner,
    managedAgent,
    onOpenProfile,
    ownerDisplayName,
    ownerHandle,
    ownerProfilePubkey,
    ownerPubkey,
    persona,
    presenceLoaded,
    presenceStatus,
    profile,
    pubkey,
    relayAgent,
  ]);
}

/**
 * `i18n` is a required parameter, not a module import: these builders run on a
 * render path, and a module-scope default would let a future caller freeze the
 * row values in whatever locale booted first.
 */
export function buildPublicFields({
  i18n,
  isBot,
  persona,
  profile,
  pubkey,
  relayAgent,
}: {
  i18n: I18n;
  isBot: boolean;
  persona?: AgentPersona;
  profile: Profile | undefined;
  pubkey: string | null;
  relayAgent: RelayAgent | undefined;
}): ProfileField[] {
  const fields: ProfileField[] = [];

  if (pubkey) {
    const npub = canonicalNpub(pubkey);
    fields.push({
      // Copy the full canonical npub; an identity that cannot be encoded is
      // never copyable.
      copyValue: npub ?? undefined,
      displayValue: truncateNpub(pubkey),
      displayNode: (
        <PubKey
          interactive={false}
          pubkey={pubkey}
          testId="user-profile-copy-pubkey"
        />
      ),
      icon: Fingerprint,
      key: "public-key",
      label: msg`Public key`,
      testId: "user-profile-public-key",
    });
  }

  if (profile?.nip05Handle) {
    fields.push({
      copyValue: profile.nip05Handle,
      displayValue: profile.nip05Handle,
      icon: UserRound,
      key: "nip05",
      label: msg`NIP-05`,
      testId: "user-profile-nip05",
    });
  }

  if (isBot && relayAgent?.agentType) {
    fields.push({
      copyValue: relayAgent.agentType,
      displayValue: runtimeLabel(relayAgent.agentType),
      icon: Cpu,
      key: "agent-type",
      label: msg`Agent type`,
      testId: "user-profile-agent-type",
    });
  }

  if (!pubkey && persona) {
    fields.push({
      displayValue: i18n._(msg`Not deployed`),
      icon: Activity,
      key: "status",
      label: msg`Status`,
      testId: "user-profile-agent-status",
    });
  }

  if (relayAgent?.capabilities.length) {
    fields.push({
      copyValue: relayAgent.capabilities.join(", "),
      displayValue: relayAgent.capabilities.join(", "),
      icon: Server,
      key: "capabilities",
      label: msg`Capabilities`,
      testId: "user-profile-capabilities",
    });
  }

  return fields;
}

export function buildOwnerFields({
  i18n,
  includeOperationalFields,
  managedAgent,
  onOpenProfile,
  ownerDisplayName,
  ownerHandle,
  ownerProfilePubkey,
  ownerPubkey,
  persona,
  presenceLoaded,
  presenceStatus,
  relayAgent,
}: {
  i18n: I18n;
  includeOperationalFields: boolean;
  managedAgent: ManagedAgent | undefined;
  onOpenProfile?: (pubkey: string) => void;
  ownerDisplayName: string | null;
  ownerHandle: string | null;
  ownerProfilePubkey: string | null;
  ownerPubkey: string | null;
  persona?: AgentPersona;
  presenceLoaded: boolean;
  presenceStatus: "online" | "away" | "offline" | undefined;
  relayAgent: RelayAgent | undefined;
}): ProfileField[] {
  const fields: ProfileField[] = [];
  const respondTo = managedAgent?.respondTo ?? relayAgent?.respondTo ?? null;
  const respondToDisplayValue = respondTo
    ? respondTo === "owner-only"
      ? ownerDisplayName
        ? i18n._(msg`Only ${ownerDisplayName} (owner)`)
        : i18n._(msg`Only the owner`)
      : respondTo === "allowlist"
        ? i18n._(msg`Selected people`)
        : i18n._(msg`Anyone`)
    : null;

  const ownerClickable = Boolean(onOpenProfile && ownerProfilePubkey);
  // Non-clickable owner rows copy the owner's full npub (handle only when no
  // key is known); an unencodable owner key copies nothing.
  const ownerCopyKey = ownerProfilePubkey ?? ownerPubkey;
  const ownerCopyValue = ownerClickable
    ? undefined
    : ownerCopyKey
      ? (canonicalNpub(ownerCopyKey) ?? undefined)
      : (ownerHandle ?? undefined);

  if (ownerDisplayName) {
    fields.push({
      copyValue: ownerCopyValue,
      displayValue: ownerDisplayName,
      displayNode: <span className="truncate">{ownerDisplayName}</span>,
      icon: UserRound,
      key: "managed-by",
      label: msg`Managed by`,
      onClick:
        ownerClickable && ownerProfilePubkey
          ? () => onOpenProfile?.(ownerProfilePubkey)
          : undefined,
      testId: "user-profile-managed-by",
    });
  }

  if (!includeOperationalFields) {
    return fields;
  }

  if (managedAgent?.agentCommand) {
    fields.push({
      copyValue: managedAgent.agentCommand,
      displayValue: runtimeLabel(managedAgent.agentCommand),
      icon: Terminal,
      key: "runtime",
      label: msg`Runtime`,
      testId: "user-profile-runtime",
    });
  } else if (relayAgent?.agentType) {
    fields.push({
      copyValue: relayAgent.agentType,
      displayValue: runtimeLabel(relayAgent.agentType),
      icon: Terminal,
      key: "runtime",
      label: msg`Runtime`,
      testId: "user-profile-runtime",
    });
  } else if (persona?.runtime) {
    fields.push({
      copyValue: persona.runtime,
      displayValue: runtimeLabel(persona.runtime),
      icon: Terminal,
      key: "runtime",
      label: msg`Runtime`,
      testId: "user-profile-runtime",
    });
  } else if (ownerPubkey) {
    fields.push({
      copyValue: canonicalNpub(ownerPubkey) ?? undefined,
      displayValue: i18n._(msg`Declared owner verified`),
      icon: UserRound,
      key: "agent-profile",
      label: msg`Agent profile`,
      testId: "user-profile-agent-profile",
    });
  }

  if (managedAgent) {
    fields.push({
      displayValue: managedAgent.status
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char: string) => char.toUpperCase()),
      displayNode: (
        <AgentStatusBadge
          className="normal-case tracking-normal"
          presenceLoaded={presenceLoaded}
          presenceStatus={presenceStatus}
          sentenceCase
          status={managedAgent.status}
        />
      ),
      icon: Activity,
      key: "status",
      label: msg`Status`,
      testId: "user-profile-agent-status",
    });
  }

  if (managedAgent?.acpCommand) {
    fields.push({
      copyValue: managedAgent.acpCommand,
      displayValue: managedAgent.acpCommand,
      icon: Terminal,
      key: "acp-command",
      label: msg`ACP command`,
      testId: "user-profile-acp",
    });
  }

  if (managedAgent?.mcpCommand) {
    fields.push({
      copyValue: managedAgent.mcpCommand,
      displayValue: managedAgent.mcpCommand,
      icon: Terminal,
      key: "mcp-command",
      label: msg`MCP command`,
      testId: "user-profile-mcp",
    });
  }

  if (managedAgent?.backend.type === "provider") {
    const backendLabel = managedAgent.backend.id;
    fields.push({
      copyValue: backendLabel,
      displayValue: backendLabel,
      icon: Server,
      key: "backend",
      label: msg`Backend`,
      testId: "user-profile-backend",
    });
  }

  if (managedAgent) {
    fields.push({
      booleanValue: managedAgent.startOnAppLaunch,
      displayValue: managedAgent.startOnAppLaunch
        ? i18n._(msg`Yes`)
        : i18n._(msg`No`),
      icon: Server,
      key: "start-on-launch",
      label: msg`Start on launch`,
      testId: "user-profile-start-on-launch",
    });
  }

  if (respondToDisplayValue) {
    fields.push({
      displayValue: respondToDisplayValue,
      icon: Ear,
      key: "respond-to",
      label: msg`Who can send instructions`,
      testId: "user-profile-respond-to",
    });
  }

  if (managedAgent?.lastError) {
    fields.push({
      copyValue: managedAgent.lastError,
      displayValue: managedAgent.lastError,
      icon: Activity,
      key: "last-error",
      label: msg`Last error`,
      testId: "user-profile-last-error",
    });
  }

  return fields;
}

const LEADING_FIELD_KEYS: ProfileFieldKey[] = [
  "visibility",
  "public-key",
  "managed-by",
];

function orderProfileFields(fields: ProfileField[]) {
  const isLeading = (field: ProfileField) =>
    LEADING_FIELD_KEYS.includes(field.key);
  return [
    ...LEADING_FIELD_KEYS.flatMap((key) =>
      fields.filter((field) => field.key === key),
    ),
    ...fields.filter((field) => !isLeading(field) && field.copyValue),
    ...fields.filter((field) => field.key === "status"),
    ...fields.filter(
      (field) =>
        !isLeading(field) && field.key !== "status" && !field.copyValue,
    ),
  ];
}

export function ProfileFieldRows({
  fields,
  variant = "default",
}: {
  fields: ProfileField[];
  variant?: "default" | "runtime";
}) {
  return (
    <>
      {orderProfileFields(fields).map((field) => (
        <ProfileFieldRow
          field={field}
          key={field.testId ?? field.key}
          variant={variant}
        />
      ))}
    </>
  );
}

export function ProfileSectionGroup({
  children,
  headerAction,
  testId,
  title,
}: {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <PanelSectionGroup
      headerAction={headerAction}
      testId={testId}
      title={title}
    >
      <div className="divide-y divide-border/55">{children}</div>
    </PanelSectionGroup>
  );
}

export function ProfileFieldGroup({
  fields,
  title,
}: {
  fields: ProfileField[];
  title?: string;
}) {
  return (
    <ProfileSectionGroup title={title}>
      <ProfileFieldRows fields={fields} />
    </ProfileSectionGroup>
  );
}

function ProfileFieldRow({
  field,
  variant,
}: {
  field: ProfileField;
  variant: "default" | "runtime";
}) {
  const { i18n, t } = useLingui();
  const Icon = field.icon;
  const isCopyable = Boolean(field.copyValue);
  const isActionable = Boolean(field.onClick);
  const isTrailingDisplay =
    variant === "runtime" && field.key === "status" && field.displayNode;
  const label = i18n._(field.label);
  const { copied, copy } = useCopyFeedback({
    label,
    value: field.copyValue ?? "",
  });

  const content = (
    <>
      {Icon ? (
        <Icon
          className="h-4 w-4 shrink-0 text-muted-foreground"
          data-slot="profile-field-icon"
        />
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        {!isTrailingDisplay ? (
          <span
            className="mt-0.5 block truncate text-sm text-muted-foreground/70"
            title={field.displayValue}
          >
            {field.displayNode ?? field.displayValue}
          </span>
        ) : null}
      </span>
      {isTrailingDisplay ? field.displayNode : null}
      {field.trailingNode}
      {isActionable ? (
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          data-testid={
            field.testId ? `${field.testId}-action-indicator` : undefined
          }
        />
      ) : isCopyable ? (
        <HoverCopyIndicator
          copied={copied}
          testId={field.testId ? `${field.testId}-copy-status` : undefined}
        />
      ) : null}
    </>
  );

  if (isActionable) {
    return (
      <button
        aria-label={t`Open ${label}`}
        className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid={field.testId}
        onClick={field.onClick}
        title={t`Open ${label}`}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (isCopyable && field.copyValue) {
    return (
      <button
        aria-label={t`Copy ${label}`}
        className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid={field.testId}
        onClick={() => void copy()}
        title={t`Copy ${label}`}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="flex min-h-16 items-center gap-3 px-4 py-3"
      data-testid={field.testId}
    >
      {content}
    </div>
  );
}
