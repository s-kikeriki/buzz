import { i18n } from "@lingui/core";
import assert from "node:assert/strict";
import test from "node:test";

import { harnessDescription } from "./harnessCatalogCopy.ts";

test("Pi catalog entry has its curated product description", () => {
  // The table hands out descriptors now; resolving through `i18n._` is the
  // call the catalog makes, and `test-loader.mjs` activates `en` with an empty
  // catalogue so the text is the English this assertion was written against.
  assert.equal(
    i18n._(harnessDescription("pi")),
    "A minimal terminal coding harness, connected through the buzz-pi-acp adapter.",
  );
});
