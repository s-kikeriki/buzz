import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { channelLogoQueryKey } from "@/features/channels/channelLogoQuery";
import { projectsQueryKey } from "@/features/projects/projectDeletionMutation";

import { ChannelGlyph } from "./ChannelGlyph.tsx";

/**
 * The glyph's own JSX, as the app mounts it.
 *
 * `channelLogo.test.mjs` covers the selector and `channelLogoQuery.test.mjs`
 * the cache; neither of them renders anything. These tests cover the wiring
 * between the two — which is where a logo can be resolved correctly and still
 * never reach the DOM, or reach it and never fall back.
 */

const LOGO_URL = "https://relay.example.test/media/" + "a".repeat(64) + ".png";

function channel(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "ops",
    channelType: "channel",
    visibility: "public",
    ...overrides,
  };
}

/**
 * A client whose caches are already populated, so nothing in the tree reaches
 * for Tauri. Seeded entries are fresh (both queries carry a `staleTime`), so
 * react-query serves them without a fetch rather than being merely disabled —
 * `channelLogoQueryOptions` sets `enabled` itself and would ignore a default.
 */
function seededClient(logoByChannelId) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(projectsQueryKey, []);
  for (const [channelId, logoUrl] of Object.entries(logoByChannelId)) {
    client.setQueryData(channelLogoQueryKey(channelId), logoUrl);
  }
  return client;
}

async function mount(client, channelValue) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(ChannelGlyph, { channel: channelValue }),
      ),
    ),
  );
  return {
    container,
    logo: () => container.querySelector("[data-testid=channel-glyph-logo]"),
    icon: () => container.querySelector("svg"),
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("ChannelGlyph: a channel with no logo renders the glyph it always did", async () => {
  const subject = channel();
  const view = await mount(seededClient({ [subject.id]: null }), subject);
  try {
    assert.equal(view.logo(), null, "no logo must render no image");
    assert.ok(view.icon(), "the built-in mark must still render");
  } finally {
    await view.unmount();
  }
});

test("ChannelGlyph: a resolved logo replaces the glyph with its image", async () => {
  const subject = channel();
  const view = await mount(seededClient({ [subject.id]: LOGO_URL }), subject);
  try {
    const img = view.logo();
    assert.ok(img, "a cached logo must reach the DOM");
    assert.ok(
      img.getAttribute("src").includes("a".repeat(64)),
      `logo src must carry the blob hash, got ${img.getAttribute("src")}`,
    );
    assert.equal(view.icon(), null, "the built-in mark must step aside");
    // Decorative: every call site renders the channel name beside it.
    assert.equal(img.getAttribute("alt"), "");
    assert.equal(img.getAttribute("aria-hidden"), "true");
  } finally {
    await view.unmount();
  }
});

test("ChannelGlyph: a logo that fails to load falls back to the glyph", async () => {
  const subject = channel({ visibility: "private" });
  const view = await mount(seededClient({ [subject.id]: LOGO_URL }), subject);
  try {
    const img = view.logo();
    assert.ok(img, "precondition: the logo rendered");
    await act(async () => {
      img.dispatchEvent(new window.Event("error"));
    });
    assert.equal(view.logo(), null, "a broken logo must not stay on screen");
    assert.ok(view.icon(), "the private-channel mark must come back");
  } finally {
    await view.unmount();
  }
});

test("ChannelGlyph: a DM never renders a logo, even with one cached", async () => {
  // DMs render a participant avatar instead of this glyph, so the hook is
  // passed `null` and must not spend a relay read — nor pick up a cached
  // entry that happens to sit under the same id.
  const subject = channel({ channelType: "dm" });
  const view = await mount(seededClient({ [subject.id]: LOGO_URL }), subject);
  try {
    assert.equal(view.logo(), null);
    assert.ok(view.icon());
  } finally {
    await view.unmount();
  }
});
