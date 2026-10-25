/**
 * The external-open tiers, and that both halves of the app read them the same.
 *
 * The frontend decides whether to hide the button, ask first, or just open;
 * the Rust command re-decides before it writes anything. A disagreement would
 * show up as a button that always errors, or — the one that matters — a button
 * offered for something the backend was right to refuse. Both read
 * `desktop/external-open-policy.json`, so these cases are written against the
 * real table, not a fixture.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyExternalOpen,
  externalOpenWrittenName,
} from "./externalOpenPolicy.ts";

test("the shared cases agree with this implementation", async () => {
  // `desktop/external-open-test-cases.json` is run here and by
  // `external_open_policy.rs`, each through its own implementation. Sharing the
  // extension table is not enough — the two halves also have to derive the same
  // written name from the same raw filename, and they did not: a 259-character
  // name truncates to `.exe` on the Rust side only, and a control character
  // after the extension disappears there only. Two suites asserting their own
  // hand-written expectations is exactly why that went unnoticed.
  const url = new URL(
    "../../../external-open-test-cases.json",
    import.meta.url,
  );
  const { cases } = JSON.parse(await readFile(url, "utf8"));
  assert.ok(cases.length >= 20, `only ${cases.length} cases`);

  for (const { filename, writtenAs, verdict, why } of cases) {
    assert.equal(
      externalOpenWrittenName(filename),
      writtenAs,
      `${JSON.stringify(filename)} (${why}): written name`,
    );
    assert.equal(
      classifyExternalOpen(filename),
      verdict,
      `${JSON.stringify(filename)} (${why}): verdict`,
    );
  }
});

test("documents, text, images and media open on one click", () => {
  for (const name of [
    "minutes.docx",
    "report.pdf",
    "budget.xlsx",
    "deck.pptx",
    "contract.odt",
    "notes.txt",
    "scan.png",
    "photo.heic",
    "clip.mp4",
    "voice.m4a",
  ]) {
    assert.equal(classifyExternalOpen(name), "allowed", name);
  }
});

test("the script types from the review are refused outright", () => {
  // Each of these is text on disk, so the sniffed MIME is
  // application/octet-stream and the upload deny-list waves it through. The
  // extension is the only thing that knows.
  for (const name of [
    "setup.bat",
    "setup.cmd",
    "payload.vbs",
    "payload.js",
    "page.hta",
    "open me.terminal",
    "autostart.desktop",
    "tool.jar",
    "installer.msi",
    "script.ps1",
    "shortcut.lnk",
    "Backup.app",
    "run.command",
    "build.sh",
  ]) {
    assert.equal(classifyExternalOpen(name), "refused", name);
  }
});

test("an unrecognised or missing extension asks first", () => {
  for (const name of [
    "drawings.zip",
    "backup.tar.gz",
    "firmware.bin",
    "export.dat",
    "README",
    ".gitignore",
    "",
  ]) {
    assert.equal(classifyExternalOpen(name), "needsConfirmation", name);
  }
});

test("formats whose handler is not merely a viewer stay out of the safe tier", () => {
  // Each of these was in the first draft of the safe list: a spreadsheet
  // treats a leading = as a formula, a template runs its AutoOpen macro, an
  // ASF container can carry a URL-launch command, an epub is browser-rendered.
  // Things to ask about, not to refuse.
  for (const name of [
    "rows.csv",
    "rows.tsv",
    "letterhead.dot",
    "model.xlt",
    "theme.pot",
    "clip.wmv",
    "track.wma",
    "book.epub",
  ]) {
    assert.equal(classifyExternalOpen(name), "needsConfirmation", name);
  }
});

test("svg is neither safe nor refused", () => {
  // Its handler is a browser: the script is sandboxed, but the document's
  // outbound requests are not. Worth asking about, not worth deciding silently
  // in either direction.
  assert.equal(classifyExternalOpen("diagram.svg"), "needsConfirmation");
});

test("only the final extension decides", () => {
  assert.equal(classifyExternalOpen("invoice.pdf.exe"), "refused");
  // The mirror image: the OS dispatches on .pdf here, so refusing it would
  // cost a working feature for nothing.
  assert.equal(classifyExternalOpen("invoice.exe.pdf"), "allowed");
});

test("a trailing dot or space cannot hide an executable", () => {
  // Win32 strips both when creating the file, so all of these are evil.exe.
  for (const name of ["evil.exe.", "evil.exe..", "evil.exe. ", "evil.exe "]) {
    assert.equal(classifyExternalOpen(name), "refused", JSON.stringify(name));
  }
});

test("an alternate-data-stream name is judged as the file it becomes", () => {
  // Neutralizing the colon is the control, not a second classification pass.
  assert.equal(
    externalOpenWrittenName("notes.txt:evil.exe"),
    "notes.txt_evil.exe",
  );
  assert.equal(classifyExternalOpen("notes.txt:evil.exe"), "refused");
  // The mirror image genuinely is a text file afterwards, so refusing it would
  // cost a working action for no gain.
  assert.equal(
    externalOpenWrittenName("evil.bat:notes.txt"),
    "evil.bat_notes.txt",
  );
  assert.equal(classifyExternalOpen("evil.bat:notes.txt"), "allowed");
});

test("classification is case-insensitive and ignores directories", () => {
  assert.equal(classifyExternalOpen("SETUP.BAT"), "refused");
  assert.equal(classifyExternalOpen("Report.PDF"), "allowed");
  // A directory named like a document must not vote on the file inside it.
  assert.equal(classifyExternalOpen("/tmp/report.pdf/setup.exe"), "refused");
  assert.equal(classifyExternalOpen("C:\\report.pdf\\setup.exe"), "refused");
});

test("the shared table is one file with no extension in two tiers", async () => {
  // Both halves read this file. An extension listed as both safe and
  // executable would resolve by evaluation order rather than by intent. The
  // Rust side panics on it the first time its table is touched, which is a
  // backstop and not a gate — this test and its Rust counterpart are what
  // catch it before a release, and this one names the extension without
  // needing a build.
  const url = new URL("../../../external-open-policy.json", import.meta.url);
  const table = JSON.parse(await readFile(url, "utf8"));

  const flatten = (tier) =>
    Object.values(tier)
      .filter((group) => Array.isArray(group))
      .flat();
  const safe = new Set(flatten(table.safe));
  const executable = new Set(flatten(table.executable));

  assert.ok(safe.size > 20, `safe tier: ${safe.size}`);
  assert.ok(executable.size > 40, `executable tier: ${executable.size}`);
  assert.deepEqual(
    [...safe].filter((extension) => executable.has(extension)),
    [],
    "an extension must sit in exactly one tier",
  );
  // Lowercase on both sides, because every lookup lowercases its input: an
  // uppercase entry here would be an extension that can never match.
  for (const extension of [...safe, ...executable]) {
    assert.equal(
      extension,
      extension.toLowerCase(),
      `${extension} must be lowercase to be reachable`,
    );
    assert.ok(
      !extension.startsWith("."),
      `${extension} must not carry a leading dot`,
    );
  }
});
