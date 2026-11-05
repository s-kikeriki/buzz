import { parseAsync } from "@babel/core";

/**
 * Finds user-facing English copy that was written as a literal instead of
 * going through a Lingui macro.
 *
 * Six shapes, which are the six that copy actually takes here:
 *
 *  1. **JSX text nodes** — `<p>Accent color</p>`. Must be `<Trans>`.
 *  2. **Copy-bearing props** — `aria-label`, `title`, `placeholder`, `legend`,
 *     and friends. Must be `` t`…` `` or a resolved `MessageDescriptor`.
 *  3. **Template literals in those same props** — `` aria-label={`Search in
 *     ${scope}`} ``. This one was missing, and it is the shape that hid most
 *     of the search palette: the detector read the file as clean while every
 *     interpolated label in it was hardcoded English.
 *  4. **Copy fields in object literals** — `{ label: "Quick search",
 *     description: "Open the search dialog" }`. Module-level tables like
 *     `KEYBOARD_SHORTCUTS` hold 58 strings that no JSX node ever mentions.
 *     These must be `msg`` ` plus `i18n._()` at render, not `t`` `, or they
 *     freeze in whichever locale booted.
 *  6. **Prose under any object key** — `{ all: "No activity yet",
 *     backLabel: "Back to Tasks", apiKeyLabel: "Anthropic API Key" }`. Rule 4
 *     keys off the field *name*, so anything under a key it does not know
 *     reads as clean. Two tables of inbox empty states — sixteen strings — hid
 *     behind that, and so did 32 more strings in nine files the ratchet
 *     already called converted, including the API-key labels and every
 *     transcript section heading.
 *
 *     What keeps this from flagging the kind-to-token and id-to-class maps
 *     that fill this codebase is `isProse`: two or more words. The earlier
 *     version of this rule instead required *every* value in the object to be
 *     prose, which is why it saw none of those 32 — one `className` or one
 *     numeric field anywhere in the object and it stopped looking. Prose is a
 *     property of the string, not of its neighbours.
 *
 *  5. **Prose assigned to a variable, then rendered** — `const browseTitle =
 *     isForumMode ? "Add a forum" : "Browse channels"`. No JSX node and no
 *     copy-bearing prop mentions these, so the first four rules read the file
 *     as clean. The German channel browser still said "Browse channels" and
 *     "Search or create a channel" after the first four rules passed it, and
 *     only a rendered-German screenshot found them.
 *
 * Everything else (`className`, `data-testid`, `href`, sample persona names,
 * closed-union tokens like `typeLabel="link"`) is data or markup, not copy,
 * and is out of scope by design rather than by omission.
 */

/** Props whose string value is rendered or announced to a person. */
export const COPY_PROPS = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "ariaLabel",
  "ariaValueText",
  "description",
  "label",
  "legend",
  "placeholder",
  "resetLabel",
  "subtitle",
  "title",
]);

/**
 * Props that carry markup, identity or routing rather than language.
 *
 * The prose rule below reads any prop it does not recognise, so these have to
 * be named: a two-token `className` with a capital letter in it is
 * indistinguishable from a sentence to `isProse`, and a `name` or `type` is a
 * form field's machine identity. `aria-*` props are deliberately *not* here —
 * a screen-reader label is copy, and two of them were hardcoded.
 */
const STRUCTURAL_PROPS = new Set([
  "accept",
  "autoComplete",
  "class",
  "className",
  "href",
  "id",
  "key",
  "name",
  "pattern",
  "ref",
  "rel",
  "src",
  "srcSet",
  "style",
  "testId",
  "to",
  "type",
]);

/**
 * Prose: two or more words, at least the first of them letters.
 *
 * Deliberately shaped to reject the two things that otherwise flood this rule
 * — Tailwind class lists and kebab-case identifiers — rather than to catch
 * every possible sentence. A single word is out of scope on purpose: `"alpha"`,
 * `"members"` and `"stream"` are overwhelmingly union tokens here, and one
 * missed single-word label costs far less than a gate nobody can keep green.
 */
const PROSE =
  /^\p{Letter}[\p{Letter}'’-]*(?:\s+[\p{Letter}\d'’“”".,!?:;()#—–-]+)+$/u;

/** A class list: every token lowercase, hyphenated or numeric. */
const CLASS_LIST = /^[a-z0-9:[\]/.%&_-]+(?:\s+[a-z0-9:[\]/.%&_-]+)+$/;

function isProse(value) {
  const text = value.trim();
  if (text.length < 4 || text.length > 200) return false;
  if (CLASS_LIST.test(text)) return false;
  if (/[/\\{}<>]/.test(text)) return false;
  return PROSE.test(text);
}

/**
 * Expression positions where a prose literal is almost certainly copy on its
 * way to the screen. Narrower than "anywhere": a prose string inside a
 * `console.log` or a thrown `Error` is a developer-facing message.
 */
const PROSE_PARENTS = new Set([
  "ArrowFunctionExpression",
  "ConditionalExpression",
  "LogicalExpression",
  "ReturnStatement",
  "VariableDeclarator",
]);

/**
 * A text node is copy only if it contains a letter. Punctuation, numbers,
 * separators and whitespace-only nodes (`{" "}`, `·`, `—`) carry no language.
 */
function isTranslatableText(value) {
  return /\p{Letter}/u.test(value);
}

/**
 * Single words that are identical in English and German and are rendered as
 * identifiers rather than prose would still be flagged; none are allowlisted
 * here on purpose. Add an explicit `path:line` override instead, so the
 * exception is reviewable.
 */
function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function elementName(node) {
  const name = node.name;
  if (!name) return "";
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    return `${name.object?.name ?? ""}.${name.property?.name ?? ""}`;
  }
  return "";
}

/** JSX elements whose children are a message template, not rendered copy. */
const MACRO_ELEMENTS = new Set(["Trans", "Plural", "Select", "SelectOrdinal"]);

/**
 * Calls whose arguments are message templates, not copy on its way to a screen.
 *
 * `plural(count, { one: "…", other: "…" })` hands Lingui the two forms of one
 * message; those strings are already translated, and the object they sit in is
 * exactly the "every value is prose" shape the copy-table rule looks for. The
 * JSX form of the same thing was already exempt through `MACRO_ELEMENTS` —
 * this is the call form, which only started to matter once that rule existed.
 */
const MACRO_CALLS = new Set(["plural", "select", "selectOrdinal", "msg", "t"]);

/**
 * Elements whose text is a key name rather than language.
 *
 * `<kbd>ESC</kbd>` and `<kbd>⌘K</kbd>` are what is printed on the keyboard; a
 * German build shows the same glyphs. Exempting the element is better than a
 * `path:line` override per keycap, because the reason generalises and the
 * override list stays short enough to read.
 */
const KEYCAP_ELEMENTS = new Set(["kbd"]);

/** `` `Search in ${scope}` `` → `"Search in {}"`, for the report only. */
function templateText(node) {
  return normalizeText(
    node.quasis.map((quasi) => quasi.value.cooked ?? "").join("{}"),
  );
}

/**
 * Walk the AST looking for the six violation shapes. Written as an explicit
 * stack walk rather than `@babel/traverse` so this script needs no extra
 * dependency beyond the `@babel/core` the macro transform already requires.
 */
export function findHardcodedCopy(ast) {
  const findings = [];
  const stack = [
    { node: ast, insideMacro: false, insideKeycap: false, parentType: null },
  ];

  while (stack.length > 0) {
    const { node, insideMacro, insideKeycap, parentType } = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const child of node) {
        stack.push({ node: child, insideMacro, insideKeycap, parentType });
      }
      continue;
    }
    if (typeof node.type !== "string") continue;

    let childrenInsideMacro = insideMacro;
    let childrenInsideKeycap = insideKeycap;

    if (node.type === "JSXElement") {
      const name = elementName(node.openingElement);
      childrenInsideMacro = insideMacro || MACRO_ELEMENTS.has(name);
      childrenInsideKeycap = insideKeycap || KEYCAP_ELEMENTS.has(name);
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      const name =
        callee?.type === "Identifier"
          ? callee.name
          : callee?.type === "MemberExpression" &&
              callee.property?.type === "Identifier"
            ? callee.property.name
            : undefined;
      childrenInsideMacro = insideMacro || MACRO_CALLS.has(name ?? "");
    }

    if (node.type === "JSXText" && !insideMacro && !insideKeycap) {
      const text = normalizeText(node.value);
      if (text.length > 0 && isTranslatableText(text)) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: "jsx-text",
          text,
        });
      }
    }

    if (node.type === "JSXAttribute") {
      const name =
        node.name?.type === "JSXIdentifier" ? node.name.name : undefined;
      const value = node.value;

      // Prose handed to a prop `COPY_PROPS` has never heard of. Every
      // component here invents its own names — `quickCreateLabel`,
      // `titlePlaceholder`, `backButtonAriaLabel`, `helpText` — so the closed
      // list cannot keep up, and 21 strings in already-converted files sat
      // behind exactly that, including the sidebar's "Browse channels" and two
      // screen-reader labels. Same reasoning as the object-key rule: read the
      // string, not the name.
      if (
        name &&
        !insideMacro &&
        !COPY_PROPS.has(name) &&
        !STRUCTURAL_PROPS.has(name) &&
        !name.startsWith("data-") &&
        value?.type === "StringLiteral" &&
        isProse(value.value) &&
        isTranslatableText(value.value)
      ) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: `prose-prop:${name}`,
          text: normalizeText(value.value),
        });
      }

      if (name && COPY_PROPS.has(name)) {
        if (value?.type === "StringLiteral") {
          const text = normalizeText(value.value);
          if (text.length > 0 && isTranslatableText(text)) {
            findings.push({
              line: node.loc?.start.line ?? 0,
              kind: `prop:${name}`,
              text,
            });
          }
        } else if (
          value?.type === "JSXExpressionContainer" &&
          value.expression?.type === "TemplateLiteral"
        ) {
          // An untagged template. `` t`…` `` and `` msg`…` `` are
          // TaggedTemplateExpression, so they never reach here.
          const text = templateText(value.expression);
          if (text.length > 0 && isTranslatableText(text)) {
            findings.push({
              line: node.loc?.start.line ?? 0,
              kind: `prop-template:${name}`,
              text,
            });
          }
        }
      }
    }

    // `{ label: "Quick search" }` in any object literal, including the
    // module-level tables that no JSX node mentions.
    if (node.type === "ObjectProperty" && !node.computed) {
      const key =
        node.key?.type === "Identifier"
          ? node.key.name
          : node.key?.type === "StringLiteral"
            ? node.key.value
            : undefined;
      // Prose under a key this script has never heard of. `backLabel`,
      // `apiKeyLabel`, `detailsTitle`, `fallbackErrorMessage` — the names are
      // unbounded, so the rule cannot key off them; it keys off the string.
      // Reported from the value's own line, because a multi-line property puts
      // the string somewhere below `node.loc`, and an override has to name the
      // line the reader can see the copy on.
      if (
        key &&
        !insideMacro &&
        !COPY_PROPS.has(key) &&
        node.value?.type === "StringLiteral" &&
        isProse(node.value.value) &&
        isTranslatableText(node.value.value)
      ) {
        findings.push({
          line: node.value.loc?.start.line ?? 0,
          kind: `prose-field:${key}`,
          text: normalizeText(node.value.value),
        });
      }

      if (key && COPY_PROPS.has(key)) {
        if (node.value?.type === "StringLiteral") {
          const text = normalizeText(node.value.value);
          if (text.length > 0 && isTranslatableText(text)) {
            findings.push({
              line: node.loc?.start.line ?? 0,
              kind: `field:${key}`,
              text,
            });
          }
        } else if (node.value?.type === "TemplateLiteral") {
          const text = templateText(node.value);
          if (text.length > 0 && isTranslatableText(text)) {
            findings.push({
              line: node.loc?.start.line ?? 0,
              kind: `field-template:${key}`,
              text,
            });
          }
        }
      }
    }

    if (
      node.type === "StringLiteral" &&
      PROSE_PARENTS.has(parentType) &&
      isProse(node.value)
    ) {
      findings.push({
        line: node.loc?.start.line ?? 0,
        kind: "prose-literal",
        text: normalizeText(node.value),
      });
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "leadingComments") continue;
      const value = node[key];
      if (value && typeof value === "object") {
        stack.push({
          node: value,
          insideMacro: childrenInsideMacro,
          insideKeycap: childrenInsideKeycap,
          parentType: node.type,
        });
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

export async function checkFileForHardcodedCopy(filename, source) {
  const ast = await parseAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    ast: true,
    code: false,
  });
  return findHardcodedCopy(ast);
}
