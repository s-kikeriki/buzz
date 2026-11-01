import assert from "node:assert/strict";
import { test } from "node:test";

import { isLinguiMacroSource } from "./lingui-macro-source.mjs";
import { linguiMacro } from "./vite-plugin-lingui-macro.mjs";

/**
 * The plugin's file filter is the whole guard.
 *
 * A source file it skips keeps its Lingui macro import, and that import throws
 * the moment the bundle evaluates it — blanking the app with an error about
 * `babel-plugin-macros` configuration that names no file. The build still
 * exits 0 and `tsc` still passes, so these cases are asserted against the real
 * `transform` hook rather than an extracted predicate.
 */

const SOURCE = `import { t } from "@lingui/core/macro";
export const label = () => t\`Tasks\`;
`;

const plugin = linguiMacro();

async function transform(id) {
  return await plugin.transform(SOURCE, id);
}

/** Expanded output calls into `@lingui/core`; the macro import is gone. */
function assertExpanded(result, id) {
  assert.ok(result?.code, `${id} was skipped, so its macro survives the build`);
  assert.doesNotMatch(
    result.code,
    /@lingui\/core\/macro/,
    `${id} still imports the macro after transform`,
  );
}

for (const id of [
  "/app/desktop/src/features/projects/projectIssues.mjs",
  "/app/desktop/src/features/projects/view.tsx",
  "/app/desktop/src/shared/api/client.ts",
  "/app/desktop/src/shared/legacy.js",
  "/app/desktop/src/shared/legacy.jsx",
  "/app/desktop/src/shared/node.cjs",
  "/app/desktop/src/shared/view.mts",
  // Vite appends a query to some ids; the extension test must survive it.
  "/app/desktop/src/features/projects/projectIssues.mjs?v=abc123",
]) {
  test(`expands the macro in ${id}`, async () => {
    assertExpanded(await transform(id), id);
  });
}

test("leaves node_modules alone", async () => {
  assert.equal(
    await transform("/app/desktop/node_modules/some-dep/index.mjs"),
    null,
  );
});

test("leaves non-source files alone", async () => {
  assert.equal(await transform("/app/desktop/src/styles.css"), null);
});

/**
 * `test-loader-hooks.mjs` reads the same predicate, and it is handed
 * `file://` URLs and declaration files the plugin never sees.
 */
test("the shared predicate covers what the Node loader passes it", () => {
  assert.equal(
    isLinguiMacroSource(
      "file:///app/desktop/src/features/projects/projectIssues.mjs",
    ),
    true,
  );
  assert.equal(
    isLinguiMacroSource("file:///app/desktop/src/types.d.ts"),
    false,
  );
  assert.equal(
    isLinguiMacroSource("file:///app/desktop/node_modules/dep/index.ts"),
    false,
  );
});

test("leaves a source file without a macro import alone", async () => {
  assert.equal(
    await plugin.transform(
      `import { i18n } from "@lingui/core";\nexport const x = i18n;\n`,
      "/app/desktop/src/shared/plain.ts",
    ),
    null,
  );
});
