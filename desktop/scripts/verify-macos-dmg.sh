#!/usr/bin/env bash
# Prove a macOS DMG is shippable before anyone is told to install it.
#
# Every check here replaces one a human was expected to remember. The ones that
# need an expected value take it as a flag; the rest always run. Any failure
# exits non-zero, so a build can gate on this instead of on an exit code that
# only means "hdiutil did not crash".
#
# What it cannot tell you: Gatekeeper's verdict. An ad-hoc signature is always
# rejected by `spctl`, on a good build and a bad one alike, so that is reported
# as a fact about the build rather than asserted. The launch check runs the
# bundle against a throwaway HOME, which proves the bundle starts - not that
# Finder will let a quarantined copy of it start.
#
# Usage: verify-macos-dmg.sh <dmg> [--identifier ID] [--name NAME]
#                                  [--version VERSION] [--app-icon PATH]
#                                  [--launch]

set -euo pipefail

dmg=""
want_identifier=""
want_name=""
want_version=""
want_icon=""
# Opt-in: a cold start downloads ~110 MB of speech models into the throwaway
# HOME before the window settles, so it is a deliberate pre-delivery step, not
# something every build should pay for. The static checks above it are free.
do_launch=0
launch_seconds=20

while [[ $# -gt 0 ]]; do
  case "$1" in
    --identifier) want_identifier="${2:?--identifier needs a value}"; shift 2 ;;
    --name) want_name="${2:?--name needs a value}"; shift 2 ;;
    --version) want_version="${2:?--version needs a value}"; shift 2 ;;
    --app-icon) want_icon="${2:?--app-icon needs a value}"; shift 2 ;;
    --launch) do_launch=1; shift ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *)
      [[ -z "$dmg" ]] || { echo "Unexpected argument: $1" >&2; exit 2; }
      dmg="$1"; shift ;;
  esac
done

[[ -n "$dmg" ]] || { echo "Usage: $0 <dmg> [options]" >&2; exit 2; }
[[ -f "$dmg" ]] || { echo "DMG not found: $dmg" >&2; exit 1; }

failures=0
mount_point=""
sandbox=""

pass() { printf '  ok    %s\n' "$*"; }
skip() { printf '  skip  %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; failures=$((failures + 1)); }

finish() {
  local status="$?"
  trap - EXIT
  if [[ -n "$mount_point" ]]; then
    hdiutil detach "$mount_point" >/dev/null 2>&1 ||
      hdiutil detach -force "$mount_point" >/dev/null 2>&1 || true
    rmdir "$mount_point" 2>/dev/null || true
  fi
  [[ -n "$sandbox" ]] && rm -rf "$sandbox"
  exit "$status"
}
trap finish EXIT

plist_get() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true; }

expect() {
  local label="$1" want="$2" got="$3"
  if [[ -z "$want" ]]; then
    skip "$label (no expected value given) - got '$got'"
  elif [[ "$want" == "$got" ]]; then
    pass "$label = $got"
  else
    fail "$label is '$got', expected '$want'"
  fi
}

printf 'Verifying %s\n' "$dmg"

# A DMG that copied badly is one of the real ways an app "will not open", and
# it is invisible until someone double-clicks it.
if hdiutil verify "$dmg" >/dev/null 2>&1; then
  pass "image checksum"
else
  fail "image checksum - the DMG is corrupt, do not ship it"
  exit 1
fi

mount_point="$(mktemp -d "${TMPDIR:-/tmp}/verify-dmg.XXXXXX")"
# -nobrowse so verifying a build never leaves a volume on anyone's Desktop.
hdiutil attach -readonly -noverify -noautoopen -nobrowse \
  -mountpoint "$mount_point" "$dmg" >/dev/null

shopt -s nullglob
apps=("$mount_point"/*.app)
shopt -u nullglob
if (( ${#apps[@]} != 1 )); then
  fail "expected exactly one .app at the volume root, found ${#apps[@]}"
  exit 1
fi
app="${apps[0]}"
app_name="$(basename "$app")"
expect "app bundle name" "${want_name:+$want_name.app}" "$app_name"

if [[ -L "$mount_point/Applications" && "$(readlink "$mount_point/Applications")" == "/Applications" ]]; then
  pass "drag-to-Applications symlink"
else
  fail "no /Applications symlink - there is nothing to drag onto"
fi

plist="$app/Contents/Info.plist"
if [[ -f "$plist" ]]; then
  # The identifier decides which installed app this replaces and which data
  # dir, keyring entry and nest it inherits. A DMG branded as one app and
  # carrying another's identifier silently destroys an identity on install.
  expect "CFBundleIdentifier" "$want_identifier" "$(plist_get "$plist" CFBundleIdentifier)"
  expect "CFBundleName" "$want_name" "$(plist_get "$plist" CFBundleName)"
  expect "CFBundleDisplayName" "$want_name" "$(plist_get "$plist" CFBundleDisplayName)"
  # The stamp lives in the filename and in CFBundleVersion. If they disagree,
  # two different builds are indistinguishable once installed.
  expect "CFBundleVersion" "$want_version" "$(plist_get "$plist" CFBundleVersion)"
  if [[ -n "$want_version" ]]; then
    case "$(basename "$dmg")" in
      *"$want_version"*) pass "stamp in DMG filename" ;;
      *) fail "DMG filename does not carry the stamp $want_version" ;;
    esac
  fi
else
  fail "no Info.plist in $app_name"
fi

if codesign --verify --deep --strict "$app" 2>/dev/null; then
  pass "code signature (--deep --strict)"
else
  fail "code signature - the bundle was edited after signing, it will not open"
fi

signature="$(codesign -dvv "$app" 2>&1 | awk -F= '/^Signature=/ { print $2 }')"
if [[ "$signature" == "adhoc" ]]; then
  skip "Gatekeeper - signature is ad-hoc, so first launch needs right-click > Open"
else
  skip "Gatekeeper - signature is '${signature:-unknown}'; spctl: $(spctl -a -t exec "$app" 2>&1 | tail -1)"
fi

app_icon="$app/Contents/Resources/icon.icns"
if [[ -f "$app_icon" ]]; then
  icon_sum="$(shasum -a 256 "$app_icon" | awk '{print $1}')"
  if [[ -n "$want_icon" ]]; then
    want_sum="$(shasum -a 256 "$want_icon" | awk '{print $1}')"
    if [[ "$icon_sum" == "$want_sum" ]]; then
      pass "app icon matches $want_icon"
    else
      fail "app icon is $icon_sum, expected $want_sum from $want_icon"
    fi
  else
    skip "app icon (no --app-icon given) - sha256 $icon_sum"
  fi
else
  fail "no icon.icns in the bundle"
fi

# Without a saved Finder view the window opens bare: no background, icons
# wherever Finder feels like putting them.
if [[ -s "$mount_point/.DS_Store" ]]; then
  pass "saved Finder view"
else
  fail "no saved Finder view - the window would open bare"
fi

background="$mount_point/.background/background.png"
if [[ -f "$background" ]]; then
  dpi="$(sips -g dpiWidth "$background" 2>/dev/null | awk '/dpiWidth/ { print int($2) }')"
  if [[ "${dpi:-0}" -ge 144 ]]; then
    pass "background ${dpi} dpi"
  else
    # Finder divides a background's pixel size by its DPI, so a 72 dpi sheet
    # drawn for Retina lands at twice the window size and you see a corner.
    fail "background is ${dpi:-unknown} dpi, needs 144 - the window will show a crop"
  fi
else
  fail "no .background/background.png"
fi

volume_icon="$mount_point/.VolumeIcon.icns"
if [[ ! -f "$volume_icon" ]]; then
  fail "no .VolumeIcon.icns - the mounted volume gets a generic disk icon"
elif [[ ! -f "$app_icon" ]]; then
  skip "volume icon badge (no app icon to compare against)"
elif [[ "$(shasum -a 256 "$volume_icon" | awk '{print $1}')" == "$icon_sum" ]]; then
  fail "volume icon is a copy of the app icon - a mounted image looks like the app"
else
  pass "volume icon is badged, not a copy of the app icon"
fi

# A sidecar that did not get bundled, or got bundled without its executable
# bit, is an app that launches and then cannot do the thing it launched for.
# This is the free half of the launch check and always runs.
unlinked=0
nonexec=0
binaries=0
for binary in "$app/Contents/MacOS"/*; do
  [[ -f "$binary" ]] || continue
  binaries=$((binaries + 1))
  [[ -x "$binary" ]] || { nonexec=$((nonexec + 1)); continue; }
  while read -r dependency; do
    # Anything outside /usr/lib and /System ships with the app and must
    # actually be in it; an unresolved one is a dyld failure at launch.
    case "$dependency" in
      /usr/lib/*|/System/*|@*) continue ;;
    esac
    [[ -e "$dependency" ]] || unlinked=$((unlinked + 1))
  done < <(otool -L "$binary" 2>/dev/null | awk 'NR > 1 { print $1 }')
done
if (( binaries == 0 )); then
  fail "Contents/MacOS is empty"
elif (( nonexec || unlinked )); then
  fail "$binaries binaries: $nonexec not executable, $unlinked with unresolved libraries"
else
  pass "$binaries bundled binaries, all executable, no unresolved libraries"
fi

if (( do_launch )); then
  executable="$app/Contents/MacOS/$(plist_get "$plist" CFBundleExecutable)"
  running=""
  [[ -n "$want_identifier" ]] &&
    running="$(lsappinfo find "bundleID=$want_identifier" 2>/dev/null)"
  if [[ ! -x "$executable" ]]; then
    fail "launch - $executable is missing or not executable"
  elif [[ -n "$running" ]]; then
    # The single-instance plugin hands off to the running copy and exits 0, so
    # launching now would prove nothing. Say so rather than record a pass.
    skip "launch - $want_identifier is already running; quit it and re-run"
  else
    # Throwaway HOME and TMPDIR, and `env -i` so an operator's BUZZ_PRIVATE_KEY
    # cannot be picked up and make the test instance sign in as somebody. This
    # answers "does this bundle start", touching no real app data.
    sandbox="$(mktemp -d "${TMPDIR:-/tmp}/verify-dmg-run.XXXXXX")"
    mkdir -p "$sandbox/home" "$sandbox/tmp"
    env -i HOME="$sandbox/home" TMPDIR="$sandbox/tmp" \
      PATH=/usr/bin:/bin USER="${USER:-}" LOGNAME="${LOGNAME:-}" \
      "$executable" >"$sandbox/launch.log" 2>&1 &
    launch_pid=$!
    elapsed=0
    while (( elapsed < launch_seconds )) && kill -0 "$launch_pid" 2>/dev/null; do
      sleep 1
      elapsed=$((elapsed + 1))
    done
    if kill -0 "$launch_pid" 2>/dev/null; then
      pass "launch - still running after ${launch_seconds}s"
      kill -TERM "$launch_pid" 2>/dev/null || true
      stopping=0
      while (( stopping < 5 )) && kill -0 "$launch_pid" 2>/dev/null; do
        sleep 1
        stopping=$((stopping + 1))
      done
      # The path is inside this run's mountpoint, so this can only match the
      # copy we started - never an installed app of the same name.
      kill -KILL "$launch_pid" 2>/dev/null || true
      pkill -KILL -f "$executable" 2>/dev/null || true
    else
      wait "$launch_pid" 2>/dev/null && exit_code=0 || exit_code=$?
      fail "launch - exited with $exit_code after ${elapsed}s"
      printf '        %s\n' "$(tail -5 "$sandbox/launch.log" 2>/dev/null)"
    fi
  fi
else
  skip "launch (pass --launch to start the bundle against a throwaway HOME)"
fi

if (( failures )); then
  printf '\n%s: %d check(s) failed - do not ship this DMG.\n' "$(basename "$dmg")" "$failures" >&2
  exit 1
fi
printf '\n%s: all checks passed.\n' "$(basename "$dmg")"
