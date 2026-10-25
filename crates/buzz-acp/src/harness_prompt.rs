//! Harness-specific standing context appended to the composed base prompt.
//!
//! The base prompt is engine-agnostic: every runtime gets the same Buzz
//! contract. A few runtimes constrain *how* an agent can carry that contract
//! out, and an agent cannot discover the constraint by trying — the failure
//! looks like a broken relay, not a blocked tool. Those go here, keyed on the
//! normalized agent command, so a Claude or goose agent never reads advice
//! about a sandbox it does not have.

use crate::{config::is_codex_agent, mcp_server_name, scope::SessionPolicy};

/// The one MCP server known to expose the `shell` tool the Codex note points at.
const DEV_MCP_SERVER: &str = "buzz-dev-mcp";

/// Where the server's name is substituted into [`harness_codex.md`].
const MCP_SERVER_PLACEHOLDER: &str = "{mcp_server}";

/// Standing context for the configured runtime, or `None` when it needs none.
///
/// Codex: its built-in shell is sandboxed without network, so `buzz` commands
/// run there fail with a DNS error (see [`crate::config::codex_network_env`]
/// for why the config override does not reach the turn). The dev-MCP `shell`
/// tool runs outside that sandbox and is the way out.
///
/// Which makes the note conditional on **that** server, not on any MCP server.
/// `BUZZ_ACP_MCP_COMMAND` is operator-configurable, and the tool the note names
/// is `buzz-dev-mcp`'s: pointed at some other server, the note would name a
/// prefix the agent's tool list does not carry and a tool that server need not
/// have, which is worse than saying nothing — the agent would hunt for a way
/// out instead of using the shell it has. A custom server therefore gets
/// silence, and a Codex agent behind one is no worse off than before this note
/// existed.
///
/// The name is substituted rather than written into the file so the prompt and
/// `session/new` cannot disagree about it: both read [`mcp_server_name`], which
/// is case-preserving, so a `BUZZ-DEV-MCP.exe` on the path is quoted to the
/// agent the way the agent will see it.
pub(crate) fn harness_addendum(
    agent_command: &str,
    agent_args: &[String],
    mcp_command: &str,
) -> Option<String> {
    if !is_codex_agent(agent_command, agent_args) {
        return None;
    }
    let server = mcp_server_name(mcp_command)?;
    if !server.eq_ignore_ascii_case(DEV_MCP_SERVER) {
        return None;
    }
    Some(include_str!("harness_codex.md").replace(MCP_SERVER_PLACEHOLDER, server))
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
    agent_args: &[String],
    mcp_command: &str,
) -> String {
    let composed = match session_model {
        SessionModelFor::Task => format!("{base}\n\n{}", include_str!("session_model_task.md")),
        SessionModelFor::Policy(policy) => policy.append_session_model(base),
    };
    match harness_addendum(agent_command, agent_args, mcp_command) {
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

    /// The rendered note for a dev-MCP server at `MCP`.
    fn rendered() -> String {
        include_str!("harness_codex.md").replace(MCP_SERVER_PLACEHOLDER, DEV_MCP_SERVER)
    }

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
            "codex-acp.ps1",
            "/Users/ian/Library/Application Support/Buzz/node-tools/bin/codex-acp",
        ] {
            assert_eq!(
                harness_addendum(command, &[], MCP),
                Some(rendered()),
                "{command} should be recognized as Codex"
            );
        }
    }

    #[test]
    fn a_codex_launched_through_node_gets_it_too() {
        // The package is the runtime here; the command is a launcher.
        for (command, args) in [
            ("npx", vec!["@agentclientprotocol/codex-acp".to_string()]),
            (
                "node",
                vec!["/opt/codex-acp/dist/index.js".to_string()],
            ),
        ] {
            assert_eq!(
                harness_addendum(command, &args, MCP),
                Some(rendered()),
                "{command} {args:?} should be recognized as Codex"
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
                harness_addendum(command, &[], MCP),
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
            assert_eq!(harness_addendum("codex-acp", &[], mcp_command), None);
        }
    }

    #[test]
    fn a_custom_mcp_server_gets_no_addendum_either() {
        // `BUZZ_ACP_MCP_COMMAND` can point anywhere. The note names
        // `buzz-dev-mcp`'s `shell` tool, so under another server it would name
        // both a prefix the agent's tool list does not carry and a tool that
        // server need not have.
        for mcp_command in [
            "/opt/corp/corp-mcp",
            "/usr/local/bin/filesystem-mcp-server",
            "sprig",
            "mcp",
        ] {
            assert_eq!(
                harness_addendum("codex-acp", &[], mcp_command),
                None,
                "{mcp_command} must not be described as the dev-MCP server"
            );
        }
    }

    #[test]
    fn the_note_quotes_the_server_name_the_agent_will_see() {
        // `build_mcp_servers` names the server from the command's file stem and
        // preserves its case, so that is the prefix in the agent's tool list.
        // The note has to say the same thing — and must never ship the raw
        // placeholder to an agent.
        //
        // Paths here are POSIX: both sides derive the name through
        // `std::path::Path`, so separator handling is the host's, and the host
        // is also where the command was resolved. A Windows path would assert
        // Windows `Path` semantics on whatever machine runs the suite.
        for (mcp_command, expected) in [
            (MCP, DEV_MCP_SERVER),
            // `.exe` comes off the stem on every platform; only the separator
            // is platform-dependent.
            ("buzz-dev-mcp.exe", DEV_MCP_SERVER),
            ("/opt/buzz/BUZZ-DEV-MCP", "BUZZ-DEV-MCP"),
        ] {
            let addendum = harness_addendum("codex-acp", &[], mcp_command)
                .unwrap_or_else(|| panic!("{mcp_command} is the dev-MCP server"));
            assert!(
                addendum.contains(&format!("`{expected}` MCP server")),
                "{mcp_command} must be quoted as {expected}: {addendum}"
            );
            assert!(
                !addendum.contains(MCP_SERVER_PLACEHOLDER),
                "the placeholder must never reach an agent: {addendum}"
            );
        }
    }

    #[test]
    fn addendum_names_the_mcp_server_and_rules_out_the_builtin_shell() {
        let addendum = harness_addendum("codex-acp", &[], MCP).expect("Codex with the dev-MCP");
        assert!(addendum.contains(DEV_MCP_SERVER));
        assert!(addendum.contains("exec_command"));
        assert!(addendum.contains("buzz messages send"));
        // The config override is a dead end; an agent that believes otherwise
        // retries the built-in shell instead of switching tools.
        assert!(addendum.contains("network_access"));
        // The template is what carries the substitution point; a note that
        // hard-coded the name again would pass every assertion above while
        // silently un-sharing the derivation.
        assert!(include_str!("harness_codex.md").contains(MCP_SERVER_PLACEHOLDER));
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
            let prompt = compose_base_prompt(base, session_model, "codex-acp", &[], MCP);
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
                compose_base_prompt("Base.", SessionModelFor::Policy(policy), "goose", &[], MCP),
                policy.append_session_model("Base.")
            );
        }
        assert_eq!(
            compose_base_prompt("Base.", SessionModelFor::Task, "goose", &[], MCP),
            format!("Base.\n\n{}", include_str!("session_model_task.md"))
        );
    }
}
