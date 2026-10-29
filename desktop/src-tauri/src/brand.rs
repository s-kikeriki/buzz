//! Compile-time branding for the native shell.
//!
//! The frontend reads its brand from `import.meta.env`; nothing in Rust can.
//! Everything the operating system shows outside the webview — the macOS app
//! menu and its About box, the menu-bar icon and its Open/Quit items, the
//! window title — was therefore still Buzz on a build whose every pixel inside
//! the window was not.
//!
//! Both values are baked by `build.rs` from the flavor's own environment, so a
//! build that selects no flavor keeps exactly the names and the glyph it had.

/// The flavor's display name, or `None` on a build that declared none.
pub(crate) fn configured_product_name() -> Option<&'static str> {
    option_env!("BUZZ_DESKTOP_BUILD_PRODUCT_NAME")
}

/// What to call the product in native chrome.
///
/// Falls back to the caller's own `package_info().name` rather than to the
/// literal `"Buzz"`: an unflavored demo build is legitimately named
/// `Buzz <demo name>`, and hardcoding the trunk's name here would rename every
/// one of those menus as a side effect of this module existing.
pub(crate) fn product_name(package_name: &str) -> &str {
    configured_product_name().unwrap_or(package_name)
}

/// The trunk's own product name, as it appears inside static catalog copy.
///
/// Spelled out here rather than taken from `package_info().name`: the strings
/// this rebrands are `&'static str` literals in `discovery::catalog`, written
/// against the trunk's name, and the substring to replace in them is that
/// literal name — not whatever a demo build happens to call itself.
const TRUNK_PRODUCT_NAME: &str = "Buzz";

/// Rebrand copy that belongs to the **built-in** ACP runtime.
///
/// `discovery::catalog` is a `const` table, so its label and install hint
/// cannot be `format!`ed where they are declared — which is why a ki.keriki
/// build whose whole first run, native shell and signed-in app had been
/// de-branded still listed its own agent runtime as "Buzz Agent" in Settings →
/// Agents, next to Goose and Claude Code. A flavored e2e assertion found it;
/// no grep over `desktop/src` could have, because the string is not there.
///
/// Applied by the caller to that one runtime only. The other rows are vendor
/// names — Goose, Claude Code, Codex — and rebranding those would be a lie
/// about whose software it is, so the scoping is the caller's job and not a
/// pattern this function tries to infer.
///
/// Case-sensitive, and that is load-bearing: `buzz-agent`, `buzz-dev-mcp` and
/// `https://github.com/block/buzz` are identifiers and URLs in the same table,
/// all lowercase, and none of them may move.
pub(crate) fn rebrand_builtin_runtime(text: &str) -> String {
    match configured_product_name() {
        Some(name) => substitute_product_name(text, name),
        None => text.to_string(),
    }
}

/// The substitution itself, with the name passed in.
///
/// Split out so it is testable. This crate is compiled without a flavor in
/// test, so `configured_product_name()` is `None` and the wrapper above is the
/// identity function there — a test that went through it would assert nothing
/// and still be green, which is the shape of guard this repo keeps finding.
fn substitute_product_name(text: &str, name: &str) -> String {
    text.replace(TRUNK_PRODUCT_NAME, name)
}

/// The flavor's menu-bar glyph as a macOS template image.
///
/// Empty on a build that declared none — `build.rs` writes the file either
/// way, so this is one `is_empty()` rather than a `cfg` that could drift out
/// of step with the build script.
const TRAY_ICON_PNG: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/brand-tray-icon.png"));

/// Whether this build carries its own menu-bar glyph.
pub(crate) fn has_tray_icon() -> bool {
    !TRAY_ICON_PNG.is_empty()
}

/// Decode the baked glyph to RGBA8, or `None` if there is none.
///
/// Returns `None` rather than panicking on a corrupt file: the caller's
/// fallback is the Buzz bee, and a tray icon is not worth refusing to start
/// over. `build.rs` already refuses a path it cannot read, which is the
/// failure that actually happens.
pub(crate) fn tray_icon_rgba() -> Option<(Vec<u8>, u32, u32)> {
    if !has_tray_icon() {
        return None;
    }
    // A `Cursor`, not the slice: `png` 0.18 wants `Read + Seek`.
    let decoder = png::Decoder::new(std::io::Cursor::new(TRAY_ICON_PNG));
    let mut reader = decoder.read_info().ok()?;
    let mut buffer = vec![0; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buffer).ok()?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        // A template image is read for its alpha, so a file with no alpha
        // channel would render as a solid block in the menu bar.
        return None;
    }
    // Computed rather than taken from the reader's buffer length: the decode
    // buffer can be larger than the frame, and `Image::new_owned` reads
    // `width * height * 4` and would walk off the end of a short one.
    let pixels = (info.width as usize)
        .checked_mul(info.height as usize)?
        .checked_mul(4)?;
    if buffer.len() < pixels {
        return None;
    }
    buffer.truncate(pixels);
    Some((buffer, info.width, info.height))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_name_falls_back_to_the_package_name() {
        // This crate is built without a flavor in test, so the fallback is
        // the path under test and the caller's own name must survive.
        if configured_product_name().is_none() {
            assert_eq!(product_name("Buzz demo"), "Buzz demo");
        } else {
            assert_eq!(product_name("Buzz demo"), configured_product_name().unwrap());
        }
    }

    #[test]
    fn the_builtin_runtime_label_and_hint_follow_the_flavor() {
        // The two strings a ki.keriki build was still showing in
        // Settings → Agents, long after the rest of the app was de-branded.
        assert_eq!(
            substitute_product_name("Buzz Agent", "ki.keriki"),
            "ki.keriki Agent"
        );
        assert_eq!(
            substitute_product_name("Ships with the Buzz desktop app.", "ki.keriki"),
            "Ships with the ki.keriki desktop app."
        );
    }

    #[test]
    fn identifiers_and_urls_in_the_same_table_are_untouched() {
        // The reason the substitution is case-sensitive. These sit in the same
        // `KnownAcpRuntime` row as the label, and every one of them is matched
        // on, stored, or fetched — a rebrand that moved any of them would
        // break the runtime rather than rename it.
        for untouchable in [
            "buzz-agent",
            "buzz-dev-mcp",
            "https://github.com/block/buzz",
            "BUZZ_AGENT_MODEL",
        ] {
            assert_eq!(
                substitute_product_name(untouchable, "ki.keriki"),
                untouchable,
                "{untouchable} must survive a rebrand verbatim"
            );
        }
    }

    #[test]
    fn an_unflavored_build_changes_nothing_at_all() {
        // The opt-in half. `block/buzz` must be byte-identical, and this is
        // the path it takes — if the wrapper ever stopped checking
        // `configured_product_name`, the trunk would rename its own runtime.
        if configured_product_name().is_none() {
            assert_eq!(rebrand_builtin_runtime("Buzz Agent"), "Buzz Agent");
            assert_eq!(
                rebrand_builtin_runtime("Ships with the Buzz desktop app."),
                "Ships with the Buzz desktop app."
            );
        }
    }

    #[test]
    fn the_baked_glyph_matches_what_the_build_script_says_it_baked() {
        // Three answers that must agree, so neither direction can pass
        // silently: the build script's own marker, the embedded bytes, and
        // the decode. Without the marker this test reads "the glyph decodes
        // if there is one", which is just as green on a flavored build that
        // baked nothing — the exact failure it exists to catch.
        let declared = option_env!("BUZZ_DESKTOP_BUILD_HAS_TRAY_ICON").is_some();
        assert_eq!(
            declared,
            has_tray_icon(),
            "build.rs and the embedded bytes disagree about the tray glyph"
        );
        assert_eq!(
            declared,
            tray_icon_rgba().is_some(),
            "a declared glyph must decode; an undeclared one must be absent"
        );
    }

    #[test]
    fn a_baked_tray_icon_decodes_to_rgba_with_real_transparency() {
        let Some((rgba, width, height)) = tray_icon_rgba() else {
            return;
        };
        assert_eq!(rgba.len(), (width as usize) * (height as usize) * 4);
        assert!(
            rgba.chunks_exact(4).any(|pixel| pixel[3] == 0),
            "a macOS template image is read for its alpha; a fully opaque one \
             renders as a solid block in the menu bar"
        );
    }
}
