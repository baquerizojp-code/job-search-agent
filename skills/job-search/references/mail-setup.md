# Connecting the mailbox

Goal: the daily run can (1) find the job-alert emails, (2) read their full body, including HTML, and (3) label or move them once processed so they are never read twice. Pick the first path that applies, top to bottom. Tell the user which one you chose and why in one sentence.

| # | User has | You (the agent) have | Path | Engine `mail.provider` |
|---|---|---|---|---|
| 1 | Gmail | Gmail tools (claude.ai Gmail connector; Codex Gmail plugin) | **Gmail connector** | `host-connector` |
| 2 | Gmail | no Gmail tools, or a scheduled run will happen outside this app | **Gmail app password** | `gmail-imap` |
| 3 | Outlook (work/school) | Microsoft 365 tools (claude.ai Microsoft 365 connector; Codex Outlook plugin) | **Outlook connector** | `host-connector` |
| 4 | Outlook (any, incl. outlook.com / hotmail) | can add an MCP server | **Outlook MCP server** | `host-connector` |
| 5 | Any webmail | a browser tool, nothing else | **Webmail in the browser** | `host-browser` |

Check before choosing: the account your tools are connected to must be the one that receives the alerts. Search it for the alert senders first (path 1, 3, 4). If the alerts arrive elsewhere, either connect the right account or have the user forward a couple of alerts to test, and add the forwarding address to `mail.senders` in `config.json` (forwarded LinkedIn alerts are recognized by their links).

Folder names (create them once, on any provider): `Job Search/Alerts`, `Job Search/Processed`, `Job Search/Applications`. In Gmail they are nested labels; in Outlook a folder `Job Search` with three child folders.

## 1. Gmail connector

1. `jobsearch mail setup --provider host-connector -y`
2. Create the three labels with your label tool (nested names with `/` create the parent automatically). Note their ids.
3. Daily: search `from:(<sender1> OR <sender2>) newer_than:<lookbackDays>d -label:"Job Search/Processed"`, fetch each thread with full content (HTML included), export to `runs/<date>/emails.json` (SKILL.md shows the `jq` recipe when results are saved to files), then `jobsearch ingest`.
4. After `commit`: for each id in `commit.json.processedMessageIds`, add the `Job Search/Processed` label and remove `INBOX` and `UNREAD`.

Unattended runs: works in Claude Code local scheduled tasks and cloud routines (connectors are available there). In Codex, plugins inside scheduled tasks are not verified; prefer path 2 for Codex scheduling.

## 2. Gmail app password (engine reads Gmail itself)

Works from any agent, any OS, and from cron or Task Scheduler. No Google Cloud project.

1. The user turns on 2-Step Verification: https://myaccount.google.com/signinoptions/two-step-verification
2. The user creates an app password: https://myaccount.google.com/apppasswords (name it `job-search`). Google shows 16 letters once.
3. The **user** runs `jobsearch mail setup` in their own terminal and pastes it at the prompt. Do not ask them to paste it into the chat, and do not pass it with `--app-password` yourself. On Windows the terminal is PowerShell or Windows Terminal.
4. The command connects, creates the three labels, detects alert senders from the last 30 days and lets the user confirm them.
5. `jobsearch doctor` must show `mail: ok`.

If the user cannot see "App passwords": the account has no 2-Step Verification yet, uses only security keys, has Advanced Protection, or is a work account whose admin disabled them. Then use path 1 or 5.

Daily: `jobsearch fetch` reads, archives into `Job Search/Alerts`, and `jobsearch commit` labels them `Job Search/Processed` and marks them read. You do nothing with the mailbox.

## 3. Outlook connector

Only for **work or school** Microsoft 365 accounts (the claude.ai Microsoft 365 connector needs an organization admin's consent and does not accept outlook.com / hotmail / live addresses). Same flow as path 1 with your Outlook tools: search by sender and date in the inbox and in `Job Search/Alerts`, get each message with its HTML body, export, `ingest`; after `commit`, move each processed message to `Job Search/Processed` and mark it read. If the connector is read-only in this organization, you cannot move messages: tell the user and use path 4.

## 4. Outlook MCP server

Works with **personal** (outlook.com, hotmail.com, live.com) and **work** accounts, no Azure app registration: the open-source server `@softeria/ms-365-mcp-server` ships its own Microsoft app and logs in with a device code. It runs on macOS and Windows.

**Register it** (the user approves the command; it adds an MCP server to their agent):

| | Personal account | Work / school account |
|---|---|---|
| Claude Code, macOS | `claude mcp add ms365 --scope user --env MS365_MCP_TENANT_ID=consumers -- npx -y @softeria/ms-365-mcp-server --preset mail` | `claude mcp add ms365 --scope user -- npx -y @softeria/ms-365-mcp-server --preset mail --org-mode` |
| Claude Code, Windows | `claude mcp add ms365 --scope user --env MS365_MCP_TENANT_ID=consumers -- cmd /c "npx -y @softeria/ms-365-mcp-server --preset mail"` | same with `--org-mode` inside the quotes, no `--env` |
| Codex, both | add the block below to `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`) | same block, drop `env`, add `"--org-mode"` to `args` |

```toml
[mcp_servers.ms365]
command = "npx"
args = ["-y", "@softeria/ms-365-mcp-server", "--preset", "mail"]
env = { MS365_MCP_TENANT_ID = "consumers" }
startup_timeout_sec = 60
tool_timeout_sec = 120
```

If Codex on Windows cannot start it, use `command = "cmd"` and `args = ["/c", "npx", "-y", "@softeria/ms-365-mcp-server", "--preset", "mail"]`. `MS365_MCP_TENANT_ID=consumers` matters for personal accounts: without it the login dies after about an hour. Never add `--read-only`; the run needs to move messages and mark them read.

**Log in once.** Restart the agent session so the server loads, then call its `login` tool; it returns a URL and a code. The user opens the URL, enters the code and signs in. `verify-login` confirms. Tokens stay on the user's machine (macOS Keychain or Windows Credential Manager plus an encrypted file). Alternative from a terminal: `npx @softeria/ms-365-mcp-server --login` with the same `MS365_MCP_TENANT_ID` set.

**Then:** `jobsearch mail setup --provider host-connector -y`. Create the folders with `list-mail-folders`, `create-mail-folder` (`Job Search`) and `create-mail-child-folder` (`Alerts`, `Processed`, `Applications`); note their ids.

**Daily:**
1. `list-mail-messages` with `$filter=receivedDateTime ge <date> and from/emailAddress/address eq '<sender>'` for each sender in `mail.senders` (or `$search="linkedin.com/comm/jobs"` for forwarded alerts), `$select=id,subject,from,receivedDateTime,parentFolderId`. Skip messages whose `parentFolderId` is the Processed folder.
2. `get-mail-message` for each; its `body.content` is the HTML. Write `runs/<date>/emails.json` (`html` = `body.content`, `text` = `bodyPreview` or empty, `from` = sender address) and run `jobsearch ingest`.
3. After `commit`, for each id in `processedMessageIds`: `update-mail-message` with `{"isRead": true}`, then `move-mail-message` to the Processed folder id.

Unattended runs work wherever the MCP server is configured: Claude Code local scheduled tasks and `claude -p` (allow `mcp__ms365__*`), Codex scheduled tasks and `codex exec` (set `default_tools_approval_mode = "approve"` in the block above; verify on the first run). Not in Claude cloud routines, which only see claude.ai connectors.

## 5. Webmail in the browser

Last resort, and only while the user is around (it is slow and depends on the page layout). `jobsearch mail setup --provider host-browser -y`. Daily: open the webmail with the user's existing session, search for each sender, open every unread alert that has no `Job Search/Processed` label, copy the visible text and every job link into `emails.json` (`text` = visible text, `html` = the links as `<a href>` lines), `ingest`. After `commit`, apply the label or move the message in the same UI. Never type a password into a login page; if the session is logged out, stop and ask the user to sign in.
