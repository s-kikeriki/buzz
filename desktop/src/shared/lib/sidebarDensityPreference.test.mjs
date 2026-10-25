import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
const attributes = new Map();
const windowListeners = new Map();

globalThis.window = {
  addEventListener: (type, listener) => windowListeners.set(type, listener),
};
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};
globalThis.document = {
  documentElement: {
    setAttribute: (name, value) => attributes.set(name, value),
  },
};

const preference = await import("./sidebarDensityPreference.ts");

test("defaults invalid and missing sidebar densities to comfortable", () => {
  assert.equal(preference.parseSidebarDensity(null), "comfortable");
  assert.equal(preference.parseSidebarDensity("spacious"), "comfortable");
  assert.equal(preference.parseSidebarDensity("compact"), "compact");
  assert.equal(preference.parseSidebarDensity("comfortable"), "comfortable");
});

test("persists and applies the selected sidebar density", () => {
  preference.setSidebarDensity("compact");
  assert.equal(preference.getSidebarDensity(), "compact");
  assert.equal(values.get(preference.SIDEBAR_DENSITY_STORAGE_KEY), "compact");
  assert.equal(attributes.get("data-sidebar-density"), "compact");
});

test("previews a density without changing the saved preference", () => {
  preference.setSidebarDensity("compact");
  preference.previewSidebarDensity("comfortable");
  assert.equal(preference.getSidebarDensity(), "compact");
  assert.equal(values.get(preference.SIDEBAR_DENSITY_STORAGE_KEY), "compact");
  assert.equal(attributes.get("data-sidebar-density"), "comfortable");

  preference.previewSidebarDensity(null);
  assert.equal(attributes.get("data-sidebar-density"), "compact");
});

test("initializes from the persisted sidebar density", () => {
  preference.setSidebarDensity("comfortable");
  values.set(preference.SIDEBAR_DENSITY_STORAGE_KEY, "compact");
  preference.initializeSidebarDensityPreference();
  assert.equal(preference.getSidebarDensity(), "compact");
  assert.equal(attributes.get("data-sidebar-density"), "compact");
});

test("applies sidebar density changes from another window", () => {
  preference.setSidebarDensity("comfortable");
  values.set(preference.SIDEBAR_DENSITY_STORAGE_KEY, "compact");
  windowListeners.get("storage")({
    key: preference.SIDEBAR_DENSITY_STORAGE_KEY,
  });
  assert.equal(preference.getSidebarDensity(), "compact");
  assert.equal(attributes.get("data-sidebar-density"), "compact");
});

test("returns to comfortable when another window clears storage", () => {
  preference.setSidebarDensity("compact");
  values.clear();
  windowListeners.get("storage")({ key: null });
  assert.equal(preference.getSidebarDensity(), "comfortable");
  assert.equal(attributes.get("data-sidebar-density"), "comfortable");
});
