import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render tests for AgentSnapshotImportDialog preview and result bodies.
// The bodies call useLingui(), so they go through the provider rather than
// being invoked as plain functions.

import { withI18n } from "@/testing/withI18n.mjs";
import { PreviewBody, ResultBody } from "./AgentSnapshotImportDialog.tsx";

function renderBody(type, props) {
  return renderToStaticMarkup(withI18n(createElement(type, props)));
}

function makeResult(overrides = {}) {
  return {
    displayName: "TestBot",
    newPubkey: "abc123",
    personaId: "persona-1",
    memoryWritten: 0,
    memoryTotal: 2,
    memoryErrors: [],
    profileSyncError: null,
    ...overrides,
  };
}

function makePreview(overrides = {}) {
  return {
    displayName: "TestBot",
    systemPrompt: "Inspect every boundary before changing code.",
    avatarUrl: null,
    memoryLevel: "none",
    memoryEntryCount: 0,
    hasSourceAllowlist: true,
    sourceAllowlistCount: 2,
    sourceAllowlist: ["a".repeat(64), "b".repeat(64)],
    manifestJson: '{\n  "format": "buzz-agent-snapshot"\n}',
    locked: false,
    ...overrides,
  };
}

// ── preview transparency ──────────────────────────────────────────────────────

test("preview_body_discloses_prompt_allowlist_and_full_manifest", () => {
  const preview = makePreview();
  const html = renderBody(PreviewBody, {
    preview,
    hasMemory: false,
    memoryLevelLabel: "none",
    keepAllowlist: false,
    onKeepAllowlistChange: () => {},
  });

  assert.ok(html.includes(preview.systemPrompt));
  for (const pubkey of preview.sourceAllowlist) {
    assert.ok(html.includes(pubkey), `missing allowlist pubkey ${pubkey}`);
  }
  assert.ok(html.includes("buzz-agent-snapshot"));
  assert.equal(
    html.split('data-testid="agent-snapshot-import-manifest"').length,
    2,
  );
});

// ── locked-card provenance notice ─────────────────────────────────────────────

test("preview_body_shows_locked_notice_only_for_locked_cards", () => {
  const notice = (locked) =>
    renderBody(PreviewBody, {
      preview: makePreview({ locked }),
      hasMemory: false,
      memoryLevelLabel: "none",
      keepAllowlist: false,
      onKeepAllowlistChange: () => {},
    }).includes('data-testid="agent-snapshot-import-locked-notice"');

  assert.equal(notice(true), true);
  assert.equal(notice(false), false);
});

// ── memory errors detail list ─────────────────────────────────────────────────

test("result_body_renders_memory_errors_list_with_test_id", () => {
  const errors = [
    'slug "mem/notes": relay timeout',
    'slug "core": build failed: key mismatch',
  ];
  const result = makeResult({
    memoryWritten: 0,
    memoryTotal: 2,
    memoryErrors: errors,
  });

  const html = renderBody(ResultBody, { result, confirmError: null });

  const marker = 'data-testid="agent-snapshot-import-memory-errors"';
  assert.equal(html.split(marker).length, 2, "exactly one memory-errors list");
  const listHtml = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
  assert.match(listHtml, /max-h-/);
  assert.match(listHtml, /overflow-y-auto/);
  assert.match(listHtml, /break-all/);
  assert.doesNotMatch(listHtml, /truncate/);
});

test("result_body_surfaces_both_error_strings_in_tree", () => {
  const errors = [
    'slug "mem/notes": relay timeout',
    'slug "core": build failed: key mismatch',
  ];
  const result = makeResult({
    memoryWritten: 0,
    memoryTotal: 2,
    memoryErrors: errors,
  });

  const html = renderBody(ResultBody, { result, confirmError: null });

  assert.ok(html.includes("mem/notes"), "first error slug must appear");
  assert.ok(
    html.includes("slug &quot;core&quot;") || html.includes('slug "core"'),
    "second error slug must appear",
  );
});

test("result_body_full_success_omits_memory_errors_list", () => {
  const result = makeResult({
    memoryWritten: 2,
    memoryTotal: 2,
    memoryErrors: [],
  });

  const html = renderBody(ResultBody, { result, confirmError: null });

  assert.equal(
    html.includes('data-testid="agent-snapshot-import-memory-errors"'),
    false,
    "full-success result must not render the memory-errors list",
  );
});
