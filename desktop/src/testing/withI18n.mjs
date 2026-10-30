import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import React from "react";

/**
 * Wrap an element in the Lingui provider for a unit test.
 *
 * A component that calls `useLingui()` throws without it, with an error that
 * blames a duplicate `@lingui/react` install ("This often happens when
 * multiple instances of @lingui/react are installed…") and names neither the
 * component nor the missing provider. It costs real time to read past, so
 * reach for this the moment a test renders a converted component.
 *
 * `useLingui()` is the convention in components, and the reason is not style:
 * a context read re-renders past a `React.memo` boundary, and the global `t`
 * macro does not. `Markdown` is memoized, so a message link whose label came
 * from the global macro would keep the old language after a switch while the
 * rest of the screen changed.
 *
 * The locale is activated process-wide in `test-loader.mjs`; this only
 * republishes that `i18n` through React context.
 */
export function withI18n(element) {
  return React.createElement(I18nProvider, { i18n }, element);
}
