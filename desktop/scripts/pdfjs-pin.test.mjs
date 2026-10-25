/**
 * pdf.js stays pinned to one exact version.
 *
 * Not a style preference. `vite-plugin-pdfjs-assets` copies cmaps, standard
 * fonts, WASM decoders and ICC profiles straight out of the installed
 * `pdfjs-dist`, and the renderer imports the worker from it too. A range
 * specifier means the build's asset layout and the API it is driven through can
 * change under us on an unrelated `pnpm install` — and the failures that causes
 * are quiet and document-specific: a scan whose JBIG2 regions come out blank,
 * CJK text with missing glyphs, a worker that will not start. None of those is
 * something a test here would catch, which is exactly why the version is held
 * still instead.
 *
 * So this asserts three things agree: the declared pin is exact, the lockfile
 * recorded that pin, and the package actually installed is that version.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonUrl = new URL("../package.json", import.meta.url);
const lockfileUrl = new URL("../../pnpm-lock.yaml", import.meta.url);
const installedUrl = new URL(
  "../node_modules/pdfjs-dist/package.json",
  import.meta.url,
);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

test("pdfjs-dist is declared as an exact version", async () => {
  const { dependencies } = await readJson(packageJsonUrl);
  const declared = dependencies["pdfjs-dist"];
  assert.match(
    declared,
    /^\d+\.\d+\.\d+$/,
    `pdfjs-dist must be pinned exactly, found "${declared}" — a range lets the ` +
      "copied asset set and the worker move independently of this code",
  );
});

test("the lockfile and the installed package are that same version", async () => {
  const { dependencies } = await readJson(packageJsonUrl);
  const pinned = dependencies["pdfjs-dist"];

  const installed = await readJson(installedUrl);
  assert.equal(
    installed.version,
    pinned,
    "the installed pdfjs-dist is not the pinned version",
  );

  // Read as text rather than parsed: the lockfile needs no YAML dependency to
  // answer "did it record the pin we declared". Scoped to the pdfjs-dist
  // block — an unscoped `includes("specifier: 6.4.299")` would be satisfied by
  // any other package in the monorepo that happened to pin the same string.
  const lockfile = await readFile(lockfileUrl, "utf8");
  const entry =
    /^ {6}pdfjs-dist:\n {8}specifier: (.+)\n {8}version: (.+)$/m.exec(lockfile);
  assert.ok(
    entry,
    "pnpm-lock.yaml has no pdfjs-dist importer entry in the expected shape — " +
      "if pnpm changed its lockfile format, update this assertion rather than " +
      "dropping it",
  );
  const [, specifier, resolved] = entry;
  assert.equal(
    specifier,
    pinned,
    "pnpm-lock.yaml records a different specifier than package.json declares " +
      "— run pnpm install after changing the pin",
  );
  assert.equal(
    resolved,
    pinned,
    "pnpm-lock.yaml resolved pdfjs-dist to a version other than the pin",
  );
});
