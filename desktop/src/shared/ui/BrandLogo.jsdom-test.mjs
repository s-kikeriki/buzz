import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { BrandLogo, BrandLogoMark } from "./BrandLogo.tsx";

/**
 * `brandLogo.test.mjs` covers which values survive the parser; these cover
 * what reaches the DOM. The two halves fail differently: a logo can parse
 * cleanly and still be painted as an invisible or an unmasked box.
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

test("the mark is painted as a mask over the inherited colour", async () => {
  const { container, unmount } = await mount(
    React.createElement(BrandLogoMark, {
      className: "h-4 w-10",
      label: "ki.keriki",
      style: "mask",
      url: URL_VALUE,
    }),
  );
  const mark = container.querySelector('[data-testid="brand-logo"]');
  assert.ok(mark, "the mark must render");
  // `bg-current` is what the mask reveals. Without it the element paints
  // nothing and the logo is silently invisible — the exact failure that has
  // no visual difference from "no logo configured".
  assert.ok(mark.className.split(" ").includes("bg-current"));
  assert.ok(mark.style.mask.includes(URL_VALUE));
  assert.match(mark.style.mask, /no-repeat/);
  assert.match(mark.style.mask, /contain/);
  await unmount();
});

test("the mark also carries the -webkit- spelling of the mask", async () => {
  // Asserted on the element rather than on the DOM because jsdom's cssstyle
  // drops `-webkit-mask` on the way in: `mark.style.webkitMask` is undefined
  // after a render even when React set it, so a DOM assertion here could only
  // ever pass vacuously.
  //
  // It still has to be asserted somewhere. WKWebView is the engine the Tauri
  // app actually runs on, and it only took the unprefixed `mask` shorthand in
  // Safari 15.4 — on an older macOS the unprefixed property alone leaves the
  // box unmasked, painting a solid rectangle of foreground colour where the
  // wordmark should be.
  const element = BrandLogoMark({
    className: "h-4 w-10",
    label: "ki.keriki",
    style: "mask",
    url: URL_VALUE,
  });
  assert.ok(element.props.style.WebkitMask.includes(URL_VALUE));
  assert.equal(element.props.style.WebkitMask, element.props.style.mask);
});

test("the mark carries the product name for assistive tech", async () => {
  // It is an image with no text of its own; without the label a screen reader
  // reaches the end of the sidebar and announces an unnamed graphic.
  const { container, unmount } = await mount(
    React.createElement(BrandLogoMark, {
      className: "h-4 w-10",
      label: "ki.keriki",
      style: "mask",
      url: URL_VALUE,
    }),
  );
  const mark = container.querySelector('[data-testid="brand-logo"]');
  assert.equal(mark.getAttribute("role"), "img");
  assert.equal(mark.getAttribute("aria-label"), "ki.keriki");
  await unmount();
});

test("a colour mark is painted as an image, not masked away", async () => {
  // The defect this guards is silent and total: paint a multi-colour asset
  // through the mask path and every colour in it collapses into one block of
  // the sidebar's foreground — the kikeriki mark loses its lime and comes out
  // as a grey slab, which reads as a rendering bug rather than a build one.
  const { container, unmount } = await mount(
    React.createElement(BrandLogoMark, {
      className: "h-4 w-10",
      label: "ki.keriki",
      style: "color",
      url: URL_VALUE,
    }),
  );
  const mark = container.querySelector('[data-testid="brand-logo"]');
  assert.equal(mark.tagName, "IMG");
  assert.equal(mark.getAttribute("src"), URL_VALUE);
  assert.equal(mark.style.mask, "");
  assert.ok(!mark.className.split(" ").includes("bg-current"));
  // A box that letterboxes rather than stretches, same contract as the mask's
  // `contain`.
  assert.ok(mark.className.split(" ").includes("object-contain"));
  await unmount();
});

test("a colour mark names itself for assistive tech exactly once", async () => {
  // `alt` is the image's name; an `aria-label` beside it would be a second
  // name for one element, which is the duplicate-stop defect the review rules
  // call out. The empty-alt spelling would be worse still — a decorative
  // image, announcing nothing where the product's name belongs.
  const { container, unmount } = await mount(
    React.createElement(BrandLogoMark, {
      className: "h-4 w-10",
      label: "ki.keriki",
      style: "color",
      url: URL_VALUE,
    }),
  );
  const mark = container.querySelector('[data-testid="brand-logo"]');
  assert.equal(mark.getAttribute("alt"), "ki.keriki");
  assert.equal(mark.getAttribute("aria-label"), null);
  assert.equal(mark.getAttribute("role"), null);
  await unmount();
});

test("a build with no logo renders nothing rather than a placeholder", async () => {
  // The unit-test build has no `VITE_BUZZ_PRODUCT_LOGO`, so this is the OSS
  // trunk's own path: the sidebar must come out neutral, not with an empty
  // box holding space where a client's mark would be.
  const { container, unmount } = await mount(
    React.createElement(BrandLogo, { className: "h-4 w-10" }),
  );
  assert.equal(container.querySelector('[data-testid="brand-logo"]'), null);
  assert.equal(container.innerHTML, "");
  await unmount();
});
