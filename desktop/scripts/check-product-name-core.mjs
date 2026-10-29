/**
 * Find a hardcoded product name in user-facing source.
 *
 * Split from the runner so the detector can be unit-tested on strings instead
 * of on the repo. A gate whose only test is "the repo passes" cannot tell the
 * difference between working and matching nothing.
 */

/**
 * `Buzz` as a standalone word.
 *
 * The lookarounds are what keep this from flagging code: `BuzzEvent`,
 * `useBuzzBridge`, `buzz.config` and `BUZZ_RELAY_URL` are identifiers, not
 * copy, and a gate that cannot tell them apart gets switched off. Lowercase
 * `buzz` is excluded for the same reason — it is the scheme, the slug, the
 * theme id and the package prefix, never a word a user reads.
 */
const PRODUCT_NAME_WORD = /(?<![A-Za-z0-9_$.])Buzz(?![A-Za-z0-9_$])/;

/**
 * Blank out comment bodies while keeping every byte's line number.
 *
 * Comments are where the *reasons* live, and several of them name Buzz
 * precisely because they explain why a string stopped naming it. Flagging
 * those would make the gate's own rationale a violation.
 *
 * Replacing characters rather than deleting them is deliberate: the reported
 * line number has to match the file a person then opens.
 */
export function blankComments(source) {
  const out = [];
  let mode = null;
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (mode === null) {
      if (source.startsWith("//", i)) {
        mode = "line";
        out.push("  ");
        i += 2;
        continue;
      }
      if (source.startsWith("/*", i)) {
        mode = "block";
        out.push("  ");
        i += 2;
        continue;
      }
      out.push(char);
      i += 1;
      continue;
    }
    if (mode === "line") {
      if (char === "\n") {
        mode = null;
        out.push("\n");
        i += 1;
        continue;
      }
      out.push(" ");
      i += 1;
      continue;
    }
    if (source.startsWith("*/", i)) {
      mode = null;
      out.push("  ");
      i += 2;
      continue;
    }
    out.push(char === "\n" ? "\n" : " ");
    i += 1;
  }
  return out.join("");
}

/**
 * Every line of `source` that names the product outside a comment.
 *
 * Returns `{ line, text }` objects, one per offending line.
 */
export function findHardcodedProductName(source) {
  const findings = [];
  blankComments(source)
    .split("\n")
    .forEach((line, index) => {
      if (PRODUCT_NAME_WORD.test(line)) {
        findings.push({ line: index + 1, text: line.trim() });
      }
    });
  return findings;
}
