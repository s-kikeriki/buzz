//! Agents a flavored build ships with, baked in at compile time and presented
//! as built-in definitions.
//!
//! ## Why these are definitions and not instances
//!
//! A definition is a key-less card in the Agents list: configuration, with no
//! Nostr identity attached. An instance is a definition that has been started
//! — it has a key, it is published to the relay, and it answers people.
//!
//! Seeding definitions is the whole of what this module does. A build that
//! minted a key on first launch would put an identity on the organisation's
//! relay that nobody asked for, on a machine that may have been opened once to
//! look at it. Starting the agent is a decision, and it stays one.
//!
//! Nothing is lost by waiting: `buildInstanceInputForDefinition` copies the
//! definition's runtime, model, provider and access gate onto the instance it
//! creates and turns auto-start on, so the agent the user gets after pressing
//! start once is the agent the flavor described.
//!
//! ## Why they are `is_builtin`
//!
//! The same reason the bee personas are. A built-in card is flagged as not
//! the user's own work, which is what keeps the catalog honest about where it
//! came from — and what stops `merge_personas` demoting it on the next boot.
//! The user can still edit it; an edit is preserved, because `merge_personas`
//! only ever adds a built-in whose id is absent from the store.

use base64::Engine as _;

use crate::managed_agents::{is_reserved_env_key, AcpSessionPolicy, AgentDefinition};

// The spec shape and its validation, shared with `build.rs` so a spec that
// compiles is a spec this module accepts. See the file header for why it is
// `include!`d rather than imported.
include!("default_agents_spec.rs");

/// The baked list, as `build.rs` left it: base64 of the validated JSON.
///
/// `option_env!` rather than a `cfg`, like every other baked brand value, so
/// an unflavored build compiles the same code and simply finds nothing.
const BAKED_DEFAULT_AGENTS: Option<&str> = option_env!("BUZZ_DESKTOP_BUILD_DEFAULT_AGENTS");

/// Decode the baked specs, once.
///
/// Cached in a `OnceLock` because the decode is base64 plus JSON over an
/// avatar data URL tens of kilobytes long, and the callers below run inside
/// per-record loops — `built_in_order` is consulted once per stored record on
/// every persona load.
///
/// Empty for an unflavored build, and for a baked value that does not decode.
/// The second case cannot arise from a build that ran `bake_default_agents` —
/// which parses and validates the same bytes — so there is no recovery to
/// attempt and nothing a user could do about it; the log line is for whoever
/// is holding the broken binary.
fn baked_specs() -> &'static [DefaultAgentSpec] {
    static SPECS: std::sync::OnceLock<Vec<DefaultAgentSpec>> = std::sync::OnceLock::new();
    SPECS.get_or_init(|| {
        let Some(encoded) = BAKED_DEFAULT_AGENTS else {
            return Vec::new();
        };
        let decoded = match base64::engine::general_purpose::STANDARD.decode(encoded) {
            Ok(bytes) => bytes,
            Err(error) => {
                tracing::error!("baked default agents are not valid base64: {error}");
                return Vec::new();
            }
        };
        let specs: Vec<DefaultAgentSpec> = match serde_json::from_slice(&decoded) {
            Ok(specs) => specs,
            Err(error) => {
                tracing::error!("baked default agents are not a valid spec list: {error}");
                return Vec::new();
            }
        };
        if let Some(problem) = validate_default_agents(&specs) {
            tracing::error!("baked default agents rejected: {problem}");
            return Vec::new();
        }
        specs
    })
}

/// Project one spec onto the definition record the store holds.
fn definition_from_spec(spec: &DefaultAgentSpec, now: &str) -> AgentDefinition {
    AgentDefinition {
        id: spec.id.clone(),
        display_name: spec.display_name.clone(),
        avatar_url: spec.avatar_url.clone(),
        description: spec.description.clone(),
        // Empty rather than absent: `into_agent_record` maps an empty prompt
        // to `None`, which is the shape a record with no prompt has anywhere
        // else in the store.
        system_prompt: spec.system_prompt.clone().unwrap_or_default(),
        acp_command: spec.acp_command.clone(),
        runtime: Some(spec.runtime.clone()),
        model: spec.model.clone(),
        provider: spec.provider.clone(),
        // No alternates. A name pool is for a persona the user spawns copies
        // of; a flavor's default agent is one named thing.
        name_pool: vec![spec.display_name.clone()],
        is_builtin: true,
        is_active: true,
        shared: false,
        source_team: None,
        source_team_persona_slug: None,
        catalog_source: None,
        team_catalog_source: None,
        env_vars: spec.env_vars.clone(),
        respond_to: spec.respond_to.clone(),
        respond_to_allowlist: spec.respond_to_allowlist.clone(),
        parallelism: spec.parallelism,
        session_policy: AcpSessionPolicy::Channel,
        created_at: now.to_string(),
        updated_at: now.to_string(),
    }
}

/// Every baked default agent as a definition record.
pub(crate) fn default_agent_definitions(now: &str) -> Vec<AgentDefinition> {
    baked_specs()
        .iter()
        .map(|spec| definition_from_spec(spec, now))
        .collect()
}

/// Position of `id` in this build's baked list, or `None` when it is not one.
///
/// `merge_personas` demotes any stored card flagged built-in whose id
/// `built_in_order` does not recognise, so this is also the answer to "is
/// this still a built-in" — without it a seeded agent would lose the flag on
/// the very next boot.
pub(crate) fn default_agent_order(id: &str) -> Option<usize> {
    baked_specs().iter().position(|spec| spec.id == id)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn spec(id: &str) -> DefaultAgentSpec {
        DefaultAgentSpec {
            id: id.to_string(),
            display_name: "Router".to_string(),
            runtime: "buzz-agent".to_string(),
            description: None,
            system_prompt: None,
            model: Some("anthropic/claude-haiku-5.5".to_string()),
            provider: Some("openrouter".to_string()),
            acp_command: Some("buzz-acp".to_string()),
            respond_to: Some("owner-only".to_string()),
            respond_to_allowlist: Vec::new(),
            parallelism: Some(10),
            env_vars: BTreeMap::from([
                ("OPENROUTER_API_KEY".to_string(), String::new()),
                (
                    "OPENROUTER_BASE_URL".to_string(),
                    "https://eu.openrouter.ai/api/v1".to_string(),
                ),
            ]),
            // The baked shape: `bake_default_agents` has already moved the
            // declared path into a data URL by the time the runtime sees it.
            avatar: None,
            avatar_url: Some("data:image/jpeg;base64,AAAA".to_string()),
        }
    }

    #[test]
    fn a_spec_becomes_a_built_in_definition_carrying_every_configured_value() {
        let definition = definition_from_spec(&spec("builtin:router"), "2026-11-03T00:00:00Z");

        assert_eq!(definition.id, "builtin:router");
        assert_eq!(definition.display_name, "Router");
        assert!(definition.is_builtin);
        assert!(definition.is_active);
        assert_eq!(definition.runtime.as_deref(), Some("buzz-agent"));
        assert_eq!(definition.acp_command.as_deref(), Some("buzz-acp"));
        assert_eq!(definition.provider.as_deref(), Some("openrouter"));
        assert_eq!(
            definition.model.as_deref(),
            Some("anthropic/claude-haiku-5.5")
        );
        assert_eq!(definition.respond_to.as_deref(), Some("owner-only"));
        assert!(definition.respond_to_allowlist.is_empty());
        assert_eq!(definition.parallelism, Some(10));
        assert_eq!(
            definition
                .env_vars
                .get("OPENROUTER_BASE_URL")
                .map(String::as_str),
            Some("https://eu.openrouter.ai/api/v1")
        );
    }

    #[test]
    fn an_empty_api_key_survives_as_an_empty_value_not_an_absent_one() {
        // The shape of the credential is the point: the field has to be
        // present and blank in the agent's env so its owner can see where the
        // key goes. A spec that dropped it would leave the user guessing.
        let definition = definition_from_spec(&spec("builtin:router"), "2026-11-03T00:00:00Z");
        assert_eq!(
            definition
                .env_vars
                .get("OPENROUTER_API_KEY")
                .map(String::as_str),
            Some("")
        );
    }

    #[test]
    fn an_absent_system_prompt_becomes_empty_so_the_record_stores_none() {
        let definition = definition_from_spec(&spec("builtin:router"), "2026-11-03T00:00:00Z");
        assert_eq!(definition.system_prompt, "");
        assert_eq!(definition.into_agent_record().system_prompt, None);
    }

    #[test]
    fn an_unflavored_build_bakes_nothing_and_seeds_nothing() {
        // The test binary is built without `BUZZ_BUILD_DEFAULT_AGENTS`, so
        // this is the trunk's behaviour, asserted rather than assumed: the
        // seam the flavored builds go through adds nothing to a plain Buzz.
        assert!(default_agent_definitions("2026-11-03T00:00:00Z").is_empty());
        assert_eq!(default_agent_order("builtin:router"), None);
    }

    #[test]
    fn validation_refuses_the_shapes_the_app_would_mis_seed() {
        let mut bad_id = spec("router");
        bad_id.id = "router".to_string();
        assert!(validate_default_agents(&[bad_id]).is_some());

        let duplicate = vec![spec("builtin:router"), spec("builtin:router")];
        assert!(validate_default_agents(&duplicate).is_some());

        let mut stray_allowlist = spec("builtin:router");
        stray_allowlist.respond_to_allowlist = vec!["ab".repeat(32)];
        assert!(validate_default_agents(&[stray_allowlist]).is_some());

        let mut reserved = spec("builtin:router");
        reserved
            .env_vars
            .insert("BUZZ_PRIVATE_KEY".to_string(), "nsec1...".to_string());
        assert!(validate_default_agents(&[reserved]).is_some());

        let mut both_avatars = spec("builtin:router");
        both_avatars.avatar = Some("flavors/avatars/router.jpg".to_string());
        assert!(validate_default_agents(&[both_avatars]).is_some());

        let mut escaping_avatar = spec("builtin:router");
        escaping_avatar.avatar_url = None;
        escaping_avatar.avatar = Some("../../../secrets/face.png".to_string());
        assert!(validate_default_agents(&[escaping_avatar]).is_some());

        let mut unpaintable = spec("builtin:router");
        unpaintable.avatar_url = None;
        unpaintable.avatar = Some("flavors/avatars/router.tiff".to_string());
        assert!(validate_default_agents(&[unpaintable]).is_some());

        assert_eq!(validate_default_agents(&[spec("builtin:router")]), None);
    }

    #[test]
    fn a_declared_avatar_path_is_the_shape_a_flavor_file_uses() {
        // The flavor-file half of the pair, which `bake_default_agents`
        // consumes: a path on its own validates, and the media type comes out
        // of the extension rather than out of the file.
        let mut declared = spec("builtin:router");
        declared.avatar_url = None;
        declared.avatar = Some("flavors/avatars/brawado-router.jpg".to_string());
        assert_eq!(validate_default_agents(&[declared]), None);

        assert_eq!(avatar_media_type("a/b/c.JPG"), Some("image/jpeg"));
        assert_eq!(avatar_media_type("a/b/c.png"), Some("image/png"));
        assert_eq!(avatar_media_type("a/b/c.svg"), Some("image/svg+xml"));
        assert_eq!(avatar_media_type("a/b/c.tiff"), None);
        assert_eq!(avatar_media_type("no-extension"), None);
    }

    #[test]
    fn a_baked_value_still_holding_a_path_seeds_no_picture_at_all() {
        // The one direction worth pinning: if a future bake forgot to move
        // `avatar` into `avatar_url`, the card must come out with no picture
        // rather than with an <img> pointed at a path that does not exist on
        // the user's machine.
        let mut unbaked = spec("builtin:router");
        unbaked.avatar_url = None;
        unbaked.avatar = Some("flavors/avatars/brawado-router.jpg".to_string());
        let definition = definition_from_spec(&unbaked, "2026-11-03T00:00:00Z");
        assert_eq!(definition.avatar_url, None);
    }
}
