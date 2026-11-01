import { Trans, useLingui } from "@lingui/react/macro";
import { msg, t } from "@lingui/core/macro";
import * as React from "react";
import {
  AlertCircle,
  Brain,
  ExternalLink,
  GalleryVerticalEnd,
  KeyRound,
  Lock,
  Sparkles,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import {
  setCardGalleryOpen,
  startCardMint,
} from "@/features/agents/cardMintStore";
import { globalAgentConfigQueryKey } from "@/features/agents/useGlobalAgentConfig";
import {
  cardMintKeyStatus,
  cardMintSaveOpenaiKey,
  type CardMintKeyLayer,
  type SnapshotMemoryLevel,
} from "@/shared/api/tauriPersonas";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { SnapshotOptionMenu } from "./SnapshotOptionMenu";
import {
  isReadOnlyLayer,
  keyPanelTitle,
  showCancelButton,
  showKeyPanel,
  showKeyStatusRow,
  showReadOnlyRow,
} from "./cardMintKeyUtils";
import { BRAND } from "@/shared/branding/brand";

const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";

/** Same three levels as snapshot export; "Agent only" is the safe default. */
const MEMORY_LEVELS: {
  value: SnapshotMemoryLevel;
  label: ReturnType<typeof msg>;
}[] = [
  { value: "none", label: msg`Agent only` },
  { value: "core", label: msg`Agent + core memory` },
  { value: "everything", label: msg`Agent + all memories` },
];

/**
 * The free alternative, as an action: ordinary snapshot export shares the
 * same importable agent without card art or API spend. Rendered in both the
 * key-setup panel and the normal pre-mint form (the cost disclosure and its
 * escape hatch must be visible BEFORE any spend, not only during onboarding).
 */
function FreeSharePathRow({
  disabled,
  onExportInstead,
}: {
  disabled: boolean;
  onExportInstead?: () => void;
}) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <div
      className="flex items-center justify-between gap-3"
      data-testid="agent-card-free-path"
    >
      <p className="text-xs text-muted-foreground">
        <Trans>
          Don’t want to spend money? Ordinary export shares the same importable
          agent — free, just without the card art.
        </Trans>
      </p>
      {onExportInstead ? (
        <Button
          className="shrink-0"
          data-testid="agent-card-export-instead"
          disabled={disabled}
          onClick={onExportInstead}
          size="sm"
          variant="outline"
        >
          <Trans>Share without card art</Trans>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Mint-a-trading-card dialog — the pre-mint half only: key setup (when
 * needed) → optional style notes → "Mint card". Minting itself runs as a
 * background job in `cardMintStore`: this dialog dispatches and closes, the
 * composer activity rail shows live status, and the finished card opens in
 * the global `AgentCardViewerDialog` (preview, reroll, save, share).
 *
 * The saved PNG carries the agent's `buzz_agent_snapshot` chunk, so sharing
 * the card shares an importable agent (fresh identity, never secrets; memory
 * only when the owner opts in below — plaintext unless the card is locked).
 * All snapshot construction and verification happens in Rust.
 */
export function AgentCardMintDialog({
  agentId,
  agentName,
  canLock,
  onExportInstead,
  onOpenChange,
}: {
  /** Instance pubkey or definition slug — same resolution as snapshot export. */
  agentId: string;
  agentName: string;
  /**
   * True when the agent has a linked instance (a keypair to lock to).
   * Locking is disabled — with an explanation — for bare definitions.
   */
  canLock: boolean;
  /**
   * Free alternative: close this dialog and open the ordinary snapshot
   * export flow (no API spend). Omitted = the action is not rendered.
   */
  onExportInstead?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n } = useLingui();
  void i18n;
  const [styleNotes, setStyleNotes] = React.useState("");
  const [lockCard, setLockCard] = React.useState(false);
  const [memoryLevel, setMemoryLevel] =
    React.useState<SnapshotMemoryLevel>("none");
  const [keyDraft, setKeyDraft] = React.useState("");
  const [editingKey, setEditingKey] = React.useState(false);

  const queryClient = useQueryClient();

  const effectiveLock = canLock && lockCard;
  // Embedded memory is plaintext in an unlocked card — and unlocked cards
  // are meant to be shared. A locked card encrypts the whole manifest to the
  // (owner, agent) pair, so the plaintext warning would be false there.
  const showMemoryWarning = memoryLevel !== "none" && !effectiveLock;

  // Whether a key already resolves through the agent's env layering, and from
  // which layer. While unknown (loading/error) we treat as if no verified key
  // exists — mint still works fail-open, but we don't assert a key is present.
  const keyStatusQuery = useQuery({
    queryKey: ["cardMintKeyStatus", agentId],
    queryFn: () => cardMintKeyStatus(agentId),
  });
  const keyLayer: CardMintKeyLayer | undefined = keyStatusQuery.data;
  // True when the key resolves from a layer this dialog cannot update.
  const keyIsReadOnly = isReadOnlyLayer(keyLayer);

  // Save the pasted key into the global Agent Defaults env — the same single
  // source of truth every agent inherits. Narrow Rust seam: validated
  // single-key merge, never restarts running agents (the mint re-reads
  // config per call, so no restart is needed for minting).
  const saveKeyMutation = useMutation({
    mutationFn: (key: string) => cardMintSaveOpenaiKey(key),
    onSuccess: () => {
      // The key now lives in global defaults — update the cached layer so the
      // status row shows correctly without waiting for a refetch.
      queryClient.setQueryData<CardMintKeyLayer>(
        ["cardMintKeyStatus", agentId],
        "global",
      );
      // The Agent Defaults editor caches the whole config — refetch it so a
      // later-opened settings view shows the key we just wrote.
      void queryClient.invalidateQueries({
        queryKey: globalAgentConfigQueryKey,
      });
      setKeyDraft("");
      setEditingKey(false);
      toast.success(
        "API key saved to your agent defaults. Running agents pick it up on their next restart.",
      );
    },
    onError: (error) =>
      toast.error(
        typeof error === "string" ? error : t`Couldn't save the key.`,
      ),
  });

  function beginMint() {
    // Dispatch to the background store and close: the composer rail shows
    // "Minting card…" and the completion toast opens the viewer.
    startCardMint({
      agentId,
      agentName,
      styleNotes: styleNotes.trim() || undefined,
      lock: effectiveLock,
      memoryLevel: canLock ? memoryLevel : "none",
    });
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-w-md" data-testid="agent-card-mint-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {t`Create ${agentName}'s card`}
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Mint a collectible trading card that doubles as a shareable,
              importable copy of this agent.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        {showKeyPanel(keyLayer, editingKey) ? (
          <div
            className="flex flex-col gap-4"
            data-testid="agent-card-key-setup"
          >
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <KeyRound className="h-3.5 w-3.5" />
                {keyPanelTitle(keyLayer, editingKey)}
              </span>
              {keyIsReadOnly ? (
                // Key resolves from a layer the dialog cannot write to — show
                // a read-only redirect instead of an input that would be
                // shadowed by the higher-priority layer.
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="agent-card-key-readonly"
                >
                  {keyLayer === "agent"
                    ? t`This agent's OpenAI key is set in its own agent settings — update it there.`
                    : keyLayer === "persona"
                      ? t`This agent's OpenAI key comes from its linked persona settings — update it there.`
                      : t`This agent's OpenAI key is set in the process environment — update it in your shell or launch config.`}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    <Trans>
                      Minting a card costs money — it generates the art and card
                      text through the OpenAI API with your key (typically well
                      under a dollar per mint, billed by OpenAI). The key is
                      saved as
                    </Trans>{" "}
                    <code className="font-mono">
                      <Trans>OPENAI_API_KEY</Trans>
                    </code>{" "}
                    <Trans>
                      in your agent defaults env — that's the row to update in
                      Settings if you ever need to change it there.
                    </Trans>
                  </p>
                  <Button
                    className="w-fit px-0 text-xs"
                    data-testid="agent-card-key-link"
                    onClick={() =>
                      void openUrl(OPENAI_KEYS_URL).catch(() => {
                        toast.error(t`Failed to open link`);
                      })
                    }
                    size="sm"
                    variant="link"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    <Trans>Get a key at platform.openai.com</Trans>
                  </Button>
                  <Input
                    autoFocus
                    data-testid="agent-card-key-input"
                    disabled={saveKeyMutation.isPending}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder={t`sk-…`}
                    type="password"
                    value={keyDraft}
                  />
                </>
              )}
            </div>
            <FreeSharePathRow
              disabled={saveKeyMutation.isPending}
              onExportInstead={onExportInstead}
            />
            <div className="flex justify-end gap-2">
              {showCancelButton(keyLayer, editingKey) ? (
                <Button
                  data-testid="agent-card-key-cancel"
                  disabled={saveKeyMutation.isPending}
                  onClick={() => {
                    setKeyDraft("");
                    setEditingKey(false);
                  }}
                  variant="outline"
                >
                  <Trans>Cancel</Trans>
                </Button>
              ) : null}
              {!keyIsReadOnly ? (
                <Button
                  data-testid="agent-card-key-save"
                  disabled={
                    saveKeyMutation.isPending || keyDraft.trim().length === 0
                  }
                  onClick={() => saveKeyMutation.mutate(keyDraft.trim())}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {saveKeyMutation.isPending
                    ? "Saving…"
                    : "Save key & continue"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Textarea
                onChange={(e) => setStyleNotes(e.target.value)}
                placeholder={t`Optional style notes for the art and card text`}
                rows={3}
                value={styleNotes}
              />
              <p className="text-xs text-muted-foreground">
                <Trans>
                  E.g. art “stormy night, lightning motif” or ability “Verify —
                  scry 2”. Your directions take priority; anything you leave
                  open is designed for you.
                </Trans>
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Brain className="h-3.5 w-3.5" />
                  <Trans>Memories</Trans>
                </span>
                <span className="text-xs text-muted-foreground">
                  {canLock
                    ? t`Choose how much memory the embedded agent carries.`
                    : t`Including memory needs a linked agent instance — start this agent once to enable it.`}
                </span>
              </div>
              {canLock ? (
                <SnapshotOptionMenu
                  ariaLabel={t`Memories`}
                  className="font-medium text-foreground"
                  onValueChange={(value) =>
                    setMemoryLevel(value as SnapshotMemoryLevel)
                  }
                  options={MEMORY_LEVELS.map((option) => ({
                    ...option,
                    label: i18n._(option.label),
                  }))}
                  testId="agent-card-memory-trigger"
                  value={memoryLevel}
                />
              ) : (
                <span
                  className="inline-flex h-8 w-auto shrink-0 items-center justify-end px-2 text-sm font-medium"
                  data-testid="agent-card-memory-value"
                >
                  <Trans>Agent only</Trans>
                </span>
              )}
            </div>
            {showMemoryWarning ? (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
                data-testid="agent-card-memory-warning"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <Trans>Memory is stored as</Trans>{" "}
                  <strong>
                    <Trans>plaintext</Trans>
                  </strong>{" "}
                  <Trans>
                    in the card, readable by anyone who has the PNG — and cards
                    are made for sharing. Lock the card or only share it with
                    people you trust.
                  </Trans>
                </p>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5" />
                  <Trans>Lock card</Trans>
                </span>
                <span className="text-xs text-muted-foreground">
                  {canLock
                    ? t`Encrypt the embedded agent so only you and this agent can import it. Anyone else sees just the image.`
                    : t`Locking needs a linked agent instance — start this agent once to enable it.`}
                </span>
              </div>
              <Switch
                checked={canLock && lockCard}
                data-testid="agent-card-lock-toggle"
                disabled={!canLock}
                onCheckedChange={setLockCard}
              />
            </div>
            {showKeyStatusRow(keyLayer, editingKey) ? (
              <div
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="agent-card-key-status"
              >
                <KeyRound className="h-3 w-3 shrink-0" />
                <span>
                  <Trans>Using your saved OpenAI key</Trans>
                </span>
                <span aria-hidden>·</span>
                <Button
                  className="h-auto p-0 text-xs"
                  data-testid="agent-card-update-key"
                  onClick={() => setEditingKey(true)}
                  size="sm"
                  variant="link"
                >
                  <Trans>Update</Trans>
                </Button>
              </div>
            ) : null}
            {showReadOnlyRow(keyLayer, editingKey) ? (
              <div
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="agent-card-key-readonly-row"
              >
                <KeyRound className="h-3 w-3 shrink-0" />
                <span>
                  {keyLayer === "agent"
                    ? t`OpenAI key from agent settings`
                    : keyLayer === "persona"
                      ? t`OpenAI key from persona settings`
                      : t`OpenAI key from environment`}
                </span>
                <span aria-hidden>·</span>
                <Button
                  className="h-auto p-0 text-xs"
                  data-testid="agent-card-key-why"
                  onClick={() => setEditingKey(true)}
                  size="sm"
                  variant="link"
                >
                  <Trans>Why?</Trans>
                </Button>
              </div>
            ) : null}
            <p
              className="text-xs text-muted-foreground"
              data-testid="agent-card-cost-note"
            >
              <Trans>
                Minting calls the OpenAI API with your key and costs money —
                typically well under a dollar per mint, billed by OpenAI. It
                runs in the background (takes a few minutes); you can keep using
              </Trans>{" "}
              {BRAND.productName} <Trans>while it works.</Trans>
            </p>
            <FreeSharePathRow
              disabled={false}
              onExportInstead={onExportInstead}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                className="px-0 text-xs"
                data-testid="agent-card-open-gallery"
                onClick={() => {
                  onOpenChange(false);
                  setCardGalleryOpen(true);
                }}
                size="sm"
                variant="link"
              >
                <GalleryVerticalEnd className="mr-1 h-3 w-3" />
                <Trans>View minted cards</Trans>
              </Button>
              <Button onClick={beginMint} data-testid="agent-card-mint">
                <Sparkles className="mr-2 h-4 w-4" />
                <Trans>Mint card</Trans>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
