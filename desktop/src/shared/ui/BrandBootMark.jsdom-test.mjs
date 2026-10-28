import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { BrandBootMark, BrandBootMarkImage } from "./BrandBootMark.tsx";

/**
 * What reaches the DOM on the startup gates.
 *
 * The e2e spec binds the rendered screen on a flavored bundle; these bind the
 * two things that are invisible to it. One is the fallback — this runner has
 * no Vite env, so `BRAND.productLogoMarkUrl` is null here exactly as it is in
 * the OSS trunk, which makes "a build with no mark keeps the bee" assertable
 * rather than argued. The other is the motion class: a mark that renders
 * perfectly and carries no animation is a still frame on a screen whose whole
 * job is to look like work in progress, and no screenshot catches that.
 */

const URL_VALUE = "data:image/svg+xml;base64,PHN2Zy8+";

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    unmount: () => act(async () => root.unmount()),
  };
}

test("the mark is painted with its own colours and keeps breathing", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandBootMarkImage, {
      className: "relative z-10 h-auto w-28",
      url: URL_VALUE,
    }),
  );
  const mark = container.querySelector('[data-testid="brand-boot-mark"]');
  assert.ok(mark, "the mark must render");
  assert.equal(mark.tagName, "IMG");
  assert.equal(mark.getAttribute("src"), URL_VALUE);
  const classes = mark.className.split(" ");
  // The motion. Without it the boot gate is a static image.
  assert.ok(classes.includes("buzz-boot-mark"));
  // A square mark in the bee's 466x309 box must letterbox, not stretch.
  assert.ok(classes.includes("object-contain"));
  // The caller owns the box.
  assert.ok(classes.includes("w-28"));
  await unmount();
});

test("the mark is decorative — the gate announces itself", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandBootMarkImage, { url: URL_VALUE }),
  );
  const mark = container.querySelector('[data-testid="brand-boot-mark"]');
  // The gate around it is a role="status" with its own sr-only caption, so a
  // name here would announce the same screen a second time.
  assert.equal(mark.getAttribute("alt"), "");
  assert.equal(mark.getAttribute("aria-hidden"), "true");
  await unmount();
});

test("a build that ships no mark keeps the Buzz bee", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandBootMark, { className: "h-auto w-28" }),
  );
  assert.equal(
    container.querySelector('[data-testid="brand-boot-mark"]'),
    null,
    "no flavor mark is configured in this environment",
  );
  const bee = container.querySelector(".bee-sprite");
  assert.ok(bee, "the bee is the fallback, so the OSS trunk is unchanged");
  assert.ok(bee.className.split(" ").includes("w-28"));
  await unmount();
});
