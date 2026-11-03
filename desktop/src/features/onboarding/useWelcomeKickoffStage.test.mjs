import assert from "node:assert/strict";
import test from "node:test";

import {
  isWelcomeKickoffSettingUp,
  isWelcomeKickoffStageExiting,
  resolveWelcomeKickoffStagePhase,
} from "./useWelcomeKickoffStage.ts";
import { WELCOME_TEAM_ENABLED } from "./welcomeTeamEnabled.ts";

const base = {
  teamEnabled: true,
  isWelcome: true,
  timelineSettled: true,
  hasMessages: false,
  timedOut: false,
};

test("stage stays hidden outside the Welcome channel", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("hidden", { ...base, isWelcome: false }),
    "hidden",
  );
  assert.equal(
    resolveWelcomeKickoffStagePhase("active", { ...base, isWelcome: false }),
    "hidden",
  );
});

// The three kickoff characters are the Buzz bees, and no build of ours ships
// one. Provisioning was already off (`WELCOME_TEAM_ENABLED`) while the stage
// still animated them, so these pin the gate rather than the intent.
test("a build with no welcome team never stages its characters", () => {
  for (const phase of ["hidden", "active", "exiting", "timed-out", "done"]) {
    assert.equal(
      resolveWelcomeKickoffStagePhase(phase, {
        ...base,
        teamEnabled: false,
      }),
      "hidden",
      `${phase} must not survive into a build with no welcome team`,
    );
  }
});

test("a build with no welcome team never claims it is setting one up", () => {
  assert.equal(
    isWelcomeKickoffSettingUp(
      resolveWelcomeKickoffStagePhase("hidden", {
        ...base,
        teamEnabled: false,
      }),
    ),
    false,
  );
});

// Binds the gate to the value this fork actually ships. Flipping the constant
// back on, or dropping the `teamEnabled` check from the resolver, fails here
// rather than at a client's first launch.
test("this build ships with the bee starter team off", () => {
  assert.equal(WELCOME_TEAM_ENABLED, false);
  assert.equal(
    resolveWelcomeKickoffStagePhase("hidden", {
      ...base,
      teamEnabled: WELCOME_TEAM_ENABLED,
    }),
    "hidden",
  );
});

test("stage waits for the timeline to settle before entering", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("hidden", {
      ...base,
      timelineSettled: false,
    }),
    "hidden",
  );
  assert.equal(resolveWelcomeKickoffStagePhase("hidden", base), "active");
});

test("stage never enters when messages already exist (revisit)", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("hidden", { ...base, hasMessages: true }),
    "hidden",
  );
});

test("first message moves an active stage to exiting", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("active", { ...base, hasMessages: true }),
    "exiting",
  );
});

test("first message also dismisses a timed-out stage", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("timed-out", {
      ...base,
      hasMessages: true,
    }),
    "exiting",
  );
});

test("timeout only downgrades an active stage", () => {
  assert.equal(
    resolveWelcomeKickoffStagePhase("active", { ...base, timedOut: true }),
    "timed-out",
  );
  assert.equal(
    resolveWelcomeKickoffStagePhase("exiting", { ...base, timedOut: true }),
    "exiting",
  );
});

test("exiting is terminal until the exit animation completes", () => {
  assert.equal(resolveWelcomeKickoffStagePhase("exiting", base), "exiting");
});

// The timeout exists to stop a failed kickoff from claiming a team is coming
// forever. These pin the *consequences* of timing out, not just the state name
// — the timed-out phase previously rendered identically to `active`.
test("a timed-out stage stops claiming the team is being set up", () => {
  assert.equal(isWelcomeKickoffSettingUp("active"), true);
  assert.equal(isWelcomeKickoffSettingUp("timed-out"), false);
});

test("a timed-out stage leaves instead of standing there", () => {
  assert.equal(isWelcomeKickoffStageExiting("timed-out"), true);
  assert.equal(isWelcomeKickoffStageExiting("exiting"), true);
  assert.equal(isWelcomeKickoffStageExiting("active"), false);
});

test("the banner never claims setup once the stage has resolved", () => {
  for (const phase of ["hidden", "exiting", "timed-out", "done"]) {
    assert.equal(
      isWelcomeKickoffSettingUp(phase),
      false,
      `${phase} must not claim setup is in progress`,
    );
  }
});

// Regression: `done` must be distinct from `hidden`. If a finished stage fell
// back to `hidden`, the still-empty timeline would re-enter `active` and the
// characters would loop forever.
test("done is terminal and never replays on a still-empty timeline", () => {
  assert.equal(resolveWelcomeKickoffStagePhase("done", base), "done");
  assert.equal(
    resolveWelcomeKickoffStagePhase("done", { ...base, isWelcome: false }),
    "done",
  );
  assert.equal(
    resolveWelcomeKickoffStagePhase("done", { ...base, timedOut: true }),
    "done",
  );
});
