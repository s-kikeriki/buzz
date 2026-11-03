// Canonical shape of a flavor's `defaultAgents` entry, `include!`d into BOTH
// `build.rs` (which validates `BUZZ_BUILD_DEFAULT_AGENTS` at compile time and
// refuses a build rather than shipping a spec the app will drop) and
// `managed_agents/default_agents.rs` (which decodes the baked value and seeds
// the store). Build scripts cannot import from the crate, so sharing the
// source via `include!` is what guarantees the two agree. See
// `reserved_env_keys.rs` for the same pattern and the same reasoning.
//
// Keep this file dependency-free apart from `serde`, which both sides already
// have: no crate-internal imports. Both consumers compile it as-is.

/// One agent a flavored build seeds into a fresh install.
///
/// Field names are the flavor file's own, camelCase, so the JSON a reviewer
/// reads in `flavors/<id>.json` is the JSON that crosses into the build.
///
/// ## The two avatar fields
///
/// `avatar` is a repo-relative path and is what a flavor file declares.
/// `avatar_url` is a data URL and is what the *baked* value carries:
/// `bake_default_agents` reads the file and moves one into the other, because
/// the seed runs in the packaged app, on a machine that never had the
/// checkout the path pointed into.
///
/// Two fields rather than one that changes meaning, so each phase has a field
/// it can refuse the other's value in — [`validate_default_agents`] rejects a
/// spec carrying both — and so a baked value that somehow still held a path
/// seeds an agent with *no* picture rather than one with a broken image.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct DefaultAgentSpec {
    /// Definition id, and therefore the card's `slug` and the `d` tag of its
    /// published coordinate. `builtin:`-prefixed so `merge_personas` keeps the
    /// card flagged built-in instead of demoting it on the next boot.
    pub id: String,
    pub display_name: String,
    /// Harness id — `buzz-agent`, `claude`, `goose`, … The effective agent and
    /// MCP commands are resolved from the runtime catalog when an instance is
    /// created, which is why this spec has no field for either: pinning a bare
    /// command name here would resolve against `PATH` instead of the sidecar
    /// the bundle shipped.
    pub runtime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// ACP harness command. Defaults to `buzz-acp` when the flavor says
    /// nothing, which is what every agent in this app uses.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acp_command: Option<String>,
    /// Inbound author gate, as the NIP-AP wire string `RespondTo::parse_wire`
    /// reads at instance mint: `owner-only`, `allowlist` or `anyone`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub respond_to: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub respond_to_allowlist: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallelism: Option<u32>,
    /// Environment the agent spawns with. A value may be empty — that is how a
    /// flavor ships the *shape* of a credential without the credential, so the
    /// field is present in the UI for its owner to fill in and no secret is
    /// ever in the repo or in a build.
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub env_vars: std::collections::BTreeMap<String, String>,
    /// Repo-relative path to the avatar, as the flavor file declares it.
    /// Consumed by `bake_default_agents` and absent from the baked value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The same picture as a data URL, written by `bake_default_agents`.
    /// Absent from a flavor file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

/// Media type for an avatar path, or `None` for an extension nothing here
/// decodes.
///
/// The list is short on purpose. These bytes end up in a `data:` URL inside a
/// webview, so an entry is a format the renderer has to be able to paint —
/// not every format Pillow can write.
pub(crate) fn avatar_media_type(avatar_path: &str) -> Option<&'static str> {
    let extension = avatar_path.rsplit('.').next()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Reject a spec list that the app would silently drop or mis-seed.
///
/// Returns the first problem as a message naming the entry, or `None` when
/// every entry is usable. Called from `build.rs` — where it fails the build
/// with the flavor still in front of the author — and again at boot, where the
/// baked value could only be wrong if something downstream of the build
/// rewrote it.
pub(crate) fn validate_default_agents(specs: &[DefaultAgentSpec]) -> Option<String> {
    let mut seen: Vec<&str> = Vec::new();
    for spec in specs {
        let id = spec.id.as_str();
        if !id.starts_with("builtin:") || id.len() <= "builtin:".len() {
            return Some(format!(
                "default agent id {id:?} must look like `builtin:<slug>` — the \
                 prefix is what keeps the card flagged built-in across boots"
            ));
        }
        if seen.contains(&id) {
            return Some(format!("two default agents share the id {id:?}"));
        }
        seen.push(id);

        if spec.display_name.trim().is_empty() {
            return Some(format!("default agent {id:?} has an empty displayName"));
        }
        if spec.runtime.trim().is_empty() {
            return Some(format!("default agent {id:?} has an empty runtime"));
        }
        if let Some(respond_to) = spec.respond_to.as_deref() {
            if !["owner-only", "allowlist", "anyone"].contains(&respond_to) {
                return Some(format!(
                    "default agent {id:?} has respondTo {respond_to:?}, which is \
                     not one of owner-only, allowlist, anyone"
                ));
            }
            if respond_to != "allowlist" && !spec.respond_to_allowlist.is_empty() {
                return Some(format!(
                    "default agent {id:?} carries a respondToAllowlist under the \
                     {respond_to:?} gate, where it can never be read"
                ));
            }
        } else if !spec.respond_to_allowlist.is_empty() {
            return Some(format!(
                "default agent {id:?} carries a respondToAllowlist with no respondTo"
            ));
        }
        if spec.avatar.is_some() && spec.avatar_url.is_some() {
            return Some(format!(
                "default agent {id:?} declares both avatar and avatarUrl — one \
                 is the path a flavor file names and the other is what baking \
                 it produces, so carrying both means one of them is stale"
            ));
        }
        if let Some(avatar) = spec.avatar.as_deref() {
            if avatar_media_type(avatar).is_none() {
                return Some(format!(
                    "default agent {id:?} has avatar {avatar:?}, whose extension \
                     is not one a webview can paint"
                ));
            }
            if avatar.starts_with('/')
                || avatar.starts_with('\\')
                || avatar.split(['/', '\\']).any(|part| part == "..")
            {
                return Some(format!(
                    "default agent {id:?} has avatar {avatar:?}, which is not a \
                     repo-relative path"
                ));
            }
        }
        if spec.parallelism == Some(0) {
            return Some(format!("default agent {id:?} has parallelism 0"));
        }
        for key in spec.env_vars.keys() {
            if key.trim().is_empty() || key.contains('=') {
                return Some(format!(
                    "default agent {id:?} has an unusable env key {key:?}"
                ));
            }
            if is_reserved_env_key(key) {
                // Same rule `BUZZ_BUILD_AGENT_ENV` is held to: a baked reserved
                // key would override the identity and access env Buzz sets for
                // every agent it spawns, which is the gate the UI promises.
                return Some(format!(
                    "default agent {id:?} bakes {key:?}, which is reserved by Buzz \
                     and would override its own identity/access env"
                ));
            }
        }
    }
    None
}
