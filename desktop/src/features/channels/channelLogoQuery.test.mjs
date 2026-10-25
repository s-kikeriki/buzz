import { strict as assert } from "node:assert";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import { CHANNEL_LOGO_PAGE_LIMIT } from "./lib/channelLogo.ts";
import {
  applyLocalChannelLogo,
  channelLogoFilter,
  channelLogoLiveFilter,
  channelLogoQueryKey,
  channelLogoQueryOptions,
  fetchChannelLogoUrl,
  invalidateChannelLogo,
} from "./channelLogoQuery.ts";

const CLIENT_A = "11111111-1111-1111-1111-111111111111";
const CLIENT_B = "22222222-2222-2222-2222-222222222222";
const LOGO_A = `https://zeniad.communities.buzz.xyz/media/${"a".repeat(64)}.png`;
const LOGO_B = `https://zeniad.communities.buzz.xyz/media/${"b".repeat(64)}.png`;

function logoEvent(channelId, url, createdAt = 100) {
  return {
    id: "e".repeat(64),
    pubkey: "f".repeat(64),
    created_at: createdAt,
    kind: 9002,
    tags: [
      ["h", channelId],
      ["name", "clients"],
      ["picture", url],
    ],
    content: "",
    sig: "0".repeat(128),
  };
}

/** Records every filter it is asked for, answering from a per-channel map. */
function recordingFetcher(logosByChannel) {
  const calls = [];
  return {
    calls,
    fetchEvents: async (filter) => {
      calls.push(filter);
      const channelId = filter["#h"]?.[0];
      const url = logosByChannel.get(channelId);
      return url === undefined ? [] : [logoEvent(channelId, url)];
    },
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

test("the read filter is a bounded page of metadata edits for one channel", () => {
  assert.deepEqual(channelLogoFilter(CLIENT_A), {
    kinds: [9002],
    "#h": [CLIENT_A],
    limit: CHANNEL_LOGO_PAGE_LIMIT,
  });
});

test("the live filter covers every rendered channel and starts from now", () => {
  assert.deepEqual(channelLogoLiveFilter([CLIENT_A, CLIENT_B], 1_700_000_000), {
    kinds: [9002],
    "#h": [CLIENT_A, CLIENT_B],
    limit: CHANNEL_LOGO_PAGE_LIMIT,
    since: 1_700_000_000,
  });
});

test("a channel with no logo resolves to null", async () => {
  const { fetchEvents } = recordingFetcher(new Map());
  assert.equal(await fetchChannelLogoUrl(CLIENT_A, fetchEvents), null);
});

test("one relay read serves every call site for the same channel", async () => {
  const client = newClient();
  const { calls, fetchEvents } = recordingFetcher(
    new Map([[CLIENT_A, LOGO_A]]),
  );
  const options = channelLogoQueryOptions(CLIENT_A, fetchEvents);

  // Sidebar row, channel header, settings sheet — three asks, one read.
  const [first, second, third] = await Promise.all([
    client.fetchQuery(options),
    client.fetchQuery(options),
    client.fetchQuery(options),
  ]);

  assert.equal(first, LOGO_A);
  assert.equal(second, LOGO_A);
  assert.equal(third, LOGO_A);
  assert.equal(calls.length, 1);
});

test("cached channels are read once each, not once per channel per render", async () => {
  const client = newClient();
  const { calls, fetchEvents } = recordingFetcher(
    new Map([
      [CLIENT_A, LOGO_A],
      [CLIENT_B, LOGO_B],
    ]),
  );

  await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents));
  await client.fetchQuery(channelLogoQueryOptions(CLIENT_B, fetchEvents));
  await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents));
  await client.fetchQuery(channelLogoQueryOptions(CLIENT_B, fetchEvents));

  assert.equal(calls.length, 2);
  assert.equal(client.getQueryData(channelLogoQueryKey(CLIENT_A)), LOGO_A);
  assert.equal(client.getQueryData(channelLogoQueryKey(CLIENT_B)), LOGO_B);
});

test("invalidating one channel's logo leaves every other channel cached", async () => {
  const client = newClient();
  const logos = new Map([
    [CLIENT_A, LOGO_A],
    [CLIENT_B, LOGO_B],
  ]);
  const { calls, fetchEvents } = recordingFetcher(logos);

  await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents));
  await client.fetchQuery(channelLogoQueryOptions(CLIENT_B, fetchEvents));
  assert.equal(calls.length, 2);

  // A metadata edit lands for A only.
  logos.set(CLIENT_A, LOGO_B);
  await invalidateChannelLogo(client, CLIENT_A);

  assert.equal(
    await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents)),
    LOGO_B,
  );
  assert.equal(
    await client.fetchQuery(channelLogoQueryOptions(CLIENT_B, fetchEvents)),
    LOGO_B,
  );

  // Three reads total: A re-read, B still served from cache. The regression
  // this guards is invalidating the shared `["channels"]` prefix, which would
  // re-run a bounded page for every channel in the sidebar.
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2]["#h"], [CLIENT_A]);
});

test("a logo removal invalidates to null rather than keeping the old URL", async () => {
  const client = newClient();
  const logos = new Map([[CLIENT_A, LOGO_A]]);
  const { fetchEvents } = recordingFetcher(logos);

  assert.equal(
    await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents)),
    LOGO_A,
  );

  logos.delete(CLIENT_A);
  await invalidateChannelLogo(client, CLIENT_A);

  assert.equal(
    await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents)),
    null,
  );
});

test("a local write shows immediately and still re-reads from the relay", async () => {
  const client = newClient();
  const logos = new Map([[CLIENT_A, LOGO_A]]);
  const { calls, fetchEvents } = recordingFetcher(logos);

  await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents));
  const readsAfterFirstFetch = calls.length;

  logos.set(CLIENT_A, LOGO_B);
  const apply = applyLocalChannelLogo(client, CLIENT_A, LOGO_B);
  // Written synchronously, before the invalidation settles: the glyph must not
  // wait for a relay round trip to show the logo its own user just set.
  assert.equal(client.getQueryData(channelLogoQueryKey(CLIENT_A)), LOGO_B);
  await apply;

  assert.equal(
    await client.fetchQuery(channelLogoQueryOptions(CLIENT_A, fetchEvents)),
    LOGO_B,
  );
  assert.ok(calls.length > readsAfterFirstFetch);
});

test("a channel id that is absent never issues a relay read", async () => {
  const calls = [];
  const fetchEvents = async (filter) => {
    calls.push(filter);
    return [];
  };
  for (const absent of [null, undefined, ""]) {
    const options = channelLogoQueryOptions(absent, fetchEvents);
    assert.equal(options.enabled, false);
    // `enabled` is honoured by useQuery but ignored by fetchQuery, so the
    // query function itself has to refuse rather than query channel "none".
    await assert.rejects(
      async () => await options.queryFn(),
      /No channel selected/,
    );
  }
  assert.equal(calls.length, 0);
});
