import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFileForHardcodedCopy } from "./check-i18n-coverage-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/**
 * Files that have been converted to the i18n catalogue and must stay that way.
 *
 * This list is a **ratchet**, not an inventory: it only ever grows, and a file
 * joins it in the same change that converts it. A sweep that converts a screen
 * without adding its files here has no regression protection — the next
 * hardcoded string someone adds to that screen ships silently.
 */
const CONVERTED_FILES = [
  "src/features/settings/ui/AppearanceSettingsControls.tsx",
  "src/features/settings/ui/LanguageSettingsControl.tsx",
  "src/features/settings/ui/AppearanceSettingsPanel.tsx",
  // Settings chrome: the nav rail and group headers that frame every panel.
  "src/features/settings/ui/SettingsView.tsx",
  // Sidebar navigation: the rows, section titles, badges and channel menu a
  // person reads before they ever open Settings.
  "src/features/sidebar/ui/AppSidebar.tsx",
  "src/features/sidebar/ui/AppSidebarPinnedHeader.tsx",
  "src/features/sidebar/ui/ChannelContextMenu.tsx",
  "src/features/sidebar/ui/CommunityRail.tsx",
  "src/features/sidebar/ui/SectionUnreadThreadCount.tsx",
  "src/features/sidebar/ui/SidebarSection.tsx",
];

/**
 * `path:line` exceptions. Every entry needs a reason — if a string genuinely
 * is not copy, the comment is how a reviewer checks that claim.
 */
const OVERRIDES = new Map([]);

async function main() {
  const violations = [];

  for (const relativePath of CONVERTED_FILES) {
    const absolutePath = path.join(projectRoot, relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      // A converted file that no longer exists means the ratchet list is
      // stale. Fail loudly rather than quietly checking nothing.
      violations.push({
        file: relativePath,
        line: 0,
        kind: "missing-file",
        text: "listed in CONVERTED_FILES but not found — update the list",
      });
      continue;
    }

    const findings = await checkFileForHardcodedCopy(absolutePath, source);
    for (const finding of findings) {
      const key = `${relativePath}:${finding.line}`;
      if (OVERRIDES.has(key)) continue;
      violations.push({ file: relativePath, ...finding });
    }
  }

  if (violations.length === 0) {
    console.log(
      `i18n coverage: ${CONVERTED_FILES.length} converted file(s) clean.`,
    );
    return;
  }

  console.error("Hardcoded user-facing copy in an i18n-converted file:\n");
  for (const violation of violations) {
    console.error(
      `  ${violation.file}:${violation.line}  [${violation.kind}]  ${JSON.stringify(violation.text)}`,
    );
  }
  console.error(
    [
      "",
      "Wrap JSX text in <Trans>, and copy-bearing props in the t`` macro:",
      "",
      "  <p>Accent color</p>            ->  <p><Trans>Accent color</Trans></p>",
      '  aria-label="Glass opacity"     ->  aria-label={t`Glass opacity`}',
      "",
      "For a module-level table, use msg`` and resolve it per render with",
      "i18n._(descriptor) — a plain string there freezes in the boot locale.",
      "",
      "If a string genuinely is not user-facing copy, add a `path:line` entry",
      "to OVERRIDES in desktop/scripts/check-i18n-coverage.mjs with a reason.",
      "",
      "Then run: pnpm --filter buzz exec lingui extract",
    ].join("\n"),
  );
  process.exitCode = 1;
}

await main();
