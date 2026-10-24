import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verify-macos-dmg.sh", import.meta.url));
const icons = join(dirname(dirname(script)), "src-tauri/icons");

// hdiutil, iconutil, sips and codesign are macOS-only; CI runs this suite on
// Linux too.
const skip = process.platform !== "darwin" && "needs macOS (hdiutil, codesign)";

const IDENTIFIER = "xyz.block.buzz.app.demo.fixture-0123456789abcdef";
const NAME = "Fixture";
const VERSION = "20260101.0101";

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

/**
 * Build a DMG shaped like the one package-macos-dmg.sh ships, with one knob
 * per check so each assertion below can be shown to fail for its own reason.
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
  const app = join(source, `${NAME}.app`);
  mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents/Resources"), { recursive: true });
  mkdirSync(join(source, ".background"), { recursive: true });

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

  const appIcon = join(app, "Contents/Resources/icon.icns");
  makeIcns(appIcon, "128x128.png");
  // A different source image stands in for the badged icon: the check is that
  // the volume icon is not byte-identical to the app's.
  const volumeIcon = join(source, ".VolumeIcon.icns");
  if (badgedVolumeIcon) makeIcns(volumeIcon, "StoreLogo.png");
  else copyFileSync(appIcon, volumeIcon);

  const background = join(source, ".background/background.png");
  copyFileSync(join(icons, "128x128@2x.png"), background);
  run("sips", [
    "-s",
    "dpiWidth",
    String(backgroundDpi),
    "-s",
    "dpiHeight",
    String(backgroundDpi),
    background,
  ]);

  if (applicationsLink)
    symlinkSync("/Applications", join(source, "Applications"));

  run("codesign", ["--force", "--deep", "--sign", "-", app]);

  // `hdiutil create -srcfolder` drops .DS_Store, which is why the real script
  // writes the Finder view into a mounted read-write image. Do the same here,
  // or the unstyled case below would pass for the wrong reason.
  const rw = join(dir, "read-write.dmg");
  run("hdiutil", [
    "create",
    "-volname",
    NAME,
    "-srcfolder",
    source,
    "-format",
    "UDRW",
    "-ov",
    rw,
  ]);
  const mount = join(dir, "mount");
  mkdirSync(mount, { recursive: true });
  run("hdiutil", [
    "attach",
    "-readwrite",
    "-noverify",
    "-noautoopen",
    "-nobrowse",
    "-mountpoint",
    mount,
    rw,
  ]);
  try {
    // fsync, not writeFileSync: an unflushed write is still in the page cache
    // when hdiutil detaches, and the file is simply absent from the converted
    // image perhaps one run in three.
    if (savedFinderView) {
      const fd = openSync(join(mount, ".DS_Store"), "w");
      try {
        writeSync(fd, "saved view\n");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
  } finally {
    run("hdiutil", ["detach", mount]);
  }

  const dmg = join(dir, `${NAME}_0.0.1+${version}_aarch64.dmg`);
  run("hdiutil", ["convert", rw, "-format", "UDZO", "-o", dmg]);
  return { dir, dmg };
}

function verify(dmg, extra = []) {
  return spawnSync(
    script,
    [
      dmg,
      "--identifier",
      IDENTIFIER,
      "--name",
      NAME,
      "--version",
      VERSION,
      ...extra,
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

test("a well-formed DMG passes every check", { skip }, () => {
  withDmg({}, (result) => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /all checks passed/);
    assert.doesNotMatch(result.stdout, /FAIL/);
  });
});

// Each case below removes exactly one property of the good fixture. A check
// that cannot be made to fail is not protecting anything.
test("a mismatched bundle identifier fails", { skip }, () => {
  withDmg(
    { identifier: "xyz.block.buzz.app.demo.other-fedcba9876543210" },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stdout, /FAIL\s+CFBundleIdentifier is/);
    },
  );
});

test("a CFBundleVersion that disagrees with the filename fails", {
  skip,
}, () => {
  withDmg({ version: "20260202.0202" }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+CFBundleVersion is/);
  });
});

test("a 72 dpi background fails", { skip }, () => {
  withDmg({ backgroundDpi: 72 }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+background is 72 dpi/);
  });
});

test("a volume icon copied from the app icon fails", { skip }, () => {
  withDmg({ badgedVolumeIcon: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+volume icon is a copy of the app icon/);
  });
});

test("a missing /Applications symlink fails", { skip }, () => {
  withDmg({ applicationsLink: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+no \/Applications symlink/);
  });
});

test("an unstyled DMG fails", { skip }, () => {
  withDmg({ savedFinderView: false }, (result) => {
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL\s+no saved Finder view/);
  });
});
