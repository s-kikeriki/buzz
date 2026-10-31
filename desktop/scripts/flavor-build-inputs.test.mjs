import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { flavorBuildEnv, loadFlavor } from "./flavor-config.mjs";

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function run(script, args, env = {}) {
  return execFileSync(
    process.execPath,
    [path.join("scripts", script), ...args],
    {
      cwd: desktopDir,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

function runExpectingFailure(script, args, env = {}) {
  try {
    run(script, args, env);
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.fail(`${script} ${args.join(" ")} was expected to fail`);
}

/**
 * Parse a `$GITHUB_ENV` file the way the runner does.
 *
 * Written out rather than trusted: the whole point of the heredoc form is that
 * a multi-line value survives it, and a test that only checked "the file
 * contains the value somewhere" would pass for a file the runner reads as
 * garbage.
 */
function parseGithubEnv(contents) {
  const parsed = {};
  const lines = contents.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "") continue;
    const heredoc = line.match(/^([^=<]+)<<(.+)$/);
    if (heredoc) {
      const [, key, delimiter] = heredoc;
      const body = [];
      index += 1;
      while (index < lines.length && lines[index] !== delimiter) {
        body.push(lines[index]);
        index += 1;
      }
      assert.ok(
        index < lines.length,
        `${key}: heredoc is never closed — the runner would fail the step`,
      );
      parsed[key] = body.join("\n");
      continue;
    }
    const [key, ...rest] = line.split("=");
    parsed[key] = rest.join("=");
  }
  return parsed;
}

/**
 * A disposable `$GITHUB_WORKSPACE` with a `desktop/` in it.
 *
 * `flavor-github-env.mjs` writes a real `desktop/.env.production.local`, and
 * that is a file a developer may legitimately own, so the tests send the write
 * somewhere thrown away rather than over their copy.
 */
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), "ghws-"));
  mkdirSync(path.join(root, "desktop"), { recursive: true });
  return root;
}

test("the flavor's build env reaches the build, split by who reads it", async () => {
  const root = workspace();
  const file = path.join(root, "env");
  writeFileSync(file, "");
  const output = run("flavor-github-env.mjs", ["ki.keriki"], {
    GITHUB_ENV: file,
    GITHUB_WORKSPACE: root,
  });

  const contents = readFileSync(file, "utf8");
  const parsed = parseGithubEnv(contents);
  const expected = flavorBuildEnv(loadFlavor("ki.keriki"));
  const { partitionFlavorEnv, dotenvLine, FLAVOR_DOTENV_RELATIVE } =
    await import("./flavor-github-env.mjs");
  const { github, dotenv } = partitionFlavorEnv(expected);

  assert.deepEqual(
    parsed,
    github,
    "GITHUB_ENV carries every variable with a process-environment reader, and only those",
  );
  // Named, not counted. `Object.keys(dotenv).length >= 4` would be satisfied by
  // the partition's own definition and could never fail; these four are the
  // specific variables whose bytes must stop crossing.
  assert.deepEqual(Object.keys(dotenv).sort(), [
    "VITE_BUZZ_PRODUCT_LOGO",
    "VITE_BUZZ_PRODUCT_LOGO_LIGHT",
    "VITE_BUZZ_PRODUCT_LOGO_MARK",
    "VITE_BUZZ_PRODUCT_LOGO_MARK_LIGHT",
  ]);
  assert.equal(parsed.VITE_BUZZ_PRODUCT_LOGO, undefined);

  // And the other half really arrived, in the form Vite parses.
  const dotenvFile = readFileSync(
    path.join(root, "desktop", FLAVOR_DOTENV_RELATIVE),
    "utf8",
  );
  for (const [key, value] of Object.entries(dotenv)) {
    assert.ok(
      dotenvFile.split("\n").includes(dotenvLine(key, value)),
      `${key} must be one whole line of ${FLAVOR_DOTENV_RELATIVE}`,
    );
  }

  // Assert the *form*, not just the round trip. No value the flavor emits
  // today contains a newline, so the single-line `KEY=value` form would parse
  // back identically and this test would pass for a script that silently
  // truncates the first multi-line value anyone adds. Checking that every
  // variable was written as a heredoc is the falsifiable version.
  const opened = [...contents.matchAll(/^([A-Z0-9_]+)<<(.+)$/gm)];
  assert.equal(
    opened.length,
    Object.keys(github).length,
    "every GITHUB_ENV variable must be written in heredoc form, not `KEY=value`",
  );
  // And the delimiters must differ per variable. A fixed `EOF` is guessable, so
  // a value whose own text contained that line would close the block early and
  // let its remainder be parsed as further variables.
  const delimiters = new Set(opened.map(([, , delimiter]) => delimiter));
  assert.equal(delimiters.size, opened.length, "one delimiter per variable");

  // Names in the log, values not.
  assert.match(output, /BRAND_NAME/);
  assert.match(output, /\.env\.production\.local/);
  assert.ok(
    !output.includes("relay.ki.keriki.de"),
    "the log lists variable names, not their values",
  );
  assert.ok(
    !output.includes("PHN2Zy"),
    "nor the base64 of a brand asset it moved to a file",
  );
});

test("the partition loses nothing, and only moves what Vite can read", async () => {
  const { partitionFlavorEnv, GITHUB_ENV_VALUE_LIMIT } = await import(
    "./flavor-github-env.mjs"
  );
  const big = "x".repeat(GITHUB_ENV_VALUE_LIMIT);
  const env = {
    BRAND_NAME: "ki.keriki",
    VITE_BUZZ_PRODUCT_LOGO: big,
    // The case the size-only rule gets wrong. `build.rs` and
    // `package-macos-dmg.sh` read the process environment and nothing reads a
    // dotenv on their behalf, so an oversized non-`VITE_` value routed to the
    // file would disappear from the half of the build that is Rust — with the
    // check step passing either side of it.
    BUZZ_BUILD_SOMETHING_HUGE: big,
  };
  const { github, dotenv } = partitionFlavorEnv(env);
  assert.deepEqual(Object.keys(dotenv), ["VITE_BUZZ_PRODUCT_LOGO"]);
  assert.deepEqual(Object.keys(github).sort(), [
    "BRAND_NAME",
    "BUZZ_BUILD_SOMETHING_HUGE",
  ]);
  // Exhaustive and disjoint: every key lands in exactly one half.
  assert.deepEqual(
    { ...github, ...dotenv },
    env,
    "the two halves must reassemble into the input",
  );
  assert.equal(
    Object.keys(github).length + Object.keys(dotenv).length,
    Object.keys(env).length,
  );
});

test("a flavor with no oversized value clears a dotenv left by another", async () => {
  // zeniad declares no logo. Leaving ki.keriki's file behind in the same
  // checkout would hand Vite another organisation's mark with nothing in the
  // build log to say where it came from.
  const { FLAVOR_DOTENV_RELATIVE } = await import("./flavor-github-env.mjs");
  const root = workspace();
  const file = path.join(root, "env");
  writeFileSync(file, "");
  const stale = path.join(root, "desktop", FLAVOR_DOTENV_RELATIVE);
  writeFileSync(
    stale,
    'VITE_BUZZ_PRODUCT_LOGO="data:image/svg+xml;base64,x"\n',
  );

  run("flavor-github-env.mjs", ["zeniad"], {
    GITHUB_ENV: file,
    GITHUB_WORKSPACE: root,
  });
  assert.equal(
    existsSync(stale),
    false,
    `${FLAVOR_DOTENV_RELATIVE} must be gone`,
  );
});

test("a value containing a newline still round-trips", () => {
  // Nothing emits one today. That is exactly why it is worth holding: the
  // single-line form reads correctly for every value the flavor currently has,
  // and would start truncating on the first one that does not.
  const file = path.join(mkdtempSync(path.join(tmpdir(), "ghenv-")), "env");
  const delimiter = "__delim_test";
  writeFileSync(file, `MULTI<<${delimiter}\nfirst\nsecond\n${delimiter}\n`);
  assert.deepEqual(parseGithubEnv(readFileSync(file, "utf8")), {
    MULTI: "first\nsecond",
  });
});

test("the crossing check passes what the writer wrote and fails what it does not", async () => {
  const { FLAVOR_DOTENV_RELATIVE } = await import("./flavor-github-env.mjs");
  const root = workspace();
  const file = path.join(root, "env");
  writeFileSync(file, "");
  run("flavor-github-env.mjs", ["ki.keriki"], {
    GITHUB_ENV: file,
    GITHUB_WORKSPACE: root,
  });
  // What the runner does between the two steps: turn the `$GITHUB_ENV` file
  // into the next step's environment.
  const crossed = parseGithubEnv(readFileSync(file, "utf8"));
  const dotenvPath = path.join(root, "desktop", FLAVOR_DOTENV_RELATIVE);

  const output = run("check-flavor-crossed.mjs", ["ki.keriki"], {
    ...crossed,
    GITHUB_WORKSPACE: root,
  });
  const declared = Object.keys(flavorBuildEnv(loadFlavor("ki.keriki"))).length;
  assert.match(output, new RegExp(`${declared} flavor variables checked`));
  assert.match(output, /0 wrong/);

  // One variable lost between the steps — the original defect, which read back
  // perfectly from the shell that set it.
  const { BUZZ_RELAY_URL: _dropped, ...withoutRelay } = crossed;
  assert.match(
    runExpectingFailure("check-flavor-crossed.mjs", ["ki.keriki"], {
      ...withoutRelay,
      BUZZ_RELAY_URL: "",
      GITHUB_WORKSPACE: root,
    }),
    /::error::BUZZ_RELAY_URL did not cross/,
  );

  // And the other half: the brand assets silently not reaching Vite.
  writeFileSync(
    dotenvPath,
    'VITE_BUZZ_PRODUCT_LOGO="data:image/svg+xml;base64,PHN2Zy8+"\n',
  );
  const spliced = runExpectingFailure(
    "check-flavor-crossed.mjs",
    ["ki.keriki"],
    {
      ...crossed,
      GITHUB_WORKSPACE: root,
    },
  );
  assert.match(spliced, /::error::VITE_BUZZ_PRODUCT_LOGO did not cross into/);
  assert.match(spliced, /4 wrong/);

  rmSync(dotenvPath);
  assert.match(
    runExpectingFailure("check-flavor-crossed.mjs", ["ki.keriki"], {
      ...crossed,
      GITHUB_WORKSPACE: root,
    }),
    /was not written/,
  );
});

test("flavor-github-env refuses to run outside Actions", () => {
  const output = runExpectingFailure("flavor-github-env.mjs", ["ki.keriki"], {
    GITHUB_ENV: "",
  });
  assert.match(output, /GITHUB_ENV is not set/);
});

/**
 * RFC 7396 JSON merge patch — the algorithm Tauri applies to `--config`.
 *
 * Objects merge key by key and everything else replaces, which is the whole
 * reason the delta can own `bundle` safely while `bundle.targets` would not be
 * safe to put in it. Implemented here rather than asserted on the delta's
 * shape alone because the shape is not the property that matters: what matters
 * is the config the bundler ends up reading.
 */
function mergePatch(base, patch) {
  if (
    base === null ||
    typeof base !== "object" ||
    Array.isArray(base) ||
    patch === null ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    return structuredClone(patch);
  }
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    merged[key] =
      key in merged ? mergePatch(merged[key], value) : structuredClone(value);
  }
  return merged;
}

test("the tauri delta names the app and never the bundle targets", () => {
  const out = path.join(
    mkdtempSync(path.join(tmpdir(), "flavorconf-")),
    "c.json",
  );
  run("build-flavor-tauri-config.mjs", [
    "ki.keriki",
    out,
    "--target",
    "x86_64-unknown-linux-gnu",
  ]);
  const config = JSON.parse(readFileSync(out, "utf8"));

  // Asserted before the shape, because this is the specific trap and an
  // exhaustive deepEqual would otherwise fail first with a generic diff — the
  // break test for it reported an "unexplained failure" rather than the rule.
  //
  // `demoBuildConfig`'s own overlay pins `bundle.targets` to `["app"]`, which
  // is right for the macOS script that packages its own DMG and would produce
  // no .deb, no AppImage and no installer here. The delta owns other `bundle`
  // keys, which merge in beside the base's; `targets` is the one that must
  // stay on the `--bundles` command line, where the job that wants a `.deb`
  // says so.
  assert.ok(
    !Object.hasOwn(config.bundle ?? {}, "targets"),
    "the delta must not own `bundle.targets` — --bundles decides",
  );
  // Same reasoning for the version: one input, one owner.
  assert.ok(
    !Object.hasOwn(config, "version"),
    "the delta must not own `version` — the dispatch input does",
  );

  const flavor = loadFlavor("ki.keriki");
  assert.deepEqual(
    {
      productName: config.productName,
      mainBinaryName: config.mainBinaryName,
      identifier: config.identifier,
      plugins: config.plugins,
    },
    {
      productName: flavor.displayName,
      mainBinaryName: flavor.mainBinaryName,
      identifier: flavor.identifier,
      plugins: {
        "deep-link": { desktop: { schemes: [flavor.deepLinkScheme] } },
      },
    },
    "the delta carries the identity fields the bundler reads from config",
  );

  // The merge, not the delta. Every one of these is a base value the flavored
  // build still depends on, and an array or a scalar in the delta replaces
  // rather than merges — so `bundle: {…}` is only safe as long as the keys it
  // does not mention survive. That is the claim, so assert it.
  const base = JSON.parse(
    readFileSync(path.join(desktopDir, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const merged = mergePatch(base, config);
  assert.deepEqual(merged.bundle.targets, base.bundle.targets);
  assert.equal(merged.bundle.active, base.bundle.active);
  assert.deepEqual(merged.bundle.macOS, base.bundle.macOS);
  assert.equal(merged.app.security.csp, base.app.security.csp);
  assert.equal(merged.build.frontendDist, base.build.frontendDist);
  // And the deep-link scheme really is replaced, not appended to: a build that
  // answered both `buzz://` and its own would capture a real Buzz's links.
  assert.deepEqual(merged.plugins["deep-link"].desktop.schemes, [
    flavor.deepLinkScheme,
  ]);

  // The two halves of the collision fix, read off the merged config rather
  // than the delta: no sidecar goes to `/usr/bin` any more, and every one of
  // them is mapped into the resource directory the app resolves instead.
  assert.deepEqual(
    merged.bundle.externalBin,
    [],
    "a flavored bundle must declare no externalBin — those land in /usr/bin, " +
      "which a real Buzz's package owns",
  );
  const sidecars = Object.entries(merged.bundle.resources);
  assert.equal(sidecars.length, base.bundle.externalBin.length);
  for (const [source, destination] of sidecars) {
    const name = path.posix
      .basename(source)
      .replace("-x86_64-unknown-linux-gnu", "");
    assert.ok(
      base.bundle.externalBin.includes(`binaries/${name}`),
      `${source} is not one of the trunk's sidecars`,
    );
    assert.equal(destination, `sidecars/${name}`);
  }
});

test("the tauri delta refuses the flavors that do not build", () => {
  for (const [flavorId, pattern] of [
    ["KI.keri.KI", /frozen flavors are not built/],
    ["example-client", /the example flavor is not a real app/],
  ]) {
    assert.match(
      runExpectingFailure("build-flavor-tauri-config.mjs", [
        flavorId,
        "/dev/null",
      ]),
      pattern,
      `${flavorId} must be refused`,
    );
    assert.match(
      runExpectingFailure("flavor-github-env.mjs", [flavorId], {
        GITHUB_ENV: path.join(
          mkdtempSync(path.join(tmpdir(), "ghenv-")),
          "env",
        ),
      }),
      pattern,
      `${flavorId} must be refused`,
    );
  }
});

test("the parked workflow stages icons and checks they crossed", () => {
  // A workflow file in `.github/workflows-pending/` is inert, so nothing else
  // in this repo would notice if a step were dropped from it. These four are
  // the ones whose absence is invisible until somebody installs the result:
  // without them the build is correct-looking and unbranded.
  const workflow = readFileSync(
    path.join(
      desktopDir,
      "..",
      ".github",
      "workflows-pending",
      "flavor-build.yml",
    ),
    "utf8",
  );
  //
  // Split into the two jobs and checked in each, not counted across the file.
  // A total of two is satisfied by zero in one job and two in the other, which
  // is the realistic edit — and the half that loses it is whichever platform
  // the person making the edit was not thinking about.
  const linuxAt = workflow.indexOf("\n  linux:\n");
  const windowsAt = workflow.indexOf("\n  windows:\n");
  assert.ok(
    linuxAt > 0 && windowsAt > linuxAt,
    "both jobs must still be there",
  );
  const jobs = {
    linux: workflow.slice(linuxAt, windowsAt),
    windows: workflow.slice(windowsAt),
  };
  for (const [job, body] of Object.entries(jobs)) {
    for (const needle of [
      "flavor-github-env.mjs",
      "build-flavor-tauri-config.mjs",
      "stage-flavor-icons.mjs",
      "Check the flavor really crossed",
      // The crossing check has two halves to verify — the process environment
      // and the dotenv Vite loads — so a step that still read `printenv` alone
      // would pass while the logo bytes went nowhere. Naming the script is also
      // what keeps the two jobs checking it the same way.
      "check-flavor-crossed.mjs",
      // Both jobs, not just Windows. Unpacking the `.deb` covers the icons and
      // the launcher name; the in-app mark is compiled into the binary, so the
      // Linux package can pass every `.deb` check and still show the Buzz
      // wordmark inside the window.
      "check-frontend-brand.mjs",
    ]) {
      assert.ok(
        body.includes(needle),
        `${needle} must appear in the ${job} job`,
      );
    }
  }
  // Linux only, and read back out of the `.deb` rather than derived from the
  // flavor. These are the defects a human found by hand-installing the
  // package — a path collision with a stock Buzz, `Maintainer: you`, and a
  // launcher entry Tauri's own template filed under no category — and the
  // steps that reproduce them live in this inert file alongside the step
  // above. Rebasing anything onto this job conflicts in exactly one place, and
  // resolving that conflict by taking one side deletes a verified fix with
  // every other gate still green: measured, not assumed, by removing each step
  // and watching this test stay silent.
  //
  // Checked against the job with its comments stripped. Two of these needles
  // are also words the surrounding comments use to explain the step, so over
  // the raw text the prose satisfies the assertion and the check passes on a
  // job whose actual command is gone — which is how the first version of this
  // loop scored two of six break tests as uncaught when the breaks were real.
  const linuxExecutable = jobs.linux
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  for (const needle of [
    "Check the .deb wears the flavor",
    "Check the .deb can be installed next to a real Buzz",
    // The reproduction itself, not just the step's name. `--unpack` is the
    // verb that detects a path collision; `-i` would go on to configure and
    // fail on an unsatisfied dependency instead, reporting the wrong defect.
    // Both calls, because the pair is the test: the decoy claims the paths and
    // the flavored package has to unpack anyway.
    "dpkg --unpack /tmp/stock-buzz-decoy.deb",
    'dpkg --unpack "$DEB"',
    'dpkg-deb -f "$DEB" Maintainer',
    'desktop-file-validate "$DESKTOP_FILE"',
  ]) {
    assert.ok(
      linuxExecutable.includes(needle),
      `${needle} must appear in the linux job`,
    );
  }
  // And prove the stripping did not just empty this haystack either.
  assert.ok(linuxExecutable.includes("pnpm tauri build"));
  // No updater signing, as agreed. A secret reintroduced here would also be a
  // secret this fork does not have, so the build would fail at the end rather
  // than the start.
  //
  // Comments are stripped first. The file's own header explains which
  // release-only pieces were dropped and names them to do it, so a check over
  // the raw text fails on the documentation of the very rule it enforces —
  // which it did, on the first run.
  const executable = workflow
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  for (const forbidden of [
    "TAURI_SIGNING_PRIVATE_KEY",
    "build-release-config.mjs",
    "createUpdaterArtifacts",
    "BUZZ_UPDATER_PUBLIC_KEY",
  ]) {
    assert.ok(
      !executable.includes(forbidden),
      `${forbidden} is release-only and must stay out of the flavor build`,
    );
  }
  // And prove the stripping did not just empty the haystack.
  assert.ok(executable.includes("pnpm tauri build"));
  assert.ok(executable.length > workflow.length / 2);
});
