import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Check,
  Copy,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { cancelPairing, confirmPairingSas } from "@/shared/api/tauri";
import { startIdentityRecoveryPairing } from "@/shared/api/tauriPairing";
import { writeTextToClipboard } from "@/shared/lib/clipboard";
import { Button } from "@/shared/ui/button";
import { StyledQrCode } from "@/shared/ui/styled-qr-code";
import { BRAND } from "@/shared/branding/brand";

type Step = "loading" | "qr" | "sas" | "receiving" | "done" | "error";

// Refresh before the pairing relay's two-minute connection cap so Desktop never
// leaves a code on screen after its publishing channel has closed.
const QR_REFRESH_MS = 90_000;

/**
 * Resolved per call through `i18n._`, not stored as a string: this runs from a
 * Tauri event listener, not a React render, so there is no hook to read the
 * active locale from — and a module-level resolved string would freeze in
 * whichever locale booted.
 */
const PAIRING_EXPIRED_COPY = msg`This pairing code expired or lost its connection. Create a new code and try again.`;

function recoveryErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("sas-confirm") ||
    normalized.includes("relay connection closed") ||
    normalized.includes("websocket") ||
    normalized.includes("expired") ||
    normalized.includes("timed out")
  ) {
    return i18n._(PAIRING_EXPIRED_COPY);
  }
  return message;
}

export function IdentityRecoveryPairing({
  onRecovered,
  onStepChange,
}: {
  onRecovered: () => Promise<void>;
  onStepChange?: (step: Step) => void;
}) {
  const { t } = useLingui();
  const [step, setStep] = React.useState<Step>("loading");
  const [qrUri, setQrUri] = React.useState<string | null>(null);
  const [sas, setSas] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const active = React.useRef(true);
  const copyTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  const start = React.useCallback(async () => {
    active.current = true;
    setStep("loading");
    setError(null);
    setSas(null);
    setQrUri(null);
    setCopied(false);
    try {
      setQrUri(await startIdentityRecoveryPairing());
      setStep("qr");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t`Could not start recovery.`,
      );
      setStep("error");
    }
  }, [t]);

  React.useEffect(() => {
    void start();
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    listen<{ sas: string }>("pairing-sas-received", ({ payload }) => {
      if (!disposed && active.current) {
        setSas(payload.sas);
        setStep("sas");
      }
    }).then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)));
    listen("pairing-complete", () => {
      if (!disposed && active.current) {
        active.current = false;
        setStep("done");
        void onRecovered();
      }
    }).then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)));
    listen<{ message: string }>("pairing-error", ({ payload }) => {
      if (!disposed && active.current) {
        active.current = false;
        setError(recoveryErrorMessage(payload.message));
        setStep("error");
      }
    }).then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)));
    listen<{ reason: string }>("pairing-aborted", ({ payload }) => {
      if (!disposed && active.current) {
        active.current = false;
        setError(t`Recovery stopped: ${payload.reason}`);
        setStep("error");
      }
    }).then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)));
    return () => {
      disposed = true;
      active.current = false;
      for (const unlisten of unlisteners) unlisten();
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      void cancelPairing();
    };
  }, [onRecovered, start, t]);

  React.useEffect(() => {
    if (step !== "qr") return;
    const timer = window.setTimeout(() => void start(), QR_REFRESH_MS);
    return () => window.clearTimeout(timer);
  }, [start, step]);

  async function copyPairingCode() {
    if (!qrUri) return;
    try {
      await writeTextToClipboard(qrUri);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(t`Could not copy the pairing code. Try again.`);
    }
  }

  async function deny() {
    active.current = false;
    await cancelPairing().catch(() => {});
    setError(t`The codes didn't match. Pairing was canceled.`);
    setStep("error");
  }

  async function confirm() {
    setStep("receiving");
    try {
      await confirmPairingSas();
    } catch (cause) {
      if (!active.current) return;
      setError(
        recoveryErrorMessage(
          cause instanceof Error
            ? cause.message
            : t`Could not confirm recovery.`,
        ),
      );
      setStep("error");
    }
  }

  return (
    <div
      className="flex w-[266px] max-w-full flex-col items-stretch gap-3"
      data-testid="identity-recovery-pairing"
    >
      <div
        className="flex min-h-[240px] w-full shrink-0 items-center justify-center"
        data-testid="identity-recovery-qr-container"
      >
        {step === "qr" && qrUri ? (
          <StyledQrCode
            animate
            centerImageSrc="/app-icon@2x.png"
            data-testid="identity-recovery-qr"
            size={240}
            title={t`Desktop identity recovery QR code`}
            value={qrUri}
          />
        ) : step === "sas" && sas ? (
          <div className="flex max-w-60 flex-col items-center gap-3 py-2 text-center text-foreground">
            <ShieldCheck className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium">
              <Trans>Does this code match your phone?</Trans>
            </p>
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-3">
              <p
                className="font-mono text-3xl font-bold tracking-[0.25em]"
                data-testid="identity-recovery-sas"
              >
                {sas.slice(0, 3)} {sas.slice(3)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              <Trans>
                This gives this desktop permanent access to your{" "}
                {BRAND.productName} identity. Only continue if you trust it.
              </Trans>
            </p>
            <div className="flex w-full flex-col gap-2">
              <Button
                className="flex-1"
                data-testid="confirm-identity-recovery-sas"
                onClick={() => void confirm()}
              >
                <Check className="mr-1.5 h-4 w-4" />
                <Trans>Codes match</Trans>
              </Button>
              <Button
                className="flex-1"
                data-testid="deny-identity-recovery-sas"
                onClick={() => void deny()}
                variant="outline"
              >
                <X className="mr-1.5 h-4 w-4" />
                <Trans>Cancel</Trans>
              </Button>
            </div>
          </div>
        ) : step === "done" ? (
          <div className="flex flex-col items-center gap-3 text-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium">
              <Trans>Identity received securely</Trans>
            </p>
          </div>
        ) : step === "error" ? (
          <div className="flex max-w-52 flex-col items-center gap-3 text-center text-foreground">
            <TriangleAlert className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => void start()} size="sm" variant="outline">
              <RefreshCw className="mr-1.5 h-4 w-4" />
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-foreground">
            <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {step === "receiving"
                ? t`Receiving identity from mobile device...`
                : t`Starting pairing...`}
            </p>
          </div>
        )}
      </div>
      {step === "loading" || (step === "qr" && qrUri) ? (
        <Button
          className="w-full border-foreground/20 bg-white text-foreground shadow-none hover:bg-black/5"
          data-testid="copy-identity-recovery-code"
          disabled={step === "loading"}
          onClick={() => void copyPairingCode()}
          size="sm"
          type="button"
          variant="outline"
        >
          {step === "loading" ? (
            <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
          ) : copied ? (
            <Check className="mr-1.5 h-4 w-4" />
          ) : (
            <Copy className="mr-1.5 h-4 w-4" />
          )}
          {step === "loading"
            ? t`Generating pairing code...`
            : copied
              ? t`Copied`
              : t`Copy pairing code`}
        </Button>
      ) : null}
      {step === "qr" && error ? (
        <p className="max-w-[266px] text-center text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
