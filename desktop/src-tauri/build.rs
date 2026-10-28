// Shared schema, included from the same source the runtime command parses with,
// so the build-time validation below and the runtime parse cannot drift.
include!("src/commands/reconnect_hook_config.rs");
// Same source of truth the runtime filters with, so a baked build env cannot
// carry a reserved key the runtime believes it already rejected.
include!("src/managed_agents/reserved_env_keys.rs");

use base64::Engine as _;

/// The display name the native shell uses: app menu, About box, tray items,
/// window title.
///
/// The frontend reads its own name from `VITE_BUZZ_PRODUCT_NAME`, which Rust
/// cannot see. Without this the native half falls back to Tauri's
/// `productName`, which `demo-build-config.mjs` derives as `Buzz <demo name>`
/// — so a build whose every window said ki.keriki still had "Buzz kikeriki" in
/// its About box and "Quit Buzz" in its menu bar.
///
/// Trimmed and refused when empty rather than baked blank: an empty menu title
/// is a macOS app menu with no name at all, which is harder to notice than a
/// wrong one.
fn bake_brand_product_name() {
    let Ok(raw) = std::env::var("BUZZ_BUILD_PRODUCT_NAME") else {
        return;
    };
    let name = raw.trim();
    if name.is_empty() {
        panic!("BUZZ_BUILD_PRODUCT_NAME must not be empty or whitespace");
    }
    println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_PRODUCT_NAME={name}");
}

/// The menu-bar glyph, copied into `OUT_DIR` for `include_bytes!`.
///
/// A raster, unlike every other brand asset: `tray_menu.rs` hands AppKit raw
/// RGBA, and nothing in this toolchain can rasterise an SVG. The flavor
/// commits a template PNG — black ink on transparent, since macOS tints a
/// template image itself and reads only the alpha — and this copies it next to
/// the build output so the binary carries it with no path to resolve at run
/// time.
///
/// The file is written on *every* build, empty when no flavor declares one, so
/// the `include_bytes!` on the other side always has something to include and
/// the choice stays a runtime `is_empty()` rather than a `cfg` that has to be
/// kept in step with this function.
///
/// The declared path is repo-relative to `desktop/`, so a flavor file means
/// the same thing on every machine; it is resolved here against
/// `CARGO_MANIFEST_DIR`, which is `desktop/src-tauri`.
fn bake_brand_tray_icon() {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR is always set for a build script");
    let destination = std::path::Path::new(&out_dir).join("brand-tray-icon.png");

    let bytes = match std::env::var("BUZZ_BUILD_TRAY_ICON") {
        Err(_) => Vec::new(),
        Ok(relative) => {
            let desktop_dir = std::path::Path::new(
                &std::env::var("CARGO_MANIFEST_DIR")
                    .expect("CARGO_MANIFEST_DIR is always set for a build script"),
            )
            .parent()
            .expect("src-tauri always has a parent")
            .to_path_buf();
            let source = desktop_dir.join(&relative);
            println!("cargo:rerun-if-changed={}", source.display());
            // Refused rather than skipped. A missing icon that silently fell
            // back to the bee would ship a Buzz glyph in the menu bar of a
            // build whose flavor explicitly asked for its own, and the only
            // evidence would be a screenshot nobody takes of a 22pt icon.
            std::fs::read(&source).unwrap_or_else(|error| {
                panic!(
                    "BUZZ_BUILD_TRAY_ICON points at {} which could not be read: {error}",
                    source.display()
                )
            })
        }
    };

    std::fs::write(&destination, &bytes).unwrap_or_else(|error| {
        panic!(
            "failed to write {} for the tray icon: {error}",
            destination.display()
        )
    });

    // A marker the other side can compare itself against. Without it the
    // tests can only say "the glyph decodes if there is one", which passes
    // identically on a build that silently baked nothing — and a build that
    // silently baked nothing is the whole failure being guarded against.
    if !bytes.is_empty() {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_HAS_TRAY_ICON=1");
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=BUZZ_RELAY_URL");
    println!("cargo:rerun-if-env-changed=BUZZ_RELAY_HTTP");
    println!("cargo:rerun-if-env-changed=BUZZ_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=BUZZ_UPDATER_ENDPOINT");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_BUZZ_AGENT_PROVIDER");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_BUZZ_AGENT_MODEL");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_AGENT_ENV");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_RELAY_RECONNECT_CMD");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_AGENT_ACCESS_OWNER_ONLY");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_DEMO_SLUG");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_PRODUCT_NAME");
    println!("cargo:rerun-if-env-changed=BUZZ_BUILD_TRAY_ICON");
    println!("cargo:rustc-check-cfg=cfg(buzz_updater_enabled)");

    bake_brand_product_name();
    bake_brand_tray_icon();

    if let Ok(slug) = std::env::var("BUZZ_BUILD_DEMO_SLUG") {
        let valid = !slug.is_empty()
            && slug.len() <= 48
            && slug
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
            && slug
                .bytes()
                .next()
                .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
            && slug
                .bytes()
                .last()
                .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
        if !valid {
            panic!("BUZZ_BUILD_DEMO_SLUG must be a lowercase ASCII slug");
        }
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_DEMO_SLUG={slug}");
    }

    // Explicit owner-only agent-access capability. Release packaging sets this
    // presence-only marker; OSS/custom builds leave agent access configurable.
    if std::env::var("BUZZ_BUILD_AGENT_ACCESS_OWNER_ONLY").is_ok() {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_AGENT_ACCESS_OWNER_ONLY=1");
    }

    if let Ok(relay_url) = std::env::var("BUZZ_RELAY_URL") {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_RELAY_URL={relay_url}");
    }

    if let Ok(relay_http) = std::env::var("BUZZ_RELAY_HTTP") {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_RELAY_HTTP={relay_http}");
    }

    if let Ok(provider) = std::env::var("BUZZ_BUILD_BUZZ_AGENT_PROVIDER") {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_BUZZ_AGENT_PROVIDER={provider}");
    }

    if let Ok(model) = std::env::var("BUZZ_BUILD_BUZZ_AGENT_MODEL") {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_BUZZ_AGENT_MODEL={model}");
    }

    // Generic KEY=VALUE pairs to inject into every spawned agent process.
    // Newline-delimited; each line must be non-empty and contain exactly one
    // `=` separator with a non-empty key.  OSS builds leave this unset.
    // The validated value is base64-encoded before emitting so the single-line
    // Cargo build-script output carries all pairs (Cargo output is line-oriented;
    // a raw multiline value would be silently truncated to the first line).
    if let Ok(raw) = std::env::var("BUZZ_BUILD_AGENT_ENV") {
        for (line_no, line) in raw.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let eq = line.find('=').unwrap_or_else(|| {
                panic!(
                    "BUZZ_BUILD_AGENT_ENV line {}: missing '=' separator in {:?}",
                    line_no + 1,
                    line
                )
            });
            let key = &line[..eq];
            if key.is_empty() {
                panic!(
                    "BUZZ_BUILD_AGENT_ENV line {}: key must not be empty in {:?}",
                    line_no + 1,
                    line
                );
            }
            // The baked env is written into every spawned agent's environment
            // LAST (see `managed_agents/runtime.rs`), after Buzz sets the
            // access gates and identity vars. A baked reserved key would
            // therefore silently override the gate the UI promises, so reject
            // it at build time instead of shipping a binary that bypasses its
            // own enforcement.
            if is_reserved_env_key(key) {
                panic!(
                    "BUZZ_BUILD_AGENT_ENV line {}: `{}` is reserved by Buzz and cannot be baked \
                     into a build (it would override Buzz's own identity/access env)",
                    line_no + 1,
                    key
                );
            }
        }
        let encoded = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_AGENT_ENV={encoded}");
    }

    if let Ok(val) = std::env::var("BUZZ_BUILD_RELAY_RECONNECT_CMD") {
        let parsed: serde_json::Value = serde_json::from_str(&val)
            .unwrap_or_else(|e| panic!("BUZZ_BUILD_RELAY_RECONNECT_CMD is not valid JSON: {e}"));
        serde_json::from_value::<ReconnectHookConfig>(parsed).unwrap_or_else(|e| {
            panic!("BUZZ_BUILD_RELAY_RECONNECT_CMD doesn't match ReconnectHookConfig: {e}")
        });
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_RELAY_RECONNECT_CMD={val}");
    }

    // Presence-only release capability: internal desktop builds opt into
    // auto-connecting their configured default relay on first run. OSS builds
    // leave this unset and retain explicit community selection.
    if std::env::var("BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY").is_ok() {
        println!("cargo:rustc-env=BUZZ_DESKTOP_BUILD_AUTO_CONNECT_DEFAULT_RELAY=1");
    }

    let updater_public_key = std::env::var("BUZZ_UPDATER_PUBLIC_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let updater_endpoint = std::env::var("BUZZ_UPDATER_ENDPOINT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if updater_public_key.is_some() && updater_endpoint.is_some() {
        println!("cargo:rustc-cfg=buzz_updater_enabled");
    }

    // Cargo test executables get no embedded Windows manifest (tauri_build
    // attaches one to bin targets only), so the loader binds comctl32 v5, which
    // lacks TaskDialogIndirect (statically imported via tauri-plugin-dialog/rfd)
    // and debug test exes die at load with STATUS_ENTRYPOINT_NOT_FOUND. Declaring
    // the Common Controls v6 dependency makes link.exe emit a side-by-side
    // <exe>.manifest that the loader honors for manifest-less executables;
    // binaries with an embedded manifest (the real app) ignore it.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }

    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "websocket",
            tauri_build::InlinedPlugin::new()
                .commands(&["connect", "send", "disconnect", "disconnect_all"])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to build Tauri application");
}
