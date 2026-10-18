import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  Archive,
  BellRing,
  Bot,
  Cpu,
  Download,
  FlaskConical,
  Keyboard,
  LayoutTemplate,
  MessagesSquare,
  MonitorCog,
  ServerCog,
  Smartphone,
  Smile,
  Ticket,
  UserRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type {
  DesktopNotificationPermissionState,
  NotificationSettings,
} from "@/features/notifications/hooks";
import type { SoundName, SoundSlot } from "@/features/notifications/lib/sound";
import { CommunityMembersSettingsCard } from "@/features/community-members/ui/CommunityMembersSettingsCard";
import { CustomEmojiSettingsCard } from "@/features/custom-emoji/ui/CustomEmojiSettingsCard";
import { LocalArchiveSettingsCard } from "@/features/local-archive/ui/LocalArchiveSettingsCard";
import { ThemeSettingsCard } from "./AppearanceSettingsPanel";
import { ChannelTemplatesSettingsCard } from "./ChannelTemplatesSettingsCard";
import { ExperimentalFeaturesCard } from "./ExperimentalFeaturesCard";
import { KeyboardShortcutsCard } from "./KeyboardShortcutsCard";
import { MeshComputeSettingsCard } from "@/features/mesh-compute/ui/MeshComputeSettingsCard";
import { MobilePairingCard } from "./MobilePairingCard";
import { NotificationSettingsCard } from "./NotificationSettingsCard";
import { AgentsSettingsPanel } from "./AgentsSettingsPanel";
import { HostedCommunitiesSettingsCard } from "./HostedCommunitiesSettingsCard";
import { AdminConsoleSettingsCard } from "@/features/admin-console/AdminConsoleSettingsCard";
import { ProfileSettingsCard } from "./ProfileSettingsCard";
import { UpdateChecker } from "../UpdateChecker";
import { VoiceSettingsCard } from "./VoiceSettingsCard";

export type SettingsSection =
  | "profile"
  | "notifications"
  | "voice"
  | "experimental"
  | "agents"
  | "channel-templates"
  | "compute"
  | "appearance"
  | "shortcuts"
  | "hosted-communities"
  | "community-members"
  | "relay-admin"
  | "custom-emoji"
  | "local-archive"
  | "mobile"
  | "updates";

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "profile";

const SETTINGS_SECTION_VALUES: readonly SettingsSection[] = [
  "profile",
  "notifications",
  "voice",
  "experimental",
  "agents",
  "channel-templates",
  "compute",
  "appearance",
  "shortcuts",
  "hosted-communities",
  "community-members",
  "relay-admin",
  "custom-emoji",
  "local-archive",
  "mobile",
  "updates",
];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return (
    typeof value === "string" &&
    (SETTINGS_SECTION_VALUES as readonly string[]).includes(value)
  );
}

export type SettingsSectionDescriptor = {
  value: SettingsSection;
  /** Descriptor, not a string — resolved per render by the nav. */
  label: MessageDescriptor;
  icon: LucideIcon;
  /** If set, this section is only visible when the feature is enabled */
  featureGate?: string;
};

export type SettingsPanelProps = {
  currentPubkey?: string;
  fallbackDisplayName?: string;
  isUpdatingDesktopNotifications: boolean;
  notificationErrorMessage: string | null;
  notificationPermission: DesktopNotificationPermissionState;
  notificationSettings: NotificationSettings;
  onSetDesktopNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  onSetHomeBadgeEnabled: (enabled: boolean) => void;
  onSetSlotAlertsEnabled: (slot: SoundSlot, enabled: boolean) => void;
  onSetNotifyWhileViewing: (enabled: boolean) => void;
  onSetAllSlotAlertsEnabled: (enabled: boolean) => void;
  onSetSoundForSlot: (slot: SoundSlot, name: SoundName) => void;
};

export const settingsSections: SettingsSectionDescriptor[] = [
  {
    value: "appearance",
    label: msg`Appearance`,
    icon: MonitorCog,
  },
  {
    value: "profile",
    label: msg`Profile`,
    icon: UserRound,
  },
  {
    value: "notifications",
    label: msg`Notifications`,
    icon: BellRing,
  },
  {
    value: "voice",
    label: msg`Voice`,
    icon: Volume2,
  },
  {
    value: "experimental",
    label: msg`Experiments`,
    icon: FlaskConical,
  },
  {
    value: "agents",
    label: msg`Agents`,
    icon: Bot,
    featureGate: "managed-agents",
  },
  {
    value: "channel-templates",
    label: msg`Channel templates`,
    icon: LayoutTemplate,
    featureGate: "channel-templates",
  },
  {
    value: "compute",
    label: msg`Compute`,
    icon: Cpu,
  },
  {
    value: "shortcuts",
    label: msg`Shortcuts`,
    icon: Keyboard,
  },
  {
    value: "hosted-communities",
    label: msg`Hosted communities`,
    icon: MessagesSquare,
  },
  {
    value: "community-members",
    label: msg`Invites`,
    icon: Ticket,
  },
  {
    value: "relay-admin",
    label: msg`Admin`,
    icon: ServerCog,
  },
  {
    value: "custom-emoji",
    label: msg`Custom emoji`,
    icon: Smile,
    featureGate: "custom-emoji",
  },
  {
    value: "local-archive",
    label: msg`Local archive`,
    icon: Archive,
  },
  {
    value: "mobile",
    label: msg`Mobile`,
    icon: Smartphone,
  },
  {
    value: "updates",
    label: msg`Updates`,
    icon: Download,
  },
];

export function renderSettingsSection(
  section: SettingsSection,
  props: SettingsPanelProps,
): React.ReactNode {
  switch (section) {
    case "profile":
      return (
        <ProfileSettingsCard
          currentPubkey={props.currentPubkey}
          fallbackDisplayName={props.fallbackDisplayName}
        />
      );
    case "notifications":
      return (
        <NotificationSettingsCard
          isUpdatingDesktopNotifications={props.isUpdatingDesktopNotifications}
          notificationErrorMessage={props.notificationErrorMessage}
          notificationPermission={props.notificationPermission}
          notificationSettings={props.notificationSettings}
          onSetDesktopNotificationsEnabled={
            props.onSetDesktopNotificationsEnabled
          }
          onSetHomeBadgeEnabled={props.onSetHomeBadgeEnabled}
          onSetSlotAlertsEnabled={props.onSetSlotAlertsEnabled}
          onSetNotifyWhileViewing={props.onSetNotifyWhileViewing}
          onSetAllSlotAlertsEnabled={props.onSetAllSlotAlertsEnabled}
          onSetSoundForSlot={props.onSetSoundForSlot}
        />
      );
    case "voice":
      return <VoiceSettingsCard />;
    case "experimental":
      return <ExperimentalFeaturesCard />;
    case "agents":
      return <AgentsSettingsPanel />;
    case "channel-templates":
      return <ChannelTemplatesSettingsCard />;
    case "compute":
      return <MeshComputeSettingsCard />;
    case "appearance":
      return <ThemeSettingsCard />;
    case "shortcuts":
      return <KeyboardShortcutsCard />;
    case "hosted-communities":
      return <HostedCommunitiesSettingsCard />;
    case "community-members":
      return (
        <CommunityMembersSettingsCard currentPubkey={props.currentPubkey} />
      );
    case "relay-admin":
      return <AdminConsoleSettingsCard />;
    case "custom-emoji":
      return <CustomEmojiSettingsCard />;
    case "local-archive":
      return <LocalArchiveSettingsCard />;
    case "mobile":
      return <MobilePairingCard currentPubkey={props.currentPubkey} />;
    case "updates":
      return <UpdateChecker />;
    default: {
      const exhaustiveCheck: never = section;
      return exhaustiveCheck;
    }
  }
}
