import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("the flavor's build env reaches GITHUB_ENV intact", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "ghenv-")), "env");
  writeFileSync(file, "");
  const output = run("flavor-github-env.mjs", ["ki.keriki"], {
    GITHUB_ENV: file,
  });

  const contents = readFileSync(file, "utf8");
  const parsed = parseGithubEnv(contents);
  const expected = flavorBuildEnv(loadFlavor("ki.keriki"));
  assert.deepEqual(
    parsed,
    expected,
    "every variable and only those variables, with the exact values",
  );
  assert.ok(parsed.VITE_BUZZ_PRODUCT_LOGO.length > 1000);

  // Assert the *form*, not just the round trip. No value the flavor emits
  // today contains a newline, so the single-line `KEY=value` form would parse
  // back identically and this test would pass for a script that silently
  // truncates the first multi-line value anyone adds. Checking that every
  // variable was written as a heredoc is the falsifiable version.
  const opened = [...contents.matchAll(/^([A-Z0-9_]+)<<(.+)$/gm)];
  assert.equal(
    opened.length,
    Object.keys(expected).length,
    "every variable must be written in heredoc form, not `KEY=value`",
  );
  // And the delimiters must differ per variable. A fixed `EOF` is guessable, so
  // a value whose own text contained that line would close the block early and
  // let its remainder be parsed as further variables.
  const delimiters = new Set(opened.map(([, , delimiter]) => delimiter));
  assert.equal(delimiters.size, opened.length, "one delimiter per variable");

  // Names in the log, values not.
  assert.match(output, /BRAND_NAME/);
  assert.ok(
    !output.includes("relay.ki.keriki.de"),
    "the log lists variable names, not their values",
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
  // Counted, not merely present. There are two jobs and each needs all four;
  // a presence check passes with the step dropped from one of them, which is
  // the realistic edit — and the half that loses it is whichever platform the
  // person making the edit was not thinking about.
  for (const needle of [
    "flavor-github-env.mjs",
    "build-flavor-tauri-config.mjs",
    "stage-flavor-icons.mjs",
    "Check the flavor really crossed",
  ]) {
    const count = workflow.split(needle).length - 1;
    assert.equal(
      count,
      2,
      `${needle} must appear once in each of the two jobs, found ${count}`,
    );
  }
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
