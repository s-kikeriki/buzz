import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalOrigin,
  isLegacyOriginForCurrentRelay,
  isOwnedMediaOrigin,
} from "./legacyRelayOrigins.ts";

const CURRENT = "https://relay.ki.keriki.de";
const LEGACY = "https://kikeriki.communities.buzz.xyz";
const HASH = "a".repeat(64);

test("the shared table carries the kikeriki migration", () => {
  // Same assertion as the Rust side's `shared_table_parses_and_carries_the_
  // kikeriki_migration`. Both read desktop/legacy-relay-origins.json, so a
  // migration added for one half is a migration both halves have.
  assert.equal(isLegacyOriginForCurrentRelay(LEGACY, CURRENT), true);
});

test("a predecessor belongs only to the relay that moved off it", () => {
  assert.equal(
    isLegacyOriginForCurrentRelay(
      LEGACY,
      "https://zeniad.communities.buzz.xyz",
    ),
    false,
  );
});

test("isOwnedMediaOrigin: the current relay and its predecessors, nothing else", () => {
  assert.equal(
    isOwnedMediaOrigin(`${CURRENT}/media/${HASH}.pdf`, CURRENT),
    true,
  );
  assert.equal(
    isOwnedMediaOrigin(`${LEGACY}/media/${HASH}.pdf`, CURRENT),
    true,
  );
  assert.equal(
    isOwnedMediaOrigin(`https://nostr.build/media/${HASH}.pdf`, CURRENT),
    false,
  );
});

test("isOwnedMediaOrigin: ownership ignores the path, so documents are not special", () => {
  // The path check belongs to the caller (and to the Rust gate). Keeping this
  // predicate about origins alone is what lets a document, an archive and an
  // image all get the same answer.
  assert.equal(isOwnedMediaOrigin(`${LEGACY}/anything`, CURRENT), true);
});

test("isOwnedMediaOrigin: host casing does not change the answer", () => {
  // DNS is case-insensitive, so a relay URL typed with capitals connects fine
  // while a raw string compare would call the relay's own media external.
  assert.equal(
    isOwnedMediaOrigin(
      `${LEGACY}/media/${HASH}.pdf`,
      "https://RELAY.KI.KERIKI.de",
    ),
    true,
  );
});

test("isOwnedMediaOrigin: a relay URL with a path still matches by origin", () => {
  assert.equal(
    isOwnedMediaOrigin(`${LEGACY}/media/${HASH}.pdf`, `${CURRENT}/`),
    true,
  );
});

test("isOwnedMediaOrigin: fails closed on an unresolved or unparseable origin", () => {
  const url = `${LEGACY}/media/${HASH}.pdf`;
  assert.equal(isOwnedMediaOrigin(url, null), false);
  assert.equal(isOwnedMediaOrigin(url, undefined), false);
  assert.equal(isOwnedMediaOrigin(url, ""), false);
  assert.equal(isOwnedMediaOrigin(url, "not a url"), false);
  assert.equal(isOwnedMediaOrigin("not a url", CURRENT), false);
});

test("canonicalOrigin: lowercases and drops the path, null on garbage", () => {
  assert.equal(
    canonicalOrigin("https://EXAMPLE.test/media/x.png"),
    "https://example.test",
  );
  assert.equal(canonicalOrigin("not a url"), null);
});
