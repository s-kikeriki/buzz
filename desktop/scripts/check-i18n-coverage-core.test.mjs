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
