//! Shared agent capabilities. Intake and scheduling belong to each entry point;
//! environment, credentials, adapter settings and prompt equipment belong here.
use crate::{
    build_mcp_servers, config::Config, current_working_directory, git, harness_prompt, observer,
    pool, relay, resolve_agent_owner, PromptContext,
};
use anyhow::Result;
use std::{collections::HashMap, time::Duration};
use uuid::Uuid;

pub(crate) enum SessionMode {
    Conversation,
    Task,
}

/// Own shared launch resources until all adapter work has been drained.
/// Add new runtime capabilities here, not separately to the CLI entry points.
pub(crate) struct AgentRuntime {
    config: Config,
    _git_environment: git::GitEnvironment,
}

impl AgentRuntime {
    pub(crate) fn prepare(mut config: Config) -> Result<Self> {
        let git_environment = git::GitEnvironment::for_config(&mut config)?;
        Ok(Self {
            config,
            _git_environment: git_environment,
        })
    }

    pub(crate) fn config(&self) -> &Config {
        &self.config
    }

    pub(crate) fn startup(&self, observer: Option<observer::ObserverHandle>) -> PoolStartup {
        PoolStartup::from_config(&self.config, observer)
    }

    pub(crate) fn prompt_context(
        &self,
        rest: relay::RestClient,
        channels: HashMap<Uuid, relay::ChannelInfo>,
        mode: SessionMode,
    ) -> Result<PromptContext> {
        make_prompt_context(&self.config, rest, channels, mode)
    }
}

#[derive(Clone)]
pub(crate) struct PoolStartup {
    pub(crate) agents: u32,
    pub(crate) command: String,
    pub(crate) args: Vec<String>,
    pub(crate) extra_env: Vec<(String, String)>,
    pub(crate) has_generated_codex_config: bool,
    pub(crate) model: Option<String>,
    pub(crate) effort_level: Option<String>,
    pub(crate) observer: Option<observer::ObserverHandle>,
}

impl PoolStartup {
    fn from_config(config: &Config, observer: Option<observer::ObserverHandle>) -> Self {
        Self {
            agents: config.agents,
            command: config.agent_command.clone(),
            args: config.agent_args.clone(),
            extra_env: config.persona_env_vars.clone(),
            has_generated_codex_config: config.has_generated_codex_config,
            model: config.model.clone(),
            effort_level: config.effort_level.clone(),
            observer,
        }
    }
}

fn make_prompt_context(
    config: &Config,
    rest_client: relay::RestClient,
    channels: HashMap<Uuid, relay::ChannelInfo>,
    mode: SessionMode,
) -> Result<PromptContext> {
    let base_prompt_content = config.base_prompt_content.as_ref();
    let cwd = current_working_directory()?;
    Ok(PromptContext {
        mcp_servers: build_mcp_servers(config),
        initial_message: config.initial_message.clone(),
        idle_timeout: Duration::from_secs(config.idle_timeout_secs),
        max_turn_duration: Duration::from_secs(config.max_turn_duration_secs),
        turn_liveness_interval: Duration::from_secs(config.turn_liveness_secs),
        dedup_mode: config.dedup_mode,
        system_prompt: config.system_prompt.clone(),
        session_title: config.session_title.clone(),
        team_instructions: config.team_instructions.clone(),
        base_prompt: if config.no_base_prompt {
            None
        } else {
            // Build standing context once under the configured policy, before
            // any session/new. Both modern ACP and legacy first-turn framing
            // consume this same assembled base (including custom base files).
            let base = base_prompt_content
                .map(String::as_str)
                .unwrap_or(include_str!("base_prompt.md"));
            Some(harness_prompt::compose_base_prompt(
                base,
                if matches!(mode, SessionMode::Task) {
                    harness_prompt::SessionModelFor::Task
                } else {
                    harness_prompt::SessionModelFor::Policy(config.session_policy)
                },
                &config.agent_command,
                &config.agent_args,
                &config.mcp_command,
            ))
        },
        heartbeat_prompt: config.heartbeat_prompt.clone(),
        cwd,
        rest_client: rest_client.clone(),
        channel_info: pool::ChannelInfoResolver::new(channels, rest_client),
        context_message_limit: config.context_message_limit,
        max_turns_per_session: config.max_turns_per_session,
        permission_mode: config.permission_mode,
        agent_keys: config.keys.clone(),
        agent_owner_pubkey: resolve_agent_owner(config)
            .as_deref()
            .and_then(|hex| nostr::PublicKey::from_hex(hex).ok()),
        memory_enabled: config.memory_enabled,
        harness_name: crate::config::normalize_agent_command_identity(&config.agent_command),
        relay_url: config.relay_url.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::build_mcp_servers_tests::test_config;

    /// `harness_prompt`'s own tests cover which runtimes get the addendum;
    /// this one covers that the standing context the harness actually hands an
    /// agent went through that function. Restoring the previous inline
    /// composition here would leave every test in that module passing.
    fn base_prompt_for(agent_command: &str, mcp_command: &str, mode: SessionMode) -> String {
        base_prompt_for_argv(agent_command, &[], mcp_command, mode)
    }

    fn base_prompt_for_argv(
        agent_command: &str,
        agent_args: &[&str],
        mcp_command: &str,
        mode: SessionMode,
    ) -> String {
        let mut config = test_config();
        config.agent_command = agent_command.into();
        config.agent_args = agent_args.iter().map(|arg| arg.to_string()).collect();
        config.mcp_command = mcp_command.into();
        let rest = relay::RestClient {
            http: reqwest::Client::new(),
            base_url: "http://localhost:3000".into(),
            keys: config.keys.clone(),
            auth_tag_json: None,
        };
        make_prompt_context(&config, rest, HashMap::new(), mode)
            .expect("prompt context should build")
            .base_prompt
            .expect("a base prompt is configured")
    }

    const CODEX_HEADING: &str = "## Harness: Codex sandbox has no network";

    #[test]
    fn codex_sessions_carry_the_sandbox_note_in_their_standing_context() {
        for mode in [SessionMode::Conversation, SessionMode::Task] {
            let prompt = base_prompt_for("codex-acp", "buzz-dev-mcp", mode);
            assert!(prompt.contains(CODEX_HEADING));
            assert!(prompt.contains("You are an agent operating inside Buzz"));
        }
    }

    #[test]
    fn other_runtimes_standing_context_is_untouched() {
        for command in ["goose", "claude-agent-acp"] {
            let prompt = base_prompt_for(command, "buzz-dev-mcp", SessionMode::Conversation);
            assert!(!prompt.contains("## Harness"));
        }
    }

    #[test]
    fn a_node_launched_codex_carries_the_note_and_a_custom_mcp_server_does_not() {
        // The two gates, through the context the harness actually hands an
        // agent: the runtime identity comes from `agent_args` under a launcher,
        // and the note is conditional on the dev-MCP server specifically.
        let launched = base_prompt_for_argv(
            "npx",
            &["@agentclientprotocol/codex-acp"],
            "buzz-dev-mcp",
            SessionMode::Conversation,
        );
        assert!(launched.contains(CODEX_HEADING));

        let custom = base_prompt_for_argv(
            "npx",
            &["@agentclientprotocol/codex-acp"],
            "/opt/corp/corp-mcp",
            SessionMode::Conversation,
        );
        assert!(!custom.contains("## Harness"));
    }

    #[test]
    fn no_base_prompt_still_means_no_base_prompt() {
        // The addendum rides on the composed base; `--no-base-prompt` agents
        // get neither it nor the session model, as before this change.
        let mut config = test_config();
        config.agent_command = "codex-acp".into();
        config.mcp_command = "buzz-dev-mcp".into();
        config.no_base_prompt = true;
        let rest = relay::RestClient {
            http: reqwest::Client::new(),
            base_url: "http://localhost:3000".into(),
            keys: config.keys.clone(),
            auth_tag_json: None,
        };
        assert!(
            make_prompt_context(&config, rest, HashMap::new(), SessionMode::Conversation)
                .expect("prompt context should build")
                .base_prompt
                .is_none()
        );
    }
}
