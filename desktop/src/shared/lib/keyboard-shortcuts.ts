import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { isMacPlatform } from "@/shared/lib/platform";

export const HUDDLE_SHORTCUT_EVENT = "buzz:huddle-shortcut";

export type HuddleShortcutDetail = {
  channelId: string;
};

export type ShortcutCategory =
  | "Navigation"
  | "Messages"
  | "Formatting"
  | "Zoom";

export type KeyboardShortcut = {
  id: string;
  /**
   * `MessageDescriptor`, not `string`: this is a module-level table, so a `t`
   * here would be evaluated once at import and freeze every shortcut label in
   * whichever locale booted. The card resolves each one with `i18n._()`.
   */
  label: MessageDescriptor;
  description: MessageDescriptor;
  keys: string;
  keysWindows: string;
  category: ShortcutCategory;
};

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  {
    id: "quick-search",
    label: msg`Quick search`,
    description: msg`Open the search dialog`,
    keys: "⌘K",
    keysWindows: "Ctrl+K",
    category: "Navigation",
  },
  {
    id: "browse-channels",
    label: msg`Browse channels`,
    description: msg`Open the channel browser`,
    keys: "⇧⌘O",
    keysWindows: "Shift+Ctrl+O",
    category: "Navigation",
  },
  {
    id: "browse-dms",
    label: msg`New direct message`,
    description: msg`Open the new message composer`,
    keys: "⇧⌘K",
    keysWindows: "Shift+Ctrl+K",
    category: "Navigation",
  },
  {
    id: "new-channel",
    label: msg`New channel`,
    description: msg`Open the create channel dialog`,
    keys: "⇧⌘N",
    keysWindows: "Shift+Ctrl+N",
    category: "Navigation",
  },
  {
    id: "open-settings",
    label: msg`Settings`,
    description: msg`Open or close settings`,
    keys: "⌘,",
    keysWindows: "Ctrl+,",
    category: "Navigation",
  },
  {
    id: "go-back",
    label: msg`Go back`,
    description: msg`Navigate to the previous page`,
    keys: "⌘[",
    keysWindows: "Alt+←",
    category: "Navigation",
  },
  {
    id: "go-forward",
    label: msg`Go forward`,
    description: msg`Navigate to the next page`,
    keys: "⌘]",
    keysWindows: "Alt+→",
    category: "Navigation",
  },
  {
    id: "find-in-channel",
    label: msg`Find in channel`,
    description: msg`Search messages in current channel`,
    keys: "⌘F",
    keysWindows: "Ctrl+F",
    category: "Navigation",
  },
  {
    id: "go-home",
    label: msg`Home`,
    description: msg`Navigate to the home feed`,
    keys: "⇧⌘A",
    keysWindows: "Shift+Ctrl+A",
    category: "Navigation",
  },
  {
    id: "toggle-sidebar",
    label: msg`Toggle sidebar`,
    description: msg`Show or hide the sidebar`,
    keys: "⌘S",
    keysWindows: "Ctrl+S",
    category: "Navigation",
  },
  {
    id: "mark-current-read",
    label: msg`Mark as read`,
    description: msg`Mark the current conversation as read`,
    keys: "Escape",
    keysWindows: "Escape",
    category: "Navigation",
  },
  {
    id: "mark-all-read",
    label: msg`Mark all as read`,
    description: msg`Mark all conversations as read`,
    keys: "⇧Escape",
    keysWindows: "Shift+Escape",
    category: "Navigation",
  },

  // Zoom
  {
    id: "zoom-in",
    label: msg`Zoom in`,
    description: msg`Increase the zoom level`,
    keys: "⌘+",
    keysWindows: "Ctrl+=",
    category: "Zoom",
  },
  {
    id: "zoom-out",
    label: msg`Zoom out`,
    description: msg`Decrease the zoom level`,
    keys: "⌘-",
    keysWindows: "Ctrl+-",
    category: "Zoom",
  },
  {
    id: "zoom-reset",
    label: msg`Reset zoom`,
    description: msg`Reset zoom to default level`,
    keys: "⌘0",
    keysWindows: "Ctrl+0",
    category: "Zoom",
  },

  // Messages
  {
    id: "send-message",
    label: msg`Send message`,
    description: msg`Send the current message`,
    keys: "Enter",
    keysWindows: "Enter",
    category: "Messages",
  },
  {
    id: "new-line",
    label: msg`New line`,
    description: msg`Insert a line break in the composer`,
    keys: "Shift+Enter",
    keysWindows: "Shift+Enter",
    category: "Messages",
  },
  {
    id: "always-address-agent",
    label: msg`Always address agent`,
    description: msg`Address the default agent, or toggle the highlighted agent`,
    keys: "⇧⌘M",
    keysWindows: "Ctrl+Shift+M",
    category: "Messages",
  },
  {
    id: "publish-note",
    label: msg`Publish note`,
    description: msg`Publish a Pulse note`,
    keys: "⌘Enter",
    keysWindows: "Ctrl+Enter",
    category: "Messages",
  },
  {
    id: "close-dialog",
    label: msg`Close dialog`,
    description: msg`Close the current dialog or settings`,
    keys: "Escape",
    keysWindows: "Escape",
    category: "Messages",
  },
  {
    id: "toggle-huddle",
    label: msg`Start or leave huddle`,
    description: msg`Start or join a huddle in the current channel; leave when connected`,
    keys: "Ctrl+Shift+Space",
    keysWindows: "Ctrl+Shift+Space",
    category: "Messages",
  },
  {
    id: "push-to-talk",
    label: msg`Push to talk`,
    description: msg`Hold to unmute in a huddle`,
    keys: "Ctrl+Space",
    keysWindows: "Ctrl+Space",
    category: "Messages",
  },

  // Formatting
  {
    id: "format-bold",
    label: msg`Bold`,
    description: msg`Toggle bold formatting`,
    keys: "⌘B",
    keysWindows: "Ctrl+B",
    category: "Formatting",
  },
  {
    id: "format-italic",
    label: msg`Italic`,
    description: msg`Toggle italic formatting`,
    keys: "⌘I",
    keysWindows: "Ctrl+I",
    category: "Formatting",
  },
  {
    id: "format-strikethrough",
    label: msg`Strikethrough`,
    description: msg`Toggle strikethrough formatting`,
    keys: "⌘⇧X",
    keysWindows: "Ctrl+Shift+X",
    category: "Formatting",
  },
  {
    id: "format-code",
    label: msg`Inline code`,
    description: msg`Toggle inline code formatting`,
    keys: "⌘E",
    keysWindows: "Ctrl+E",
    category: "Formatting",
  },
  {
    id: "format-link",
    label: msg`Insert link`,
    description: msg`Link the selected composer text, or edit the link under the caret`,
    keys: "⌘K",
    keysWindows: "Ctrl+K",
    category: "Formatting",
  },
];

const CATEGORY_ORDER: ShortcutCategory[] = [
  "Navigation",
  "Messages",
  "Formatting",
  "Zoom",
];

/**
 * Display name per category. The union member stays the English key — it is
 * the grouping identity and a React key — so translating the heading cannot
 * change which shortcuts land in which group.
 */
export const SHORTCUT_CATEGORY_LABELS: Record<
  ShortcutCategory,
  MessageDescriptor
> = {
  Formatting: msg`Formatting`,
  Messages: msg`Messages`,
  Navigation: msg`Navigation`,
  Zoom: msg`Zoom`,
};

export function getShortcutsByCategory(): Map<
  ShortcutCategory,
  KeyboardShortcut[]
> {
  const map = new Map<ShortcutCategory, KeyboardShortcut[]>();
  for (const cat of CATEGORY_ORDER) {
    map.set(
      cat,
      KEYBOARD_SHORTCUTS.filter((s) => s.category === cat),
    );
  }
  return map;
}

export function getPlatformKeys(shortcut: KeyboardShortcut): string {
  return isMacPlatform() ? shortcut.keys : shortcut.keysWindows;
}

/**
 * Platform-appropriate key hint for a shortcut in {@link KEYBOARD_SHORTCUTS},
 * or null when the id is unknown. Use this for inline hints (menus, tooltips)
 * so they stay in sync with the canonical shortcut registry.
 */
export function getPlatformKeysById(id: string): string | null {
  const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.id === id);
  return shortcut ? getPlatformKeys(shortcut) : null;
}
