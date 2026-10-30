//! Compile-time identity for reusable named demo builds.
//!
//! Production builds leave `BUZZ_DESKTOP_BUILD_DEMO_SLUG` unset and retain all
//! existing names. The demo recipe validates one slug and `build.rs` bakes it
//! into the binary; every runtime identity is then derived from that one value.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

/// The subdirectory of a flavored bundle's resources that holds its sidecars.
/// Written by `build-flavor-tauri-config.mjs`, which is the only other place
/// this name appears.
const SIDECAR_RESOURCE_DIR: &str = "sidecars";

pub(crate) fn demo_slug() -> Option<&'static str> {
    option_env!("BUZZ_DESKTOP_BUILD_DEMO_SLUG")
}

/// The name Tauri's bundler put in this build's filesystem paths, when a
/// flavor supplied one. See `bake_bundle_name` in `build.rs`.
pub(crate) fn bundle_name() -> Option<&'static str> {
    option_env!("BUZZ_DESKTOP_BUILD_BUNDLE_NAME")
}

/// Every directory this build may keep its bundled sidecars in — `buzz`,
/// `buzz-acp`, `buzz-agent`, `buzz-dev-mcp`, `git-credential-nostr` and
/// `buzz-backend-kubernetes` — most specific first.
///
/// The trunk declares them as `externalBin`, so the bundler puts them next to
/// the executable and `exe_dir` alone is the answer. A flavored `.deb` cannot
/// do that: `externalBin` installs into `/usr/bin`, and a real Buzz's package
/// already owns `/usr/bin/buzz` and `/usr/bin/buzz-acp`, so dpkg refuses to
/// unpack a second package claiming them. A flavored bundle therefore ships
/// them as *resources* under `sidecars/`, which lands them in
/// `/usr/lib/<bundle name>/sidecars/` — Debian's place for a package's private
/// executables, and a path no other package can collide with.
///
/// `exe_dir` stays in the list, last, for three reasons that are all live:
/// a flavored macOS build is produced without that config delta and keeps its
/// sidecars in `Contents/MacOS/`; `cargo build` produces none of this layout
/// at all; and on a Linux box with stock Buzz also installed, `/usr/bin/buzz`
/// does exist — a different build of the same program, which is why ours is
/// searched first rather than instead.
pub(crate) fn sidecar_dirs(exe_dir: &Path) -> Vec<PathBuf> {
    sidecar_dirs_for(exe_dir, bundle_name())
}

fn sidecar_dirs_for(exe_dir: &Path, bundle_name: Option<&str>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(resources) = bundle_name.and_then(|name| bundle_resource_dir(exe_dir, name)) {
        dirs.push(resources.join(SIDECAR_RESOURCE_DIR));
    }
    dirs.push(exe_dir.to_path_buf());
    dirs
}

// Where the bundler placed this build's resources, relative to the directory
// holding the executable. One function per platform because the three bundle
// layouts genuinely differ: a `.deb` installs the executable to `/usr/bin` and
// resources to `/usr/lib/<name>`, an NSIS installer puts both in one
// directory, and a `.app` splits them across `Contents/MacOS` and
// `Contents/Resources`.
/// `/usr/bin/<exe>` → `/usr/lib/<bundle name>`.
#[cfg(target_os = "linux")]
fn bundle_resource_dir(exe_dir: &Path, bundle_name: &str) -> Option<PathBuf> {
    Some(exe_dir.parent()?.join("lib").join(bundle_name))
}

/// An NSIS installer puts resources in the install directory, beside the
/// executable, so the bundle name is already spent on that directory's name.
#[cfg(target_os = "windows")]
fn bundle_resource_dir(exe_dir: &Path, _bundle_name: &str) -> Option<PathBuf> {
    Some(exe_dir.to_path_buf())
}

/// `Contents/MacOS/<exe>` → `Contents/Resources`. The bundle name is already
/// spent on the `.app` folder.
#[cfg(target_os = "macos")]
fn bundle_resource_dir(exe_dir: &Path, _bundle_name: &str) -> Option<PathBuf> {
    Some(exe_dir.parent()?.join("Resources"))
}

/// No bundle layout to know about. Reached only if this crate is ever built
/// for a target Tauri has no desktop bundler for; the sidecars are then
/// wherever the executable is, which is the fallback `sidecar_dirs` appends.
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
fn bundle_resource_dir(_exe_dir: &Path, _bundle_name: &str) -> Option<PathBuf> {
    None
}

pub(crate) fn is_demo_build() -> bool {
    demo_slug().is_some()
}

pub(crate) const DEMO_AGENT_CONFIG_ENV: &str = "BUZZ_AGENT_CONFIG_DIR";

pub(crate) fn demo_config_home() -> Result<Option<std::path::PathBuf>, String> {
    demo_config_home_for(demo_slug(), dirs::config_dir())
}

pub(crate) fn demo_agent_oauth_cache_dir() -> Result<Option<std::path::PathBuf>, String> {
    Ok(demo_config_home()?.map(|dir| dir.join("buzz-agent").join("oauth")))
}

/// Keep child config caches inside this demo build's identity. In particular,
/// bundled buzz-agent OAuth tokens must not read or write production's root.
/// Refuse launch if a demo cannot resolve its root; None means production only.
pub(crate) fn apply_demo_config_home(command: &mut std::process::Command) -> Result<(), String> {
    if let Some(config_home) = demo_config_home()? {
        command.env(DEMO_AGENT_CONFIG_ENV, config_home);
    }
    Ok(())
}

fn demo_config_home_for(
    demo_slug: Option<&str>,
    config_dir: Option<std::path::PathBuf>,
) -> Result<Option<std::path::PathBuf>, String> {
    match demo_slug {
        None => Ok(None),
        Some(slug) => config_dir
            .map(|dir| Some(dir.join(format!("buzz-demo-{slug}"))))
            .ok_or_else(|| "cannot resolve demo credential directory".to_string()),
    }
}

pub(crate) fn deep_link_scheme() -> Cow<'static, str> {
    demo_slug()
        .map(|slug| Cow::Owned(format!("buzz-demo-{slug}")))
        .unwrap_or(Cow::Borrowed("buzz"))
}

pub(crate) fn is_deep_link_for_build(value: &str) -> bool {
    is_deep_link_for_scheme(value, deep_link_scheme().as_ref())
}

fn is_deep_link_for_scheme(value: &str, scheme: &str) -> bool {
    value
        .strip_prefix(scheme)
        .is_some_and(|suffix| suffix.starts_with("://"))
}

pub(crate) fn keyring_service() -> Cow<'static, str> {
    demo_slug()
        .map(|slug| Cow::Owned(format!("buzz-desktop-demo.{slug}")))
        .unwrap_or(Cow::Borrowed("buzz-desktop"))
}

pub(crate) fn nest_name(is_dev: bool) -> Cow<'static, str> {
    nest_name_for(demo_slug(), is_dev)
}

fn nest_name_for(demo_slug: Option<&str>, is_dev: bool) -> Cow<'_, str> {
    if let Some(slug) = demo_slug {
        Cow::Owned(format!(".buzz-demo-{slug}"))
    } else if is_dev {
        Cow::Borrowed(".buzz-dev")
    } else {
        Cow::Borrowed(".buzz")
    }
}

pub(crate) fn cli_name(is_dev: bool) -> String {
    if let Some(slug) = demo_slug() {
        format!("buzz-demo-{slug}")
    } else if is_dev {
        "buzz-dev".to_string()
    } else {
        "buzz".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "compiled with BUZZ_BUILD_DEMO_SLUG by the compiled-flags recipe"]
    fn compiled_demo_slug_matches_expected() {
        let expected = std::env::var("BUZZ_TEST_EXPECTED_DEMO_SLUG")
            .expect("BUZZ_TEST_EXPECTED_DEMO_SLUG must be set");
        assert_eq!(demo_slug(), Some(expected.as_str()));
    }

    #[test]
    fn ordinary_release_defaults_remain_production_identity() {
        if demo_slug().is_none() {
            assert_eq!(deep_link_scheme(), "buzz");
            assert_eq!(keyring_service(), "buzz-desktop");
            assert_eq!(nest_name(false), ".buzz");
            assert_eq!(cli_name(false), "buzz");
        }
    }

    #[test]
    fn demo_agent_config_and_oauth_roots_are_build_scoped() {
        let base = std::path::PathBuf::from("/Users/demo/Library/Application Support");
        assert_eq!(
            demo_config_home_for(None, Some(base.clone())).unwrap(),
            None
        );
        let first = demo_config_home_for(Some("board-1234567812345678"), Some(base.clone()))
            .unwrap()
            .unwrap();
        let second = demo_config_home_for(Some("board-8765432187654321"), Some(base))
            .unwrap()
            .unwrap();
        assert_eq!(
            first,
            std::path::PathBuf::from(
                "/Users/demo/Library/Application Support/buzz-demo-board-1234567812345678"
            )
        );
        assert_eq!(
            first.join("buzz-agent/oauth"),
            std::path::PathBuf::from(
                "/Users/demo/Library/Application Support/buzz-demo-board-1234567812345678/buzz-agent/oauth"
            )
        );
        assert_ne!(first, second);
    }

    #[test]
    fn unresolved_demo_credentials_never_select_production_defaults() {
        assert_eq!(demo_config_home_for(None, None).unwrap(), None);
        assert_eq!(
            demo_config_home_for(Some("board-1234567812345678"), None),
            Err("cannot resolve demo credential directory".to_string())
        );
    }

    #[test]
    fn duplicate_instance_links_follow_the_build_scheme() {
        assert!(is_deep_link_for_scheme("buzz://message?id=1", "buzz"));
        assert!(!is_deep_link_for_scheme(
            "buzz-demo-board-1234567812345678://message?id=1",
            "buzz"
        ));
        assert!(is_deep_link_for_scheme(
            "buzz-demo-board-1234567812345678://message?id=1",
            "buzz-demo-board-1234567812345678"
        ));
        assert!(!is_deep_link_for_scheme(
            "buzz://message?id=1",
            "buzz-demo-board-1234567812345678"
        ));
    }

    /// The directory a `.deb` actually installs the executable into, so the
    /// expectations below are the real relative hop and not an invented one.
    #[cfg(target_os = "linux")]
    const EXE_DIR: &str = "/usr/bin";
    #[cfg(target_os = "macos")]
    const EXE_DIR: &str = "/Applications/ki.keriki.app/Contents/MacOS";
    #[cfg(target_os = "windows")]
    const EXE_DIR: &str = r"C:\Program Files\ki.keriki";

    #[test]
    fn an_unflavored_build_looks_for_sidecars_beside_its_executable() {
        // What every `cargo build` and every stock bundle produces. Nothing
        // may be prepended here: a `/usr/lib/<name>` guess with no flavor
        // behind it would be a directory that cannot exist.
        assert_eq!(
            sidecar_dirs_for(Path::new(EXE_DIR), None),
            vec![PathBuf::from(EXE_DIR)]
        );
    }

    #[test]
    fn a_flavored_build_prefers_its_own_resource_dir_then_falls_back() {
        let dirs = sidecar_dirs_for(Path::new(EXE_DIR), Some("ki.keriki"));
        assert_eq!(dirs.len(), 2, "{dirs:?}");

        // Order is the load-bearing half. On a box with stock Buzz also
        // installed, `/usr/bin/buzz-acp` exists and belongs to the other
        // package; searching it first would spawn a different build's harness.
        #[cfg(target_os = "linux")]
        assert_eq!(dirs[0], PathBuf::from("/usr/lib/ki.keriki/sidecars"));
        #[cfg(target_os = "macos")]
        assert_eq!(
            dirs[0],
            PathBuf::from("/Applications/ki.keriki.app/Contents/Resources/sidecars")
        );
        #[cfg(target_os = "windows")]
        assert_eq!(
            dirs[0],
            PathBuf::from(r"C:\Program Files\ki.keriki\sidecars")
        );

        assert_eq!(dirs[1], PathBuf::from(EXE_DIR));
    }

    /// Where a second flavor's executable would live once installed alongside
    /// the first. On Linux that is the *same* directory — every `.deb` puts
    /// its executable in `/usr/bin`, which is the whole reason the sidecars
    /// had to move out of it. macOS and Windows give each app its own install
    /// root, so the second flavor's path differs there.
    #[cfg(target_os = "linux")]
    const OTHER_EXE_DIR: &str = "/usr/bin";
    #[cfg(target_os = "macos")]
    const OTHER_EXE_DIR: &str = "/Applications/Zeniad.app/Contents/MacOS";
    #[cfg(target_os = "windows")]
    const OTHER_EXE_DIR: &str = r"C:\Program Files\Zeniad";

    #[test]
    fn two_flavors_installed_side_by_side_do_not_share_a_sidecar_directory() {
        // The property coexistence rests on. Asserted on the first entry
        // only: the executable's own directory is a deliberately shared
        // fallback, and on Linux it is literally the same `/usr/bin` for both.
        let one = sidecar_dirs_for(Path::new(EXE_DIR), Some("ki.keriki"));
        let two = sidecar_dirs_for(Path::new(OTHER_EXE_DIR), Some("Zeniad"));
        assert_ne!(one[0], two[0], "{one:?} vs {two:?}");
    }

    #[test]
    fn production_and_named_demo_nests_are_distinct() {
        assert_eq!(nest_name_for(None, false), ".buzz");
        assert_eq!(
            nest_name_for(Some("workstream-board"), false),
            ".buzz-demo-workstream-board"
        );
        assert_eq!(
            nest_name_for(Some("second-demo"), false),
            ".buzz-demo-second-demo"
        );
    }
}
