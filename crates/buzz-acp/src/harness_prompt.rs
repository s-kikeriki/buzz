//! Harness-specific standing context appended to the composed base prompt.
//!
//! The base prompt is engine-agnostic: every runtime gets the same Buzz
//! contract. A few runtimes constrain *how* an agent can carry that contract
//! out, and an agent cannot discover the constraint by trying — the failure
//! looks like a broken relay, not a blocked tool. Those go here, keyed on the
//! normalized agent command, so a Claude or goose agent never reads advice
//! about a sandbox it does not have.

use crate::{config::is_codex_agent, scope::SessionPolicy};

/// Standing context for the configured runtime, or `None` when it needs none.
///
/// Codex: its built-in shell is sandboxed without network, so `buzz` commands
/// run there fail with a DNS error (see [`crate::config::codex_network_env`]
/// for why the config override does not reach the turn). The dev-MCP `shell`
/// tool runs outside that sandbox and is the way out — which makes the note
/// conditional on a dev-MCP server actually being configured. Without one
/// there is no working path to recommend, and naming a tool the agent does not
/// have would send it looking for one.
pub(crate) fn harness_addendum(agent_command: &str, mcp_command: &str) -> Option<&'static str> {
    if mcp_command.trim().is_empty() {
        return None;
    }
    is_codex_agent(agent_command).then_some(include_str!("harness_codex.md"))
}

/// Assemble the standing prompt: base, session model, then harness context.
///
/// Harness context comes last so it qualifies the contract the agent has just
/// read — the Buzz CLI section tells it to publish, this tells it which tool
/// can. Custom base-prompt files flow through here too, the same way the
/// session model already applies to them: the constraint is a property of the
/// runtime, not of the instructions.
pub(crate) fn compose_base_prompt(
    base: &str,
    session_model: SessionModelFor,
    agent_command: &str,
    mcp_command: &str,
) -> String {
    let composed = match session_model {
        SessionModelFor::Task => format!("{base}\n\n{}", include_str!("session_model_task.md")),
        SessionModelFor::Policy(policy) => policy.append_session_model(base),
    };
    match harness_addendum(agent_command, mcp_command) {
        Some(addendum) => format!("{}\n\n{}", composed.trim_end(), addendum.trim_end()),
        None => composed,
    }
}

/// Which session-model section the composed prompt carries.
#[derive(Clone, Copy)]
pub(crate) enum SessionModelFor {
    Task,
    Policy(SessionPolicy),
}

#[cfg(test)]
mod tests {
    use super::*;

    const CODEX_HEADING: &str = "## Harness: Codex sandbox has no network";
    const MCP: &str = "/Applications/Buzz.app/Contents/MacOS/buzz-dev-mcp";

    #[test]
    fn codex_commands_get_the_sandbox_addendum() {
        // Every spelling `normalize_agent_command_identity` folds onto a Codex
        // identity, including the full path the desktop app actually passes.
        for command in [
            "codex",
            "codex-acp",
            "codex_acp",
            "CODEX-ACP",
            "codex-acp.cmd",
            "/Users/ian/Library/Application Support/Buzz/node-tools/bin/codex-acp",
        ] {
            assert_eq!(
                harness_addendum(command, MCP),
                Some(include_str!("harness_codex.md")),
                "{command} should be recognized as Codex"
            );
        }
    }

    #[test]
    fn other_runtimes_get_no_addendum() {
        for command in [
            "goose",
            "claude-agent-acp",
            "claude-code-acp",
            "buzz-agent",
            "buzz-pi-acp",
            "hermes",
            "",
        ] {
            assert_eq!(
                harness_addendum(command, MCP),
                None,
                "{command} must not read Codex sandbox advice"
            );
        }
    }

    #[test]
    fn codex_without_a_dev_mcp_server_gets_no_addendum() {
        // `BUZZ_ACP_MCP_COMMAND` defaults to empty, and `build_mcp_servers`
        // returns no servers for it. Pointing at a `shell` tool that is not in
        // the session would be worse than saying nothing.
        for mcp_command in ["", "   "] {
            assert_eq!(harness_addendum("codex-acp", mcp_command), None);
        }
    }

    #[test]
    fn addendum_names_the_mcp_server_and_rules_out_the_builtin_shell() {
        let addendum = include_str!("harness_codex.md");
        assert!(addendum.contains("buzz-dev-mcp"));
        assert!(addendum.contains("exec_command"));
        assert!(addendum.contains("buzz messages send"));
        // The config override is a dead end; an agent that believes otherwise
        // retries the built-in shell instead of switching tools.
        assert!(addendum.contains("network_access"));
    }

    #[test]
    fn composed_prompt_appends_the_addendum_after_the_session_model() {
        let base = "Base instructions.";
        for (session_model, session_heading) in [
            (SessionModelFor::Task, "## Task Session"),
            (
                SessionModelFor::Policy(SessionPolicy::Channel),
                "## Session Model",
            ),
            (
                SessionModelFor::Policy(SessionPolicy::Thread),
                "## Session Model",
            ),
        ] {
            let prompt = compose_base_prompt(base, session_model, "codex-acp", MCP);
            assert!(prompt.starts_with(base));
            assert_eq!(prompt.matches(session_heading).count(), 1);
            assert_eq!(prompt.matches(CODEX_HEADING).count(), 1);
            let session_model_at = prompt.find(session_heading).expect(session_heading);
            let harness_at = prompt.find(CODEX_HEADING).expect("harness section");
            assert!(
                session_model_at < harness_at,
                "harness context must qualify the contract the agent just read"
            );
        }
    }

    #[test]
    fn composed_prompt_for_other_runtimes_is_the_bare_session_model_composition() {
        // Pinned against the composition primitives rather than against
        // `compose_base_prompt` itself, so adding an addendum for another
        // runtime fails here instead of passing by self-comparison.
        for policy in [SessionPolicy::Channel, SessionPolicy::Thread] {
            assert_eq!(
                compose_base_prompt("Base.", SessionModelFor::Policy(policy), "goose", MCP),
                policy.append_session_model("Base.")
            );
        }
        assert_eq!(
            compose_base_prompt("Base.", SessionModelFor::Task, "goose", MCP),
            format!("Base.\n\n{}", include_str!("session_model_task.md"))
        );
    }
}
