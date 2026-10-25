import { transformAsync } from "@babel/core";

/**
 * Runs the Lingui macro transform over app source.
 *
 * Why this exists rather than `react({ babel: { plugins: [...] } })`: this app
 * is on Vite 8 with `@vitejs/plugin-react` v6, which transforms through Oxc
 * and **has no `babel` option at all** (see its `Options` interface — only
 * `include`, `exclude`, `jsxImportSource`, `jsxRuntime`, `reactRefreshHost`).
 * Passing `babel` there is silently ignored: the macros never expand,
 * `useLingui()` compiles to `void 0`, and every converted screen throws at
 * runtime. That failure is invisible at build time, so it needs its own plugin.
 *
 * Cost control: the Babel pass only runs on files that actually import a
 * Lingui macro. Everything else is rejected by a substring test before any
 * parsing happens.
 */

const MACRO_IMPORT = "@lingui/";
const MACRO_SPECIFIERS = ["@lingui/core/macro", "@lingui/react/macro"];
const SOURCE_FILE = /\.[jt]sx?(?:\?.*)?$/;

function usesLinguiMacro(code) {
  if (!code.includes(MACRO_IMPORT)) return false;
  return MACRO_SPECIFIERS.some((specifier) => code.includes(specifier));
}

export function linguiMacro() {
  return {
    name: "buzz:lingui-macro",
    // Must beat the React plugin's Oxc pass, which would otherwise strip the
    // TypeScript and JSX this transform needs to see.
    enforce: "pre",
    async transform(code, id) {
      if (!SOURCE_FILE.test(id) || id.includes("/node_modules/")) return null;
      if (!usesLinguiMacro(code)) return null;

      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        // Parse TS/JSX but emit them back unchanged — Oxc still owns the
        // actual TypeScript and JSX lowering further down the pipeline.
        parserOpts: { plugins: ["typescript", "jsx"] },
        plugins: ["@lingui/babel-plugin-lingui-macro"],
        sourceMaps: true,
      });

      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}
