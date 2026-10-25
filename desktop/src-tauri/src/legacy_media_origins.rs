//! Relay migrations: resolving media left on a relay a community has moved off.
//!
//! The table itself lives in `desktop/legacy-relay-origins.json` and is shared
//! with the frontend (`shared/lib/mediaUrl.ts`), which needs the same knowledge
//! to decide whether a foreign-origin image belongs to us. Keeping one file
//! rather than one constant per language is what stops the two halves from
//! drifting — a drift would be silent, and would show up as "images render but
//! documents refuse to download", which is exactly the bug this module fixes.
//!
//! What this module does **not** do is widen the download gate. A legacy origin
//! is a *source* we recognise, never a destination we fetch from: the URL is
//! rewritten onto the current relay before `validate_download_url` sees it, so
//! the only origin the app ever talks to is still its own relay.

use std::collections::HashMap;
use std::sync::LazyLock;

use url::Url;

/// The shared table, embedded at compile time.
///
/// `include_str!` rather than a runtime read: the file is part of the build,
/// and a missing or malformed table must fail the build rather than silently
/// disable the rewrite in a shipped app.
const LEGACY_RELAY_ORIGINS_JSON: &str = include_str!("../../legacy-relay-origins.json");

#[derive(serde::Deserialize)]
struct LegacyOriginFile {
    migrations: Vec<LegacyOriginEntry>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyOriginEntry {
    current_relay_origin: String,
    legacy_origins: Vec<String>,
}

/// Legacy origins keyed by the origin of the relay the workspace is on now.
static LEGACY_ORIGINS_BY_CURRENT: LazyLock<HashMap<String, Vec<String>>> = LazyLock::new(|| {
    let parsed: LegacyOriginFile = serde_json::from_str(LEGACY_RELAY_ORIGINS_JSON)
        .expect("legacy-relay-origins.json is malformed");
    parsed
        .migrations
        .into_iter()
        .map(|entry| (entry.current_relay_origin, entry.legacy_origins))
        .collect()
});

/// The canonical `scheme://host[:port]` of a URL, or `None` for an opaque
/// origin (`data:`, `blob:`) or unparseable input.
fn origin_of(url: &Url) -> Option<String> {
    let origin = url.origin();
    origin.is_tuple().then(|| origin.ascii_serialization())
}

/// Whether `candidate` is a relay the community on `current` moved off.
fn is_legacy_origin_for(candidate: &str, current: &str) -> bool {
    LEGACY_ORIGINS_BY_CURRENT
        .get(current)
        .is_some_and(|origins| origins.iter().any(|origin| origin == candidate))
}

/// Rewrite a `/media/` URL left on a predecessor relay onto the current one.
///
/// Returns `url` unchanged unless **all** of these hold, so the only URLs this
/// can move are ones a migration we know about accounts for:
///
/// - both `url` and `relay_base` parse and have a tuple origin;
/// - `url`'s path is under `/media/`;
/// - `url`'s origin is listed as a predecessor **of this exact current relay**.
///
/// The path, query and nothing else survive; the scheme, host and port come
/// from `relay_base`. A third-party Blossom URL, a `/media/` URL that is
/// already on the current relay, and a predecessor of some *other* community's
/// relay are all returned untouched.
pub fn canonicalize_legacy_media_url(url: &str, relay_base: &str) -> String {
    let (Ok(parsed), Ok(base)) = (Url::parse(url), Url::parse(relay_base)) else {
        return url.to_string();
    };
    if !parsed.path().starts_with("/media/") {
        return url.to_string();
    }
    let (Some(url_origin), Some(base_origin)) = (origin_of(&parsed), origin_of(&base)) else {
        return url.to_string();
    };
    if !is_legacy_origin_for(&url_origin, &base_origin) {
        return url.to_string();
    }

    // Rebuild from the current relay's origin alone, not from `relay_base`:
    // a base that ever carries a path must not prefix the media path with it.
    let Ok(mut rewritten) = Url::parse(&base_origin) else {
        return url.to_string();
    };
    rewritten.set_path(parsed.path());
    rewritten.set_query(parsed.query());
    rewritten.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CURRENT: &str = "https://relay.ki.keriki.de";
    const LEGACY: &str = "https://kikeriki.communities.buzz.xyz";
    const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn shared_table_parses_and_carries_the_kikeriki_migration() {
        assert_eq!(
            LEGACY_ORIGINS_BY_CURRENT.get(CURRENT).map(Vec::as_slice),
            Some([LEGACY.to_string()].as_slice()),
        );
    }

    #[test]
    fn rewrites_a_legacy_document_onto_the_current_relay() {
        assert_eq!(
            canonicalize_legacy_media_url(&format!("{LEGACY}/media/{HASH}.pdf"), CURRENT),
            format!("{CURRENT}/media/{HASH}.pdf"),
        );
    }

    #[test]
    fn rewrites_every_extension_not_only_inline_media() {
        for ext in ["pdf", "docx", "zip", "png", "mp4", "bin"] {
            assert_eq!(
                canonicalize_legacy_media_url(&format!("{LEGACY}/media/{HASH}.{ext}"), CURRENT),
                format!("{CURRENT}/media/{HASH}.{ext}"),
                "extension {ext} must be rewritten",
            );
        }
    }

    #[test]
    fn preserves_the_query_string() {
        assert_eq!(
            canonicalize_legacy_media_url(&format!("{LEGACY}/media/{HASH}.pdf?v=2"), CURRENT),
            format!("{CURRENT}/media/{HASH}.pdf?v=2"),
        );
    }

    #[test]
    fn leaves_a_third_party_blossom_url_alone() {
        let third_party = format!("https://nostr.build/media/{HASH}.pdf");
        assert_eq!(
            canonicalize_legacy_media_url(&third_party, CURRENT),
            third_party,
        );
    }

    #[test]
    fn leaves_the_legacy_origin_alone_on_an_unrelated_relay() {
        // The same old URL on a community that never did this migration must
        // not be claimed — its relay has no such blob.
        let legacy = format!("{LEGACY}/media/{HASH}.pdf");
        assert_eq!(
            canonicalize_legacy_media_url(&legacy, "https://zeniad.communities.buzz.xyz"),
            legacy,
        );
    }

    #[test]
    fn leaves_a_non_media_path_alone() {
        let outside = format!("{LEGACY}/export/{HASH}.pdf");
        assert_eq!(canonicalize_legacy_media_url(&outside, CURRENT), outside);
    }

    #[test]
    fn a_media_prefixed_path_segment_is_not_a_media_path() {
        let lookalike = format!("{LEGACY}/mediaxx/{HASH}.pdf");
        assert_eq!(
            canonicalize_legacy_media_url(&lookalike, CURRENT),
            lookalike
        );
    }

    #[test]
    fn leaves_unparseable_input_alone() {
        assert_eq!(
            canonicalize_legacy_media_url("not a url", CURRENT),
            "not a url"
        );
        assert_eq!(
            canonicalize_legacy_media_url(&format!("{LEGACY}/media/{HASH}.pdf"), "not a url"),
            format!("{LEGACY}/media/{HASH}.pdf"),
        );
    }

    #[test]
    fn leaves_an_opaque_origin_alone() {
        let data_url = "data:application/pdf;base64,AAAA";
        assert_eq!(canonicalize_legacy_media_url(data_url, CURRENT), data_url);
    }
}
