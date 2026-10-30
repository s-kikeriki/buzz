import { parseAsync } from "@babel/core";

/**
 * Finds date, time and number formatting that does not follow the app locale.
 *
 * Two shapes, and both of them shipped:
 *
 *  1. **A hardcoded locale tag** — `new Intl.DateTimeFormat("en-US", …)`.
 *     Twenty of the app's twenty-four formatters were module-level constants
 *     written this way, so a German build printed "Saturday, June 20" under
 *     German copy. A constant cannot follow a preference the user changes at
 *     runtime, which is why the tag is the thing to ban rather than the
 *     constant.
 *
 *  2. **An omitted locale** — `date.toLocaleDateString()`, or the same call
 *     with `undefined` in the first position. This is the worse one: it reads
 *     as "use the default" and actually means *the operating system's*
 *     locale, which is not the app's language setting. A German app on an
 *     English Mac printed English dates and an English app on a German Mac
 *     printed German ones, and neither followed the preference the user set.
 *     It also makes a test a tautology — `toLocaleDateString(undefined, …)`
 *     on both sides of an assertion passes on every machine.
 *
 * The fix in both cases is `@/shared/lib/intlLocale`, which takes an
 * `AppLocale` and throws on anything else.
 */

/** `Intl` constructors whose first argument is a locale list. */
const INTL_CONSTRUCTORS = new Set([
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "DurationFormat",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
]);

/**
 * Methods whose first argument is a locale list.
 *
 * `toLocaleLowerCase` and `toLocaleUpperCase` are deliberately **not** here.
 * Every call to them in this app is case folding for a comparison — search
 * matching, id normalisation — and a comparison must be locale-*invariant*,
 * not follow the user's language: Turkish folds I to a dotless ı, and the two
 * runtimes already disagree about U+212A. Pointing those calls at the app
 * locale would make matching depend on the interface language, which is a
 * worse bug than the one this gate exists to prevent. They need the opposite
 * rule, and that is a separate change.
 */
const LOCALE_METHODS = new Set([
  "toLocaleDateString",
  "toLocaleString",
  "toLocaleTimeString",
]);

function isLocaleLiteral(node) {
  if (!node) return false;
  if (node.type === "StringLiteral") return true;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return true;
  }
  if (node.type === "ArrayExpression") {
    return node.elements.some((element) => isLocaleLiteral(element));
  }
  return false;
}

function literalText(node) {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
  }
  if (node.type === "ArrayExpression") {
    return node.elements
      .filter((element) => element && isLocaleLiteral(element))
      .map((element) => literalText(element))
      .join(", ");
  }
  return "";
}

export function findHardcodedLocales(ast) {
  const findings = [];
  const stack = [ast];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    if (typeof node.type !== "string") continue;

    // new Intl.X("en-US", …)
    if (
      node.type === "NewExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.object?.type === "Identifier" &&
      node.callee.object.name === "Intl" &&
      node.callee.property?.type === "Identifier" &&
      INTL_CONSTRUCTORS.has(node.callee.property.name)
    ) {
      const [locale] = node.arguments;
      if (isLocaleLiteral(locale)) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: `intl:${node.callee.property.name}`,
          text: literalText(locale),
        });
      }
    }

    // value.toLocaleDateString() / (…, undefined, …)
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property?.type === "Identifier" &&
      LOCALE_METHODS.has(node.callee.property.name)
    ) {
      const [locale] = node.arguments;
      const isMissing =
        locale === undefined ||
        (locale.type === "Identifier" && locale.name === "undefined") ||
        locale.type === "NullLiteral";
      if (isMissing) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: `method:${node.callee.property.name}`,
          text: locale === undefined ? "(no locale)" : "undefined",
        });
      } else if (isLocaleLiteral(locale)) {
        findings.push({
          line: node.loc?.start.line ?? 0,
          kind: `method:${node.callee.property.name}`,
          text: literalText(locale),
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "leadingComments") continue;
      const value = node[key];
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

export async function checkFileForHardcodedLocales(filename, source) {
  const ast = await parseAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    ast: true,
    code: false,
  });
  return findHardcodedLocales(ast);
}
