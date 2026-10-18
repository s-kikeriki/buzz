import * as React from "react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";

import {
  type AppLocale,
  selectableLocales,
  setLocale,
  useLocale,
} from "@/shared/lib/localePreference";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { SettingsOptionRow } from "./SettingsOptionGroup";

/**
 * Language names are deliberately **not** translated — a language is listed in
 * its own language so someone stranded in a locale they cannot read can still
 * find their way out. `pseudo` is the exception: it is a developer tool and
 * only ever rendered in a dev build.
 */
const LOCALE_ENDONYMS: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
  pseudo: "Pseudo",
};

const LANGUAGE_DESCRIPTION: MessageDescriptor = msg`Language used across menus, settings, and system messages`;

export function LanguageSetting() {
  const locale = useLocale();
  const { i18n, t } = useLingui();
  const options = React.useMemo(
    () =>
      selectableLocales().map((value) => ({
        value,
        label: LOCALE_ENDONYMS[value],
      })),
    [],
  );

  return (
    <SettingsOptionRow data-testid="language-row">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <Trans>Language</Trans>
        </p>
        <p
          className="text-sm font-normal text-muted-foreground/70"
          data-settings-subcopy
        >
          {i18n._(LANGUAGE_DESCRIPTION)}
        </p>
      </div>
      <SegmentedControl
        legend={t`Language`}
        onValueChange={setLocale}
        optionTestIdPrefix="language"
        options={options}
        size={options.length > 2 ? "wide" : "compact"}
        testId="language-control"
        value={locale}
      />
    </SettingsOptionRow>
  );
}
