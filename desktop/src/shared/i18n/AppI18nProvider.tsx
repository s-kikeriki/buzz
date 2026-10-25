import * as React from "react";
import { I18nProvider } from "@lingui/react";

import {
  DEFAULT_LOCALE,
  getLocale,
  setLocale,
  useLocale,
} from "@/shared/lib/localePreference";
import { activateLocale, getActiveLocale, i18n } from "./i18n";

/**
 * Activates the catalogue for the selected locale and republishes it to the
 * tree. Rendering is gated on the first activation so no frame shows message
 * ids before the catalogue lands.
 */
export function AppI18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const locale = useLocale();
  const [activated, setActivated] = React.useState(
    () => getActiveLocale() !== null,
  );

  React.useEffect(() => {
    let cancelled = false;

    activateLocale(locale)
      .then((applied) => {
        if (!cancelled && applied) setActivated(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(`Failed to load the ${locale} message catalogue`, error);

        // Bounded, terminal recovery. One step back to the default locale, and
        // if the default is what just failed we render anyway: with no
        // catalogue loaded Lingui falls back to the message id, which is the
        // English source string — degraded, but readable and still navigable.
        // Retrying here instead would spin the effect forever.
        if (getLocale() !== DEFAULT_LOCALE) {
          setLocale(DEFAULT_LOCALE);
          return;
        }
        setActivated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!activated) return null;

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
