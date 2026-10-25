import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Run both desktop unit-test phases and fail at the end if either failed.
 *
 * The two phases exist because they need different globals: the first runs in
 * plain Node, the second under a jsdom setup. They used to be joined with
 * `&&`, which meant a single failure in phase one hid *every* result from phase
 * two — including whether phase two passed at all. A pre-existing,
 * order-dependent failure in phase one was enough to make the jsdom suite
 * silently never run, so "the suite fails" and "161 jsdom tests are
 * unverified" looked like the same report.
 *
 * Both phases always run. The exit code is the first non-zero one, and the
 * summary names every phase that failed.
 */

/** Node's own `--test` glob handling is used, so patterns stay quoted here. */
export const PHASES = [
  {
    name: "node",
    args: [
      "--import",
      "./test-loader.mjs",
      "--experimental-strip-types",
      "--test",
      "src/**/*.test.mjs",
      "scripts/*.test.mjs",
    ],
  },
  {
    name: "jsdom",
    args: [
      "--import",
      "./test-jsdom-setup.mjs",
      "--import",
      "./test-loader.mjs",
      "--experimental-strip-types",
      "--test-force-exit",
      "--test",
      "src/**/*.jsdom-test.mjs",
    ],
  },
];

/**
 * Exit code for a completed run: the first non-zero phase code, else 0.
 *
 * Exported and pure so the "a failing first phase must not hide the second"
 * contract is testable without spawning two real suites.
 */
export function summarizeExitCode(results) {
  const failed = results.filter((result) => result.code !== 0);
  return failed.length === 0 ? 0 : failed[0].code;
}

/** One-line summary naming each phase and its outcome. */
export function summarizeOutcome(results) {
  const failed = results.filter((result) => result.code !== 0);
  const detail = results
    .map(
      (result) =>
        `${result.name}=${result.code === 0 ? "pass" : `exit ${result.code}`}`,
    )
    .join(", ");
  return failed.length === 0
    ? `desktop tests: all phases passed (${detail})`
    : `desktop tests: ${failed.map((r) => r.name).join(", ")} failed (${detail})`;
}

function runPhase(phase) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, phase.args, {
      stdio: "inherit",
      // Node resolves the `src/**` patterns itself; `shell: false` keeps the
      // globs from being expanded by a shell that might not match them.
      shell: false,
    });
    child.on("error", () => resolve({ name: phase.name, code: 1 }));
    child.on("close", (code, signal) =>
      // A signalled child reports code `null`; treat that as a failure rather
      // than letting `null !== 0` decide it by coincidence.
      resolve({ name: phase.name, code: code ?? (signal ? 1 : 1) }),
    );
  });
}

async function main() {
  const results = [];
  for (const phase of PHASES) {
    console.log(`\n── desktop tests: ${phase.name} phase ──`);
    results.push(await runPhase(phase));
  }
  console.log(`\n${summarizeOutcome(results)}`);
  process.exit(summarizeExitCode(results));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
