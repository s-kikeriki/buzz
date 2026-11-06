import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Trans } from "@lingui/react/macro";

import { joinPolicyDocumentUrl, type JoinPolicy } from "@/shared/api/invites";
import { BRAND } from "@/shared/branding/brand";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";

type JoinPolicyNoticeProps = {
  ageConfirmed: boolean;
  agreementConfirmed: boolean;
  onAgeConfirmedChange: (confirmed: boolean) => void;
  onAgreementConfirmedChange: (confirmed: boolean) => void;
  policy: JoinPolicy;
  /** Relay hosting the policy documents the links below point at. */
  relayWsUrl: string;
};

/**
 * One relay-hosted policy document link, opened in the system browser.
 *
 * Extracted so the three consent sentences below can each carry their own
 * links without repeating the button's props — and so the link text stays
 * inside the sentence Lingui extracts.
 */
function PolicyLink({
  children,
  document,
  relayWsUrl,
}: {
  children: React.ReactNode;
  document: "privacy" | "terms";
  relayWsUrl: string;
}) {
  return (
    <Button
      className="h-auto p-0 align-baseline text-xs no-underline hover:underline focus-visible:no-underline"
      onClick={(event) => {
        event.preventDefault();
        void openUrl(joinPolicyDocumentUrl(relayWsUrl, document));
      }}
      type="button"
      variant="link"
    >
      {children}
    </Button>
  );
}

/**
 * Join-policy consent block shown on every join surface.
 *
 * The Terms/Privacy links open the relay-hosted document pages
 * (`/api/join-policy/terms|privacy`) in the system browser via the OS
 * opener. They must NOT navigate or render in-app: these surfaces exist
 * before onboarding completes, where the router (required by the message
 * Markdown component) is not mounted — an in-app render tears down the
 * whole React tree.
 */
export function JoinPolicyNotice({
  ageConfirmed,
  agreementConfirmed,
  onAgeConfirmedChange,
  onAgreementConfirmedChange,
  policy,
  relayWsUrl,
}: JoinPolicyNoticeProps) {
  const ageConfirmationId = React.useId();
  const agreementConfirmationId = React.useId();

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4 text-left">
      {policy.ageAttestationRequired ? (
        <div className="flex items-start gap-3">
          <Checkbox
            checked={ageConfirmed}
            className="mt-0.5"
            id={ageConfirmationId}
            onCheckedChange={(checked) =>
              onAgeConfirmedChange(checked === true)
            }
          />
          <label
            className="cursor-pointer text-xs leading-5 text-muted-foreground"
            htmlFor={ageConfirmationId}
          >
            <Trans>I am 18 years of age or older.</Trans>
          </label>
        </div>
      ) : null}

      {policy.termsMarkdown || policy.privacyMarkdown ? (
        <div className="flex items-start gap-3">
          <Checkbox
            checked={agreementConfirmed}
            className="mt-0.5"
            id={agreementConfirmationId}
            onCheckedChange={(checked) =>
              onAgreementConfirmedChange(checked === true)
            }
          />
          <label
            className="cursor-pointer text-xs leading-5 text-muted-foreground"
            htmlFor={agreementConfirmationId}
          >
            {/*
              Three whole sentences rather than one assembled from fragments
              plus a conditional " and ". The English reads the same either
              way; German does not — "den Nutzungsbedingungen" and "der
              Datenschutzerklärung" take different articles, and the verb goes
              last ("… zu."), so a translator needs the sentence, not its
              pieces. Each link stays inside its sentence as a numbered tag.
            */}
            {policy.termsMarkdown && policy.privacyMarkdown ? (
              <Trans>
                I agree to the {BRAND.productName}{" "}
                <PolicyLink document="terms" relayWsUrl={relayWsUrl}>
                  Terms of Service
                </PolicyLink>{" "}
                and{" "}
                <PolicyLink document="privacy" relayWsUrl={relayWsUrl}>
                  Privacy Policy
                </PolicyLink>
                .
              </Trans>
            ) : policy.termsMarkdown ? (
              <Trans>
                I agree to the {BRAND.productName}{" "}
                <PolicyLink document="terms" relayWsUrl={relayWsUrl}>
                  Terms of Service
                </PolicyLink>
                .
              </Trans>
            ) : (
              <Trans>
                I agree to the {BRAND.productName}{" "}
                <PolicyLink document="privacy" relayWsUrl={relayWsUrl}>
                  Privacy Policy
                </PolicyLink>
                .
              </Trans>
            )}
          </label>
        </div>
      ) : null}
    </div>
  );
}
