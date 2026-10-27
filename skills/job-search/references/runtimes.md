# Claude Code vs Codex, macOS vs Windows

The skill and the engine are the same everywhere. What changes is where things live, how commands are approved, and how runs are scheduled. Detect where you are (`node -p process.platform`: `darwin` or `win32`) and use the matching row.

## Paths

| | macOS | Windows |
|---|---|---|
| Workspace (user data) | `~/job-search` | `%USERPROFILE%\job-search` |
| Secrets | `~/.job-search/secrets.json` | `%USERPROFILE%\.job-search\secrets.json` |
| Claude Code skill | `~/.claude/skills/job-search/` | `%USERPROFILE%\.claude\skills\job-search\` |
| Codex skill | `~/.agents/skills/job-search/` | `%USERPROFILE%\.agents\skills\job-search\` |
| Codex config | `~/.codex/config.toml` | `%USERPROFILE%\.codex\config.toml` |
| Shell for commands | Terminal (zsh) | PowerShell or Windows Terminal |

`jobsearch` behaves the same on both. On Windows, `npm link` may need a terminal opened as a normal user (not elevated); if the command is still not found, open a new terminal so PATH refreshes, or run `node <repo>\packages\engine\dist\cli.js`.

## Invoking the skill

| | Claude Code | Codex |
|---|---|---|
| Interactive | `/job-search setup`, `/job-search run`, or plain language | `$job-search setup`, `$job-search run`, or plain language |
| Headless | `claude -p "/job-search run"` | `codex exec 'Use $job-search to do the daily run'` |

## Permissions and network

`jobsearch` needs the network (mailbox, LinkedIn, Google). It also writes inside the workspace.

- **Claude Code:** the first time, approve `jobsearch` commands and choose "always allow" for `Bash(jobsearch *)`. For headless runs use an explicit allowlist (below).
- **Codex:** the default sandbox blocks network for shell commands. During setup, either approve each `jobsearch` command when Codex asks, or enable network for workspace commands once in `config.toml`:

  ```toml
  [sandbox_workspace_write]
  network_access = true
  ```

  Without this, scheduled Codex runs fail at `jobsearch fetch` with network errors.

## Connectors and tools by runtime

| | Claude Code | Codex |
|---|---|---|
| Gmail | claude.ai Gmail connector (enable at claude.ai, Settings > Connectors; needs a claude.ai subscription login, not an API key) | Gmail plugin (`/plugins` in the CLI, Plugins tab in the desktop app) |
| Google Sheets | claude.ai Google Drive / Sheets connector | Google Drive plugin |
| Outlook personal | MCP server (mail-setup.md path 4) | MCP server (mail-setup.md path 4) |
| Outlook work | Microsoft 365 connector (admin consent) or MCP server | Outlook plugin if the org allows it, or MCP server |
| Browser | built-in browser or Claude in Chrome | Playwright MCP or the app's browser, if installed |

If the connector you need is missing, the engine paths always work: Gmail app password and the Apps Script Sheet.

## Scheduling

See [scheduling.md](scheduling.md).
