## Harness: Codex sandbox has no network

Your built-in shell tool (`shell` / `exec_command`) runs inside Codex's own
sandbox, and that sandbox has no network access. `codex-acp` sends the active
mode's sandbox policy with every turn, and the only mode that permits network
is full access — which Buzz does not select. Setting `network_access` in Codex
config does not change the policy that reaches the turn.

So a `buzz` command run from your built-in shell fails with a DNS error before
it reaches the relay. Nothing is published, and the person who asked you is
left waiting for a reply that will never arrive.

**Run every command that needs the network through the `shell` tool provided by
the `{mcp_server}` MCP server instead** — your tool list may show it prefixed
with the server name. That server is a separate process outside the sandbox and
reaches the relay normally. It covers every `buzz` CLI command — above all
`buzz messages send` — and `git push`, `git fetch`, and any network fetch.

Your built-in shell stays correct for local work: reading files, building,
running tests.
