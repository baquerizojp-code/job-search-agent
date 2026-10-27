# Scheduling the daily run

Offer both and let the user choose. Explain the trade-off in two sentences: local runs use the machine's own credentials and browser but need the computer awake; cloud runs are hands-off but only see what is committed in the workspace repo and only use host connectors.

## Local (recommended first)

`jobsearch schedule --local` (milestone 6) writes the job; until then set it up by hand:

- **macOS**: a launchd agent in `~/Library/LaunchAgents/dev.jobsearch.daily.plist` that runs once a day:
  - Claude Code: `claude -p "/job-search run" --permission-mode acceptEdits` from the workspace folder.
  - Codex: `codex exec '$job-search run' --sandbox workspace-write` from the workspace folder (verify `$job-search` loads in `exec`; if not, use `codex exec "Read .agents/skills/job-search/SKILL.md and execute the run command"`).
- **Windows**: Task Scheduler (`schtasks /create /sc daily /tn JobSearch /tr "..."`) with the same command in PowerShell.
- **Claude Code desktop app**: a local scheduled task also works (`~/.claude/scheduled-tasks/`), only while the app is open.

The first scheduled run should happen while the user is around, so they see the report and the Sheet rows.

## Cloud

- **Claude Code routines** (`/schedule`): the workspace must be a git repository pushed to GitHub, with the skill copied inside it (`jobsearch init --cloud`), `mail.provider` and `sheet.provider` set to `host-connector`, and the Gmail and Google Sheets connectors enabled on claude.ai. Minimum interval is one hour; daily is the sensible choice.
- **Codex scheduled tasks**: available in the Codex desktop app (runs locally while the app is open) and on the web; the Gmail and Google Drive plugins must be enabled.

Whatever they pick, write the choice into `config.json` under `schedule` so `doctor` can report it.
