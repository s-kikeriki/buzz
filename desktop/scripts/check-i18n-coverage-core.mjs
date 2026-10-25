import { parseAsync } from "@babel/core";

/**
 * Finds user-facing English copy that was written as a literal instead of
 * going through a Lingui macro.
 *
 * Scope is deliberately two things and nothing else, because those are the
 * two shapes copy actually takes in this codebase:
 *
 *  1. **JSX text nodes** — `<p>Accent color</p>`. Must be `<Trans>`.
 *  2. **Copy-bearing props** — `aria-label`, `title`, `placeholder`, `legend`,
 *     and friends. Must be `` t`…` `` or a resolved `MessageDescriptor`.
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
 * Walk the AST looking for the two violation shapes. Written as an explicit
 * stack walk rather than `@babel/traverse` so this script needs no extra
 * dependency beyond the `@babel/core` the macro transform already requires.
 */
export function findHardcodedCopy(ast) {
  const findings = [];
  const stack = [{ node: ast, insideMacro: false }];

  while (stack.length > 0) {
    const { node, insideMacro } = stack.pop();
    if (!node || typeof node !== "object") continue;

    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, insideMacro });
      continue;
    }
    if (typeof node.type !== "string") continue;

    let childrenInsideMacro = insideMacro;

    if (node.type === "JSXElement") {
      childrenInsideMacro =
        insideMacro || MACRO_ELEMENTS.has(elementName(node.openingElement));
    }

    if (node.type === "JSXText" && !insideMacro) {
      const text = normalizeText(node.value);
      if (text.length > 0 && isTranslatableText(text)) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: "jsx-text",
          text,
        });
      }
    }

    if (node.type === "JSXAttribute" && node.value?.type === "StringLiteral") {
      const name =
        node.name?.type === "JSXIdentifier" ? node.name.name : undefined;
      const text = normalizeText(node.value.value);
      if (
        name &&
        COPY_PROPS.has(name) &&
        text.length > 0 &&
        isTranslatableText(text)
      ) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: `prop:${name}`,
          text,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "leadingComments") continue;
      const value = node[key];
      if (value && typeof value === "object") {
        stack.push({ node: value, insideMacro: childrenInsideMacro });
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
