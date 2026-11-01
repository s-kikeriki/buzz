/**
 * Curated one-line descriptions for harness catalog entries.
 *
 * Content policy (agreed in the BYOH UX thread): exactly ONE neutral,
 * vendor-sourced category sentence per entry — what kind of tool it is —
 * with provenance cited inline. No feature inventories, no marketing
 * superlatives, no volatile model/provider claims. Operational setup copy
 * (status, hints) stays generated from runtime state, never hand-authored
 * here. Research: ~/.buzz/RESEARCH/BYOH_CATALOG_IA.md.
 *
 * Every entry but the first is vendor-sourced and stays literal — those are
 * other people's names. The first one is ours, and names this app, so it
 * follows `BRAND.productName` the way its label and icon do. Two vendor
 * sentences (cursor, grok) described the connection as reaching "Buzz"; that
 * is our half of the sentence, not the vendor's, so it follows the product
 * name too.
 *
 * The values are descriptors: this is a module-level table, so a resolved
 * string here would freeze in whichever locale booted.
 */
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

const HARNESS_DESCRIPTIONS: Record<string, MessageDescriptor> = {
  // Built-in runtimes.
  "buzz-agent": msg`${productName}'s built-in agent runtime, bundled with the app.`,
  // Source: https://code.claude.com/docs/en/overview — "Claude Code is an
  // agentic coding tool" that lives in the terminal.
  claude: msg`Anthropic's agentic coding tool that runs in the terminal.`,
  // Source: https://developers.openai.com/codex — "Codex is OpenAI's coding
  // agent".
  codex: msg`OpenAI's coding agent, connected through the codex-acp adapter.`,
  // Source: https://block.github.io/goose/ — "an open source, extensible AI
  // agent".
  goose: msg`Block's open-source, extensible AI agent.`,

  // Bundled presets — sources per RESEARCH/BYOH_CATALOG_IA.md.
  // Source: https://cursor.com/docs/cli/acp
  cursor: msg`Cursor's coding agent, connected to ${productName} through its ACP server.`,
  // Source: https://github.com/can1357/oh-my-pi
  omp: msg`A terminal coding agent with integrated development tools.`,
  // Sources: https://pi.dev/docs/latest, https://github.com/salman1993/pi-acp
  pi: msg`A minimal terminal coding harness, connected through the buzz-pi-acp adapter.`,
  // Source: https://build.x.ai (docs unavailable during research; kept
  // deliberately conservative).
  grok: msg`xAI's coding agent, connected to ${productName} through its ACP entrypoint.`,
  // Source: https://github.com/anomalyco/opencode
  opencode: msg`An open-source coding agent.`,
  // Sources: https://github.com/MoonshotAI/kimi-cli,
  // https://moonshotai.github.io/kimi-cli/en/
  kimi: msg`A terminal coding agent for software development and command-line tasks.`,
  // Sources: https://ampcode.com, https://ampcode.com/manual
  amp: msg`The coding agent and development environment that runs anywhere and everywhere.`,
  // Sources: https://github.com/NousResearch/hermes-agent,
  // https://hermes-agent.nousresearch.com/docs/
  hermes: msg`A general-purpose AI agent from Nous Research.`,
  // Sources: https://github.com/openclaw/openclaw,
  // https://docs.openclaw.ai/start/getting-started
  openclaw: msg`A personal AI assistant that runs on your own devices.`,
};

/**
 * One neutral sentence describing the harness, or null for entries we don't
 * curate (customs, unknown ids). Callers must render nothing rather than
 * invent copy.
 */
export function harnessDescription(id: string): MessageDescriptor | null {
  return HARNESS_DESCRIPTIONS[id.trim().toLowerCase()] ?? null;
}
