import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { BrandMark, BrandMarkImage } from "./BrandMark.tsx";

/**
 * What reaches the DOM for the first-run marks.
 *
 * The e2e spec binds the rendered screen on a flavored bundle; these bind the
 * two things it cannot see. One is the fallback — this runner has no Vite env,
 * so `BRAND.productLogoMarkUrl` is null here exactly as it is in the OSS
 * trunk, which makes "a build with no mark renders what it always rendered"
 * assertable rather than argued. The other is the cut each named surface
 * picks, which is a decision made in JS precisely because no stylesheet can
 * see it.
 */

const DARK = "data:image/svg+xml;base64,ZGFyaw==";
const LIGHT = "data:image/svg+xml;base64,bGlnaHQ=";

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: () => act(async () => root.unmount()) };
}

function cuts(container) {
  return [...container.querySelectorAll("[data-brand-mark-cut]")].map(
    (node) => ({
      cut: node.getAttribute("data-brand-mark-cut"),
      surface: node.getAttribute("data-brand-mark-surface"),
      src: node.getAttribute("src"),
      classes: node.className.split(" "),
    }),
  );
}

test("an ink surface renders only the negative cut", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, {
      lightUrl: LIGHT,
      surface: "ink",
      url: DARK,
    }),
  );
  const rendered = cuts(container);
  assert.equal(rendered.length, 1, "a named surface renders one cut, not two");
  assert.equal(rendered[0].cut, "dark");
  assert.equal(rendered[0].src, DARK);
  // No `dark:` variant: the surface already answered, and the document's
  // mode is the wrong question on a canvas that ignores it.
  assert.ok(!rendered[0].classes.includes("dark:hidden"));
  await unmount();
});

test("a light surface renders only the light cut", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, {
      lightUrl: LIGHT,
      surface: "light",
      url: DARK,
    }),
  );
  const rendered = cuts(container);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].cut, "light");
  assert.equal(rendered[0].src, LIGHT);
  await unmount();
});

test("a light surface with no light cut falls back to the one cut there is", async () => {
  // Wrong-looking but right: a flavor with a single mark has declared that
  // one drawing reads everywhere. Rendering nothing would be worse.
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, { surface: "light", url: DARK }),
  );
  assert.deepEqual(
    cuts(container).map((c) => c.src),
    [DARK],
  );
  await unmount();
});

test("an auto surface renders both cuts and lets the document choose", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, {
      lightUrl: LIGHT,
      surface: "auto",
      url: DARK,
    }),
  );
  const rendered = cuts(container);
  assert.equal(rendered.length, 2);
  const light = rendered.find((c) => c.cut === "light");
  const dark = rendered.find((c) => c.cut === "dark");
  assert.ok(light.classes.includes("dark:hidden"));
  assert.ok(dark.classes.includes("hidden"));
  assert.ok(dark.classes.includes("dark:inline-block"));
  await unmount();
});

test("the cut attribute is not the one BrandLogo's chrome rules match", async () => {
  // `theme.css` resolves `data-brand-logo-cut` from `data-buzz-chrome`, which
  // is right for a mark on the navigation rail and wrong for every surface
  // here: under ink chrome those rules `display: none` every light cut in the
  // document, which would hide the hosted-community dialog's mark on exactly
  // the build this exists for.
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, {
      lightUrl: LIGHT,
      surface: "light",
      url: DARK,
    }),
  );
  assert.equal(container.querySelector("[data-brand-logo-cut]"), null);
  await unmount();
});

test("the motion class is opt-in and lands on the image", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, {
      motion: true,
      surface: "ink",
      url: DARK,
    }),
  );
  // A mark that renders perfectly and never moves is a still frame on a
  // screen whose job is to look like work in progress, and no screenshot
  // catches that.
  assert.ok(cuts(container)[0].classes.includes("buzz-boot-mark"));
  await unmount();

  const still = await mount(
    React.createElement(BrandMarkImage, { surface: "ink", url: DARK }),
  );
  assert.ok(!cuts(still.container)[0].classes.includes("buzz-boot-mark"));
  await still.unmount();
});

test("a mark with no label is decorative", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMarkImage, { surface: "ink", url: DARK }),
  );
  const img = container.querySelector("[data-brand-mark-cut]");
  assert.equal(img.getAttribute("alt"), "");
  assert.equal(img.getAttribute("aria-hidden"), "true");
  await unmount();

  const named = await mount(
    React.createElement(BrandMarkImage, {
      label: "Creating your identity key",
      surface: "ink",
      url: DARK,
    }),
  );
  const labelled = named.container.querySelector("[data-brand-mark-cut]");
  assert.equal(labelled.getAttribute("alt"), "Creating your identity key");
  assert.equal(labelled.getAttribute("aria-hidden"), null);
  await named.unmount();
});

test("a build that ships no mark renders the caller's own fallback", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandMark, {
      fallback: React.createElement("span", { "data-testid": "stock-bee" }),
      surface: "ink",
    }),
  );
  assert.equal(container.querySelector("[data-brand-mark-cut]"), null);
  assert.ok(
    container.querySelector('[data-testid="stock-bee"]'),
    "the OSS trunk keeps whatever each site rendered before",
  );
  await unmount();
});
