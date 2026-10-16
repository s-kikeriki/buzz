import assert from "node:assert/strict";
import test from "node:test";

import {
  pickRetiredStarterAgents,
  purgeRetiredStarterAgents,
} from "./purgeStarterAgents.ts";

function agent(name, personaId, pubkey, relayUrl = "wss://relay.test") {
  return { name, personaId, pubkey, relayUrl };
}

test("picks only bee starter instances on the applied relay", () => {
  const agents = [
    agent("Honey", "builtin:honey", "a".repeat(64)),
    agent("Pollen", "builtin:bumble", "b".repeat(64)),
    agent("Fizz", "builtin:fizz", "c".repeat(64)),
    agent("ClaudeM5", null, "d".repeat(64)),
    agent("Honey", "builtin:honey", "e".repeat(64), "wss://other.test"),
    agent("Honey definition", "builtin:honey", ""),
  ];

  const picked = pickRetiredStarterAgents(agents, "wss://relay.test/");

  assert.deepEqual(
    picked.map((a) => a.pubkey),
    ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );
});

test("deletes every picked instance through the delete command", async () => {
  const deleted = [];
  const removed = await purgeRetiredStarterAgents("wss://relay.test", {
    list: async () => [
      agent("Honey", "builtin:honey", "a".repeat(64)),
      agent("ClaudeM5", null, "d".repeat(64)),
    ],
    remove: async (pubkey) => {
      deleted.push(pubkey);
    },
  });

  assert.equal(removed, 1);
  assert.deepEqual(deleted, ["a".repeat(64)]);
});

test("one failed delete does not stop the rest", async () => {
  const deleted = [];
  const removed = await purgeRetiredStarterAgents("wss://relay.test", {
    list: async () => [
      agent("Honey", "builtin:honey", "a".repeat(64)),
      agent("Pollen", "builtin:bumble", "b".repeat(64)),
    ],
    remove: async (pubkey) => {
      if (pubkey === "a".repeat(64)) throw new Error("busy");
      deleted.push(pubkey);
    },
  });

  assert.equal(removed, 1);
  assert.deepEqual(deleted, ["b".repeat(64)]);
});

test("a failing agent list is not fatal", async () => {
  const removed = await purgeRetiredStarterAgents("wss://relay.test", {
    list: async () => {
      throw new Error("backend unavailable");
    },
    remove: async () => {
      throw new Error("must not be called");
    },
  });

  assert.equal(removed, 0);
});
