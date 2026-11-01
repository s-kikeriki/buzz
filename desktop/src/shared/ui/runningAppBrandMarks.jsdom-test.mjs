import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { withI18n } from "@/testing/withI18n.mjs";

import { TurnLivenessIndicator } from "@/features/agents/ui/TurnLivenessIndicator.tsx";
import { BuzzLoadingState } from "./BuzzLoadingState.tsx";

/**
 * The stock half of the signed-in app's marks.
 *
 * #23 swept the first-run flow and the native shell; every mark behind the
 * sign-in survived it. These two are the ones that are always on screen — the
 * turn-liveness row is mounted for the whole of every agent turn, and
 * `BuzzLoadingState` sits behind seventeen project and repository panels.
 *
 * This runner has no Vite env, so `BRAND.productLogoMarkUrl` is null here
 * exactly as it is in the OSS trunk. That makes the half the flavored e2e
 * cannot show assertable: a build that declares no mark must render the same
 * bee it rendered before, with the same classes, in both branches. The e2e
 * spec binds the other half on a flavored bundle.
 *
 * Both halves are needed because the failure modes are opposite. A brand path
 * that never fires leaves bees on a branded build; a brand path that fires
 * unconditionally strips the bee from `block/buzz`, which is the one thing a
 * flavor must never do.
 */

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  // `TurnLivenessIndicator` calls `useLingui()` for its label, so the mount
  // needs the provider even though this test only looks at the bee.
  await act(async () => root.render(withI18n(element)));
  return { container, unmount: () => act(async () => root.unmount()) };
}

/** The bee, whichever of the three components drew it. */
function bees(container) {
  return [...container.querySelectorAll(".buzz-logo")];
}

function brandMarks(container) {
  return [...container.querySelectorAll('[data-testid="brand-mark"]')];
}

test("the liveness row keeps three bees on a build with no mark", async () => {
  const { container, unmount } = await mount(
    React.createElement(TurnLivenessIndicator, null),
  );

  // Three, not one: the staggered row is the branch a normal install sees,
  // and collapsing it to the still mark would be a visible regression that a
  // "renders a bee" assertion would wave through.
  assert.equal(bees(container).length, 3, "the staggered row draws three");
  assert.equal(brandMarks(container).length, 0, "no flavor mark was declared");

  // The row's own size override. `w-5!` is what keeps the three marks smaller
  // than the still one; losing it to the brand class is a silent resize.
  for (const bee of bees(container)) {
    assert.ok(
      bee.className.split(" ").includes("w-5!"),
      `expected the row's size override, got "${bee.className}"`,
    );
  }

  await unmount();
});

test("the panel loading state keeps its bee, held back by the wrapper", async () => {
  const { container, unmount } = await mount(
    React.createElement(BuzzLoadingState, { label: "Loading tasks" }),
  );

  const rendered = bees(container);
  assert.equal(rendered.length, 1);
  assert.equal(brandMarks(container).length, 0, "no flavor mark was declared");
  assert.ok(
    rendered[0].className.split(" ").includes("buzz-logo--scale-pulse"),
    "the stock mark pulses; a still one reads as a hung panel",
  );

  // The wrapper's muted text colour is what holds the stock mark back. The
  // brand mark carries `opacity-45` instead, because an <img> cannot inherit
  // a text colour — so this assertion is what says the two are still two
  // different mechanisms rather than one that silently stopped applying.
  const shell = container.querySelector('[data-testid="buzz-loading-state"]');
  assert.ok(
    shell.className.includes("text-muted-foreground/45"),
    `expected the low-emphasis wrapper, got "${shell.className}"`,
  );
  assert.equal(
    shell.getAttribute("role"),
    "status",
    "the wrapper owns the announcement for both halves",
  );

  await unmount();
});

test("the loading state names itself once, not twice", async () => {
  const { container, unmount } = await mount(
    React.createElement(BuzzLoadingState, { label: "Loading commits" }),
  );

  // One owner per label. The wrapper is `role="status"`; the mark inside is
  // the same announcement, so a second named node would be a duplicate
  // screen-reader stop for one spinner.
  const named = [...container.querySelectorAll("[aria-label]")];
  assert.equal(
    named.length,
    1,
    `expected one labelled node, got ${named.map((n) => n.getAttribute("aria-label")).join(", ")}`,
  );

  await unmount();
});
