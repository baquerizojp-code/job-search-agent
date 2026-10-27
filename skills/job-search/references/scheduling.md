# Scheduling the daily run

Offer the options that fit the user's app and mailbox path, recommend one, and set it up together. Do the first scheduled run while the user is watching, so any approval prompt is answered once with "always allow".

Whatever they pick, every option runs the same thing: the `run` command of this skill, in the workspace folder, with no questions.

## Recommended: the app's own scheduler

Easiest on both macOS and Windows, because it reuses the app's connectors, MCP servers and approvals. The computer must be on and the app open at the scheduled time; a missed run is caught up once when the app opens again.

**Claude Code desktop app:** Schedule (or ask "create a scheduled task") → name `job-search daily`, daily at a time the user is usually online, working folder = the workspace, prompt:

```
Scheduled, unattended run. Use the job-search skill and do the daily `run` exactly as SKILL.md describes. Do not ask questions; report at the end.
```

Set the task's permission mode so `jobsearch` commands and the mail and Sheets tools are allowed. Click "Run now" once and choose "always allow" on each prompt.

**Codex desktop app:** Scheduled → new task, daily, project = the workspace folder, prompt:

```
Scheduled, unattended run. Use $job-search and do the daily run exactly as its SKILL.md describes. Do not ask questions; report at the end.
```

Before the first run make sure `network_access = true` is set (runtimes.md), otherwise `jobsearch fetch` fails.

## Cloud (computer can be off): Claude Code routines only

`/schedule` in Claude Code, daily. Requirements, all of them:

- the workspace is a git repository pushed to a **private** GitHub repo, created with `jobsearch init --cloud` so the skill is inside it;
- `mail.provider` and `sheet.provider` are `host-connector`, using **claude.ai** connectors (Gmail, Google Drive/Sheets). MCP servers configured on the computer (like the Outlook one) are not available in the cloud, so Outlook personal accounts cannot use this option;
- the engine must be installable in the routine: add a setup step that clones this repo and runs `pnpm install && pnpm build && cd packages/engine && npm link`.

Commit and push run results from the routine if the user wants history; the Sheet is the record either way.

## Advanced: the operating system's scheduler

For users comfortable with the terminal, or when the app cannot stay open. It needs explicit permissions because nobody is there to approve.

**Command, Claude Code** (claude.ai subscription login required for connectors; add `"mcp__ms365__*"` for the Outlook MCP path, and the connector tool names for connector paths):

```
claude -p "/job-search run" --permission-mode dontAsk --allowedTools "Bash(jobsearch *)" "Read" "Write" "Edit"
```

**Command, Codex:**

```
codex exec --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true -C "<workspace>" 'Use $job-search to do the daily run, unattended.'
```

**macOS (launchd):** create `~/Library/LaunchAgents/dev.jobsearch.daily.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.jobsearch.daily</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd ~/job-search &amp;&amp; COMMAND_FROM_ABOVE &gt;&gt; logs/scheduled.log 2&gt;&amp;1</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
</dict></plist>
```

Then `launchctl load ~/Library/LaunchAgents/dev.jobsearch.daily.plist`. `-lc` loads the login shell so `node`, `claude`/`codex` and `jobsearch` are on PATH.

**Windows (Task Scheduler)**, in PowerShell:

```powershell
$cmd = 'Set-Location $env:USERPROFILE\job-search; COMMAND_FROM_ABOVE *>> logs\scheduled.log'
schtasks /create /tn "JobSearchDaily" /sc daily /st 08:30 /tr "powershell -NoProfile -Command `"$cmd`""
```

Check it with `schtasks /run /tn JobSearchDaily` and read `logs\scheduled.log`.

Write the choice into `config.json` under `schedule` (for example `{"schedule": {"kind": "claude-desktop", "time": "08:30"}}`) so later sessions know how the run is triggered.
