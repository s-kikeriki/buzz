import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    localStorage: dom.window.localStorage,
    window: dom.window,
  });
});

after(() => dom.window.close());

const RELAY = "wss://relay.example";
const PUBKEY = "f".repeat(64);

test("defaults invalid and missing sidebar orders to recent", async () => {
  const preference = await import("./sidebarChannelOrderPreference.ts");
  assert.equal(preference.parseSidebarChannelOrder(null), "recent");
  assert.equal(preference.parseSidebarChannelOrder("newest"), "recent");
  assert.equal(preference.parseSidebarChannelOrder("alpha"), "alpha");
  assert.equal(preference.parseSidebarChannelOrder("recent"), "recent");
});

test("persists the selected sidebar order", async () => {
  const preference = await import("./sidebarChannelOrderPreference.ts");
  preference.setSidebarChannelOrder("alpha");
  assert.equal(preference.getSidebarChannelOrder(), "alpha");
  assert.equal(
    globalThis.localStorage.getItem(
      preference.SIDEBAR_CHANNEL_ORDER_STORAGE_KEY,
    ),
    "alpha",
  );

  preference.setSidebarChannelOrder("recent");
  assert.equal(preference.getSidebarChannelOrder(), "recent");
});

test("initializes from the persisted sidebar order", async () => {
  const preference = await import("./sidebarChannelOrderPreference.ts");
  preference.setSidebarChannelOrder("recent");
  globalThis.localStorage.setItem(
    preference.SIDEBAR_CHANNEL_ORDER_STORAGE_KEY,
    "alpha",
  );
  preference.initializeSidebarChannelOrderPreference();
  assert.equal(preference.getSidebarChannelOrder(), "alpha");
  globalThis.localStorage.clear();
  preference.setSidebarChannelOrder("recent");
});

test("an unset group follows the sidebar order preference", async () => {
  const { act, cleanup, renderHook } = await import("@testing-library/react");
  const { relayClient } = await import("@/shared/api/relayClient");
  const preference = await import("./sidebarChannelOrderPreference.ts");
  const { useChannelSortPreference } = await import(
    "./useChannelSortPreference.ts"
  );

  const originals = {
    fetchEvents: relayClient.fetchEvents,
    subscribeLive: relayClient.subscribeLive,
    subscribeToReconnects: relayClient.subscribeToReconnects,
  };
  relayClient.fetchEvents = async () => [];
  relayClient.subscribeLive = async () => async () => {};
  relayClient.subscribeToReconnects = () => () => {};

  try {
    preference.setSidebarChannelOrder("recent");
    const { result, unmount } = renderHook(() =>
      useChannelSortPreference(PUBKEY, RELAY),
    );

    assert.equal(result.current.sortModeFor("channels"), "recent");
    assert.equal(result.current.sortModeFor("section:abc"), "recent");

    await act(async () => {
      preference.setSidebarChannelOrder("alpha");
    });
    assert.equal(result.current.sortModeFor("channels"), "alpha");

    unmount();
    cleanup();
  } finally {
    preference.setSidebarChannelOrder("recent");
    Object.assign(relayClient, originals);
  }
});
