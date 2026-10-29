import assert from "node:assert/strict";
import test from "node:test";

import { checkFileForHardcodedCopy } from "./check-i18n-coverage-core.mjs";

const FILE = "Example.tsx";

async function findings(source) {
  return await checkFileForHardcodedCopy(FILE, source);
}

test("flags a bare JSX text node", async () => {
  const result = await findings(`
    export function C() {
      return <p>Accent color</p>;
    }
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "jsx-text");
  assert.equal(result[0].text, "Accent color");
});

test("accepts the same copy wrapped in Trans", async () => {
  const result = await findings(`
    import { Trans } from "@lingui/react/macro";
    export function C() {
      return <p><Trans>Accent color</Trans></p>;
    }
  `);
  assert.deepEqual(result, []);
});

test("does not flag text nested deeper inside a Trans", async () => {
  const result = await findings(`
    import { Trans } from "@lingui/react/macro";
    export function C() {
      return (
        <Trans>
          Read the <a href="/docs">documentation</a> first.
        </Trans>
      );
    }
  `);
  assert.deepEqual(result, []);
});

test("flags a copy-bearing prop written as a string literal", async () => {
  const result = await findings(`
    export function C() {
      return <input aria-label="Glass opacity" placeholder="Search" />;
    }
  `);
  assert.deepEqual(result.map((f) => f.kind).sort(), [
    "prop:aria-label",
    "prop:placeholder",
  ]);
});

test("accepts a copy-bearing prop driven by the t macro", async () => {
  const result = await findings(`
    import { useLingui } from "@lingui/react/macro";
    export function C() {
      const { t } = useLingui();
      return <input aria-label={t\`Glass opacity\`} />;
    }
  `);
  assert.deepEqual(result, []);
});

test("ignores props that are markup or data rather than copy", async () => {
  const result = await findings(`
    export function C() {
      return (
        <a
          className="text-sm font-medium"
          data-testid="accent-color-red"
          href="https://example.com/product-updates"
          id="glass-opacity-description"
          typeLabel="link"
        />
      );
    }
  `);
  assert.deepEqual(result, []);
});

test("ignores text nodes that carry no language", async () => {
  const result = await findings(`
    export function C() {
      return (
        <p>
          {" "}
          — · 9:41 {value}
        </p>
      );
    }
  `);
  assert.deepEqual(result, []);
});

test("reports the line so a reviewer can find the string", async () => {
  const result = await findings(
    ["export function C() {", "  return <p>Thread layout</p>;", "}"].join("\n"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 2);
});

test("flags every violation in a file, not just the first", async () => {
  const result = await findings(`
    export function C() {
      return (
        <div>
          <p>Font size</p>
          <p title="Conversation density">Link previews</p>
        </div>
      );
    }
  `);
  assert.equal(result.length, 3);
});

// ── Shapes the first version of this detector missed ────────────────────────

test("flags a template literal in a copy prop", async () => {
  // The shape that hid most of the search palette: every interpolated label
  // was hardcoded English and the file read as clean.
  const result = await findings(`
    export function C({ scope }) {
      return <input aria-label={\`Search in \${scope}\`} />;
    }
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "prop-template:aria-label");
  assert.equal(result[0].text, "Search in {}");
});

test("accepts a tagged t template in a copy prop", async () => {
  const result = await findings(`
    import { useLingui } from "@lingui/react/macro";
    export function C({ scope }) {
      const { t } = useLingui();
      return <input aria-label={t\`Search in \${scope}\`} />;
    }
  `);
  assert.deepEqual(result, []);
});

test("does not flag a template with no language in it", async () => {
  const result = await findings(`
    export function C({ id }) {
      return <input aria-label={\`\${id}-\${id}\`} />;
    }
  `);
  assert.deepEqual(result, []);
});

test("flags copy fields in a module-level table", async () => {
  // KEYBOARD_SHORTCUTS holds 58 strings that no JSX node mentions.
  const result = await findings(`
    export const SHORTCUTS = [
      { id: "quick-search", label: "Quick search", description: "Open the search dialog" },
    ];
  `);
  // Both findings sit on the same line, so the report order is not defined.
  assert.deepEqual(
    result.map((finding) => `${finding.kind}=${finding.text}`).sort(),
    ["field:description=Open the search dialog", "field:label=Quick search"],
  );
});

test("accepts msg descriptors in a module-level table", async () => {
  const result = await findings(`
    import { msg } from "@lingui/core/macro";
    export const SHORTCUTS = [
      { id: "quick-search", label: msg\`Quick search\`, description: msg\`Open the search dialog\` },
    ];
  `);
  assert.deepEqual(result, []);
});

test("leaves non-copy object fields alone", async () => {
  const result = await findings(`
    export const ROWS = [
      { id: "alpha", value: "members", keys: "Ctrl+K", className: "flex gap-2" },
    ];
  `);
  assert.deepEqual(result, []);
});

test("flags a template literal in a table's copy field", async () => {
  const result = await findings(`
    export function build(name) {
      return [{ label: \`Open \${name}\` }];
    }
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "field-template:label");
  assert.equal(result[0].text, "Open {}");
});

test("exempts keycap text, which is printed on the keyboard", async () => {
  const result = await findings(`
    export function C() {
      return (
        <div>
          <kbd>ESC</kbd>
          <kbd>⌘K</kbd>
        </div>
      );
    }
  `);
  assert.deepEqual(result, []);
});

test("still flags copy that merely sits next to a keycap", async () => {
  const result = await findings(`
    export function C() {
      return (
        <div>
          <span>Press</span>
          <kbd>ESC</kbd>
        </div>
      );
    }
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "Press");
});

test("a computed key is not read as a copy field", async () => {
  const result = await findings(`
    const key = "label";
    export const ROWS = [{ [key]: "Quick search" }];
  `);
  assert.deepEqual(result, []);
});
