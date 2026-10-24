import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const script = join(scripts, "verify-macos-dmg.sh");
const packager = join(scripts, "package-macos-dmg.sh");
const icons = join(dirname(scripts), "src-tauri/icons");

// hdiutil, iconutil, sips and codesign are macOS-only; CI runs this suite on
// Linux too.
let skip = process.platform !== "darwin" && "needs macOS (hdiutil, codesign)";

const IDENTIFIER = "xyz.block.buzz.app.demo.fixture-0123456789abcdef";
const NAME = "Fixture";
const VERSION = "20260101.0101";
const DMG_NAME = `${NAME}_0.0.1+${VERSION}_aarch64.dmg`;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout;
}

function makeIcns(path, source) {
  const iconset = `${path}.iconset`;
  mkdirSync(iconset, { recursive: true });
  copyFileSync(join(icons, source), join(iconset, "icon_128x128.png"));
  copyFileSync(
    join(icons, "128x128@2x.png"),
    join(iconset, "icon_128x128@2x.png"),
  );
  run("iconutil", ["--convert", "icns", iconset, "--output", path]);
}

function makeApp(dir, { identifier = IDENTIFIER, version = VERSION } = {}) {
  const app = join(dir, `${NAME}.app`);
  mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents/Resources"), { recursive: true });
  writeFileSync(
    join(app, "Contents/Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${identifier}</string>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>${NAME}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>0.0.1</string>
  <key>CFBundleExecutable</key><string>fixture</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
  );
  const executable = join(app, "Contents/MacOS/fixture");
  writeFileSync(executable, "#!/bin/sh\nsleep 60\n");
  chmodSync(executable, 0o755);
  makeIcns(join(app, "Contents/Resources/icon.icns"), "128x128.png");
  run("codesign", ["--force", "--deep", "--sign", "-", app]);
  return app;
}

function withMountedDmg(dmg, body) {
  const mount = mkdtempSync(join(tmpdir(), "verify-dmg-mount-"));
  run("hdiutil", [
    // -nobrowse: a test run must not leave a volume on anybody's Desktop.
    ...["attach", "-readonly", "-noverify", "-noautoopen", "-nobrowse"],
    ...["-mountpoint", mount, dmg],
  ]);
  try {
    return body(mount);
  } finally {
    run("hdiutil", ["detach", mount]);
    rmSync(mount, { recursive: true, force: true });
  }
}

// One DMG built by the real packager. The passing case is checked against it
// directly, so these tests bind to the shipping path rather than to a
// reimplementation of it - and the hand-built variants below borrow its
// .DS_Store, because macOS deletes a .DS_Store whose contents are not a real
// Finder view, which made an invented one vanish about half the time.
let reference = null;

before(() => {
  if (skip) return;
  const dir = mkdtempSync(join(tmpdir(), "verify-dmg-reference-"));
  const dmg = join(dir, DMG_NAME);
  const packaged = spawnSync(packager, [makeApp(dir), dmg], {
    encoding: "utf8",
    env: { ...process.env, VOL_NAME: NAME },
  });
  if (packaged.status !== 0 || !existsSync(dmg)) {
    rmSync(dir, { recursive: true, force: true });
    skip = `package-macos-dmg.sh failed: ${packaged.stderr}`;
    return;
  }
  const dsStore = join(dir, "DS_Store");
  const styled = withMountedDmg(dmg, (mount) => {
    const saved = join(mount, ".DS_Store");
    if (!existsSync(saved) || statSync(saved).size === 0) return false;
    copyFileSync(saved, dsStore);
    return true;
  });
  if (!styled) {
    rmSync(dir, { recursive: true, force: true });
    // Finder styling needs a GUI login session. Without it there is no real
    // .DS_Store to copy, and inventing one tests nothing.
    skip = "package-macos-dmg.sh produced no Finder view (headless session?)";
    return;
  }
  reference = { dir, dmg, dsStore };
});

after(() => {
  if (reference) rmSync(reference.dir, { recursive: true, force: true });
});

/**
 * Rebuild the reference DMG's contents by hand, with one knob per check, so
 * each assertion below can be shown to fail for its own reason.
 */
function buildDmg(overrides = {}) {
  const {
    identifier = IDENTIFIER,
    version = VERSION,
    backgroundDpi = 144,
    badgedVolumeIcon = true,
    applicationsLink = true,
    savedFinderView = true,
  } = overrides;

  const dir = mkdtempSync(join(tmpdir(), "verify-dmg-test-"));
  const source = join(dir, "source");
  mkdirSync(join(source, ".background"), { recursive: true });
  const app = makeApp(source, { identifier, version });

  // A different source image stands in for the badged icon: the check is that
  // the volume icon is not byte-identical to the app's.
  const appIcon = join(app, "Contents/Resources/icon.icns");
  const volumeIcon = join(source, ".VolumeIcon.icns");
  if (badgedVolumeIcon) makeIcns(volumeIcon, "StoreLogo.png");
  else copyFileSync(appIcon, volumeIcon);

  const background = join(source, ".background/background.png");
  copyFileSync(join(icons, "128x128@2x.png"), background);
  run("sips", [
    ...["-s", "dpiWidth", String(backgroundDpi)],
    ...["-s", "dpiHeight", String(backgroundDpi)],
    background,
  ]);

  if (applicationsLink) {
    symlinkSync("/Applications", join(source, "Applications"));
  }

  // `hdiutil create -srcfolder` drops .DS_Store, which is why the real script
  // writes the Finder view into a mounted read-write image.
  const rw = join(dir, "read-write.dmg");
  run("hdiutil", [
    ...["create", "-volname", NAME, "-srcfolder", source],
    ...["-format", "UDRW", "-ov", rw],
  ]);
  const mount = join(dir, "mount");
  mkdirSync(mount, { recursive: true });
  run("hdiutil", [
    ...["attach", "-readwrite", "-noverify", "-noautoopen", "-nobrowse"],
    ...["-mountpoint", mount, rw],
  ]);
  try {
    if (savedFinderView)
      copyFileSync(reference.dsStore, join(mount, ".DS_Store"));
  } finally {
    run("hdiutil", ["detach", mount]);
  }

  const dmg = join(dir, DMG_NAME);
  run("hdiutil", ["convert", rw, "-format", "UDZO", "-o", dmg]);
  return { dir, dmg };
}

function verify(dmg, extra = []) {
  return spawnSync(
    script,
    [
      ...[dmg, "--identifier", IDENTIFIER],
      ...["--name", NAME, "--version", VERSION, ...extra],
    ],
    { encoding: "utf8" },
  );
}

function withDmg(overrides, assertions) {
  const { dir, dmg } = buildDmg(overrides);
  try {
    assertions(verify(dmg));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a DMG from package-macos-dmg.sh passes every check", (t) => {
  if (skip) return t.skip(skip);
  const result = verify(reference.dmg);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /all checks passed/);
  assert.doesNotMatch(result.stdout, /FAIL/);
});

// Each case below removes exactly one property of a good DMG. A check that
// cannot be made to fail is not protecting anything.
test("a mismatched bundle identifier fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg(
    { identifier: "xyz.block.buzz.app.demo.other-fedcba9876543210" },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stdout, /FAIL\s+CFBundleIdentifier is/);
    },
  );
});

test("a CFBundleVersion that disagrees with the filename fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg({ version: "20260202.0202" }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+CFBundleVersion is/);
  });
});

test("a 72 dpi background fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg({ backgroundDpi: 72 }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+background is 72 dpi/);
  });
});

test("a volume icon copied from the app icon fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg({ badgedVolumeIcon: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+volume icon is a copy of the app icon/);
  });
});

test("a missing /Applications symlink fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg({ applicationsLink: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+no \/Applications symlink/);
  });
});

test("an unstyled DMG fails", (t) => {
  if (skip) return t.skip(skip);
  withDmg({ savedFinderView: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+no saved Finder view/);
  });
});
