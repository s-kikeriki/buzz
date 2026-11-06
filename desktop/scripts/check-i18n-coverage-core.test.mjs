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

test("a table keyed by ids, not copy fields, is still copy", async () => {
  // The hole this rule was written for. `INBOX_EMPTY_STATE_TITLES` is keyed by
  // filter id, so the copy-field rule read it as clean while all sixteen inbox
  // empty states were hardcoded English.
  const result = await findings(`
    export const TITLES = {
      all: "No activity yet",
      mention: "No mentions found",
      needs_action: "Nothing needs action",
    };
  `);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((finding) => finding.text),
    ["No activity yet", "No mentions found", "Nothing needs action"],
  );
  assert.ok(result.every((finding) => finding.kind.startsWith("prose-field:")));
});

test("a half-converted copy table flags only the entries left behind", async () => {
  // The realistic regression: adding a filter to a converted table leaves one
  // plain string behind. Two earlier versions of this rule both missed it,
  // because both asked a question about the object — "is every value prose?",
  // "is every value prose or a message?" — instead of about the string.
  const result = await findings(`
    import { msg } from "@lingui/core/macro";
    export const TITLES = {
      all: msg\`No activity yet\`,
      mention: msg\`No mentions found\`,
      drafts: "No drafts",
    };
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "No drafts");
  assert.equal(result[0].kind, "prose-field:drafts");
});

test("a fully converted copy table is clean", async () => {
  const result = await findings(`
    import { msg } from "@lingui/core/macro";
    export const TITLES = {
      all: msg\`No activity yet\`,
      mention: msg\`No mentions found\`,
    };
  `);
  assert.deepEqual(result, []);
});

test("prose in a mixed object is still copy; its neighbours are not", async () => {
  // The shape that hid 32 strings. The earlier rule asked whether the *object*
  // was a copy table, so one `compact` or one number anywhere in it made the
  // whole object data and the sentence invisible. Tokens and numbers stay out
  // on their own merits: a single word is not prose.
  const result = await findings(`
    export const MODES = {
      compact: "compact",
      roomy: 42,
      className: "flex gap-2",
      wide: "Wide spacing for big screens",
    };
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "prose-field:wide");
  assert.equal(result[0].text, "Wide spacing for big screens");
});

test("a multi-line property is reported on the string's own line", async () => {
  // `personaModelDiscoveryStatus.ts` was in the ratchet and called clean while
  // it returned five English sentences, each one a property value sitting a
  // line or two below its key. An override has to name the line a reader can
  // see the copy on, so the finding comes from the value, not the property.
  const result = await findings(`
    export function status() {
      return {
        summary:
          "Databricks sign-in is required before models can be listed.",
      };
    }
  `);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "prose-field:summary");
  // Line 4 is `summary:`; line 5 is the sentence.
  assert.equal(result[0].line, 5);
});

test("flags prose handed to a prop the copy list has never heard of", async () => {
  // 21 strings in already-converted files sat behind the closed prop list,
  // including the sidebar's "Browse channels" and two screen-reader labels.
  const result = await findings(`
    export function C() {
      return (
        <Section
          backButtonAriaLabel="Back to channel"
          quickCreateLabel="Browse channels"
        />
      );
    }
  `);
  assert.deepEqual(
    result.map((finding) => `${finding.kind}=${finding.text}`).sort(),
    [
      "prose-prop:backButtonAriaLabel=Back to channel",
      "prose-prop:quickCreateLabel=Browse channels",
    ],
  );
});

test("structural props are markup, not copy", async () => {
  // `className` is the reason this list exists: a two-token class list with a
  // capital in it is indistinguishable from a sentence. `rel` is the other —
  // "noreferrer noopener" is a link relationship.
  const result = await findings(`
    export function C() {
      return (
        <a className="flex Items" href="/x" rel="noreferrer noopener" type="button">
          <Trans>Open</Trans>
        </a>
      );
    }
  `);
  assert.deepEqual(result, []);
});

test("the JSX plural macro's own forms are not hardcoded props", async () => {
  // `<Plural one="Unread thread" other="Unread threads" />` hands Lingui the
  // forms of one message. The prop rule reads unknown prop names, so without
  // the macro fence it would flag the message it is about to translate.
  const result = await findings(`
    import { Plural } from "@lingui/react/macro";
    export function C({ count }) {
      return <Plural value={count} one="Unread thread" other="Unread threads" />;
    }
  `);
  assert.deepEqual(result, []);
});

test("the plural macro's own message forms are not a copy table", async () => {
  // `plural(n, { one: "…", other: "…" })` hands Lingui two forms of one
  // message. The first version of the copy-table rule flagged both, on a file
  // that was already converted — a false positive found by running the new
  // rule against the existing ratchet.
  const result = await findings(`
    import { plural } from "@lingui/core/macro";
    export function note(count) {
      return plural(count, {
        one: "Its subsection moves to the top level.",
        other: "Its # subsections move to the top level.",
      });
    }
  `);
  assert.deepEqual(result, []);
});
