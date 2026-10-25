import { strict as assert } from "node:assert";
import test from "node:test";

import {
  CHANNEL_LOGO_PAGE_LIMIT,
  CHANNEL_LOGO_TAG,
  parseChannelLogoUrl,
  resolveChannelLogoSrc,
  selectChannelLogoUrl,
} from "./channelLogo.ts";

const LOGO =
  "https://zeniad.communities.buzz.xyz/media/" + "a".repeat(64) + ".png";
const OLDER_LOGO =
  "https://zeniad.communities.buzz.xyz/media/" + "b".repeat(64) + ".png";

function metadataEvent({ id = "e".repeat(64), createdAt = 1000, tags = [] }) {
  return {
    id,
    pubkey: "f".repeat(64),
    created_at: createdAt,
    kind: 9002,
    tags: [["h", "channel-id"], ...tags],
    content: "",
    sig: "0".repeat(128),
  };
}

test("accepts absolute http and https URLs", () => {
  assert.equal(parseChannelLogoUrl(LOGO), LOGO);
  assert.equal(
    parseChannelLogoUrl("http://127.0.0.1:1234/media/logo.png"),
    "http://127.0.0.1:1234/media/logo.png",
  );
});

test("trims surrounding whitespace before parsing", () => {
  assert.equal(parseChannelLogoUrl(`  ${LOGO}\n`), LOGO);
});

test("rejects every value that is not an http(s) URL", () => {
  // Empty string is the removal sentinel, so it must not resolve to a URL.
  assert.equal(parseChannelLogoUrl(""), null);
  assert.equal(parseChannelLogoUrl("   "), null);
  assert.equal(parseChannelLogoUrl(null), null);
  assert.equal(parseChannelLogoUrl(undefined), null);
  assert.equal(parseChannelLogoUrl("/media/logo.png"), null);
  assert.equal(parseChannelLogoUrl("media/logo.png"), null);
  assert.equal(
    parseChannelLogoUrl("zeniad.communities.buzz.xyz/logo.png"),
    null,
  );
  assert.equal(parseChannelLogoUrl("javascript:alert(1)"), null);
  assert.equal(parseChannelLogoUrl("data:image/png;base64,iVBORw0KGgo="), null);
  assert.equal(parseChannelLogoUrl("file:///etc/passwd"), null);
  assert.equal(
    parseChannelLogoUrl("buzz-media://localhost/media/logo.png"),
    null,
  );
});

test("no metadata events means no logo", () => {
  assert.equal(selectChannelLogoUrl([]), null);
});

test("metadata edits that carry no picture tag leave the logo unset", () => {
  const events = [
    metadataEvent({
      id: "1".repeat(64),
      createdAt: 10,
      tags: [["name", "clients"]],
    }),
    metadataEvent({
      id: "2".repeat(64),
      createdAt: 20,
      tags: [["topic", "Q4"]],
    }),
  ];
  assert.equal(selectChannelLogoUrl(events), null);
});

test("the newest picture wins regardless of the order rows arrive in", () => {
  const events = [
    metadataEvent({
      id: "1".repeat(64),
      createdAt: 10,
      tags: [
        ["name", "clients"],
        [CHANNEL_LOGO_TAG, OLDER_LOGO],
      ],
    }),
    metadataEvent({
      id: "2".repeat(64),
      createdAt: 30,
      tags: [
        ["name", "clients"],
        [CHANNEL_LOGO_TAG, LOGO],
      ],
    }),
    metadataEvent({
      id: "3".repeat(64),
      createdAt: 20,
      tags: [["topic", "Q4"]],
    }),
  ];

  assert.equal(selectChannelLogoUrl(events), LOGO);
  assert.equal(selectChannelLogoUrl([...events].reverse()), LOGO);
});

test("an empty picture tag removes the logo instead of resurrecting the old one", () => {
  // The regression this guards: a removal is not a *valid* URL, so a selector
  // that searched for the newest valid picture would walk back to the older
  // event and the logo would reappear after being removed.
  const events = [
    metadataEvent({
      id: "1".repeat(64),
      createdAt: 10,
      tags: [
        ["name", "clients"],
        [CHANNEL_LOGO_TAG, OLDER_LOGO],
      ],
    }),
    metadataEvent({
      id: "2".repeat(64),
      createdAt: 30,
      tags: [
        ["name", "clients"],
        [CHANNEL_LOGO_TAG, ""],
      ],
    }),
  ];

  assert.equal(selectChannelLogoUrl(events), null);
});

test("a malformed newest picture also wins, and resolves to no logo", () => {
  const events = [
    metadataEvent({
      id: "1".repeat(64),
      createdAt: 10,
      tags: [[CHANNEL_LOGO_TAG, OLDER_LOGO]],
    }),
    metadataEvent({
      id: "2".repeat(64),
      createdAt: 30,
      tags: [[CHANNEL_LOGO_TAG, "javascript:alert(1)"]],
    }),
  ];

  assert.equal(selectChannelLogoUrl(events), null);
});

test("same-second writes resolve deterministically by event id", () => {
  const lower = metadataEvent({
    id: "1".repeat(64),
    createdAt: 30,
    tags: [[CHANNEL_LOGO_TAG, OLDER_LOGO]],
  });
  const higher = metadataEvent({
    id: "9".repeat(64),
    createdAt: 30,
    tags: [[CHANNEL_LOGO_TAG, LOGO]],
  });

  assert.equal(selectChannelLogoUrl([lower, higher]), LOGO);
  assert.equal(selectChannelLogoUrl([higher, lower]), LOGO);
});

test("a repeated picture tag inside one event takes its last value", () => {
  const event = metadataEvent({
    createdAt: 30,
    tags: [
      [CHANNEL_LOGO_TAG, OLDER_LOGO],
      [CHANNEL_LOGO_TAG, LOGO],
    ],
  });

  assert.equal(selectChannelLogoUrl([event]), LOGO);
});

test("a picture tag with no value is treated as a removal, not as absent", () => {
  const events = [
    metadataEvent({
      id: "1".repeat(64),
      createdAt: 10,
      tags: [[CHANNEL_LOGO_TAG, LOGO]],
    }),
    // `["picture"]` with no second element — a malformed write, but it still
    // carries the tag, so it is the newest write and it wins.
    metadataEvent({
      id: "2".repeat(64),
      createdAt: 30,
      tags: [[CHANNEL_LOGO_TAG]],
    }),
  ];

  assert.equal(selectChannelLogoUrl(events), null);
});

test("the page limit stays bounded", () => {
  assert.ok(Number.isInteger(CHANNEL_LOGO_PAGE_LIMIT));
  assert.ok(CHANNEL_LOGO_PAGE_LIMIT > 0);
  // The signed POST /query path honours up to 1000 rows; staying under it keeps
  // one channel's logo read from monopolising a relay read deadline.
  assert.ok(CHANNEL_LOGO_PAGE_LIMIT <= 1000);
});

test("the glyph falls back when there is no logo", () => {
  assert.equal(resolveChannelLogoSrc(null, null), null);
  assert.equal(resolveChannelLogoSrc(undefined, null), null);
  assert.equal(resolveChannelLogoSrc("", null), null);
});

test("the glyph renders a logo that has not failed", () => {
  assert.equal(resolveChannelLogoSrc(LOGO, null), LOGO);
  assert.equal(resolveChannelLogoSrc(LOGO, OLDER_LOGO), LOGO);
});

test("the glyph falls back to its icon when the logo image fails to load", () => {
  assert.equal(resolveChannelLogoSrc(LOGO, LOGO), null);
});

test("a replacement logo is not fenced out by the previous one's failure", () => {
  // The regression this guards: holding a boolean "logo failed" instead of the
  // failed URL would leave the channel on its icon forever, even after an admin
  // uploaded a working replacement.
  assert.equal(resolveChannelLogoSrc(OLDER_LOGO, LOGO), OLDER_LOGO);
});
