import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { withI18n } from "@/testing/withI18n.mjs";
import { AgentActivityCard } from "./AgentActivityCard.tsx";

function render(status) {
  const pubkey = "a".repeat(64);
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The card renders a `UserAvatar`, whose `alt` now comes from
  // `useLingui()`; static markup needs the provider like any other render.
  return renderToStaticMarkup(
    withI18n(
      React.createElement(
        RouterContextProvider,
        { router },
        React.createElement(
          QueryClientProvider,
          {
            client: new QueryClient({
              defaultOptions: { queries: { enabled: false } },
            }),
          },
          React.createElement(AgentActivityCard, {
            agentStatus: status,
            profile: { displayName: "Policy-only Scout", avatarUrl: null },
            group: {
              pubkey,
              latestAt: 1700000000,
              earliestAt: 1700000000,
              notes: [
                {
                  id: "note",
                  pubkey,
                  content: "Still discoverable",
                  createdAt: 1700000000,
                },
              ],
            },
          }),
        ),
      ),
    ),
  );
}

test("Pulse does not render unknown policy-only discovery as an offline dot", () => {
  const html = render("unknown");
  assert.match(html, /Policy-only Scout/);
  assert.match(html, /Still discoverable/);
  // Bind the locale-independent attribute, not the aria-label: that label is
  // now translated, so a German build would pass this assertion for the wrong
  // reason — there would simply be no English string to match.
  assert.doesNotMatch(html, /data-agent-status=/);
  assert.doesNotMatch(html, /bg-zinc-400/);
});

for (const status of ["online", "away", "offline"]) {
  test(`Pulse retains explicit ${status} liveness evidence`, () => {
    const html = render(status);
    assert.match(html, new RegExp(`data-agent-status="${status}"`));
    // The screen-reader label still has to say something, in whatever locale
    // the catalogue is activated in — an empty aria-label is its own defect.
    const label = html.match(/aria-label="([^"]*)"[^>]*data-agent-status=/);
    assert.ok(label, `no aria-label on the ${status} dot`);
    assert.ok(label[1].length > 0, `empty aria-label on the ${status} dot`);
  });
}
