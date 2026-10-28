import assert from "node:assert/strict";
import test from "node:test";

import { applyBrandFavicon } from "./applyBrandFavicon.ts";

/**
 * The document icon, which `index.html` hardcodes as `/buzz.svg`.
 *
 * This runner has no Vite env, so `BRAND.productLogoMarkUrl` is null here
 * exactly as it is in the OSS trunk — which makes the half that matters most
 * assertable: a build with no mark must leave the document exactly as it was
 * served, including a document that has no icon element at all.
 */

function docWith(html) {
  const doc = document.implementation.createHTMLDocument("t");
  doc.head.innerHTML = html;
  return doc;
}

test("a build with no flavor mark leaves the icon alone", () => {
  const doc = docWith(
    '<link rel="icon" type="image/svg+xml" href="/buzz.svg?v=20260610">',
  );
  applyBrandFavicon(doc);
  assert.equal(
    doc.querySelector('link[rel="icon"]').getAttribute("href"),
    "/buzz.svg?v=20260610",
  );
});

test("a document with no icon element is not given one", () => {
  // Defensive rather than decorative: this runs during bootstrap, before the
  // error boundary mounts, so a throw here is a blank window.
  const doc = docWith("<title>t</title>");
  assert.doesNotThrow(() => applyBrandFavicon(doc));
  assert.equal(doc.querySelector('link[rel="icon"]'), null);
});
