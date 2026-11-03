/**
 * kikeriki fork: whether this build provisions the bee starter team at all.
 *
 * `false` here, and it is the one switch for the whole feature — the agents
 * (Fizz, Honey, Pollen) are bee characters, and no build of ours ships a Buzz
 * bee. Re-exported by `welcomeGuide.ts`, which owns the provisioning this
 * gates; `useWelcomeKickoffStage.ts` gates the *animation* on the same value.
 *
 * It lives in its own module rather than in `welcomeGuide.ts` because the
 * stage resolver is a pure function with a pure unit test, and
 * `welcomeGuide.ts` pulls in the whole Tauri API surface (and, through it,
 * the Lingui macro) — importing it there would make the resolver's test
 * unloadable for the sake of one boolean.
 */
export const WELCOME_TEAM_ENABLED = false;
