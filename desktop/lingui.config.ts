import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * Catalogue configuration for the desktop app.
 *
 * `pseudo` is a generated locale, never hand-translated: Lingui accents and
 * pads every source string so untranslated copy is obvious on sight and
 * German's ~30% length growth is simulated before a German translation
 * exists. `scripts/check-pseudo-overflow.mjs` reads the same locale.
 *
 * `lineNumbers: false` keeps catalogue diffs to actual message changes —
 * otherwise every unrelated edit above a string rewrites its reference
 * comment and buries the real change.
 */
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "de", "pseudo"],
  pseudoLocale: "pseudo",
  fallbackLocales: {
    pseudo: "en",
    default: "en",
  },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: [
        "**/node_modules/**",
        // Declaration files are types, not source. Babel parses them as
        // scripts and chokes on `export const X: "literal";`.
        "**/*.d.ts",
        "**/*.d.mts",
        "**/*.test.mjs",
        "**/*.jsdom-test.mjs",
        "<rootDir>/src/testing/**",
        "<rootDir>/src/app/routeTree.gen.ts",
      ],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
