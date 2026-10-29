import { parseAsync } from "@babel/core";

/**
 * Finds user-facing English copy that was written as a literal instead of
 * going through a Lingui macro.
 *
 * Five shapes, which are the five that copy actually takes here:
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
 * Walk the AST looking for the five violation shapes. Written as an explicit
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
