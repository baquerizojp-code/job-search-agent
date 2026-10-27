# AGENTS.md

Instructions for an AI coding agent (Claude Code, Codex, or similar) that opens this repository. Read this file first; it tells you what the project is, how to install it for the person you are helping, and how to explain it to them.

## What this is, in one paragraph

`job-search-agent` turns the agent you are into a job-hunting assistant. Once set up, a daily run reads the job-alert emails the user already receives (LinkedIn first, other boards later), opens each vacancy, scores it 1-10 against the user's own profile, and records it in a Google Sheet tracker. Setup also interviews the user, writes that profile and a scoring rubric, and produces an ATS-friendly CV aimed at remote roles. The repo has two parts: a **skill** (`skills/job-search/SKILL.md`, the instructions you follow) and an **engine** (`packages/engine`, a Node CLI called `jobsearch` that does the mechanical work). There is no LLM API key anywhere: you do the reading, scoring and writing; the engine does mail, web pages, the Sheet and validation.

## Who are you talking to?

Decide before acting:

- **A user** ("set this up for me", "what does this do?", "help me find a job"): install it for them (below), then follow `skills/job-search/SKILL.md` → `setup`. Explain in plain language; they do not need to know about TypeScript or pnpm.
- **A contributor** ("fix this bug", "add Indeed support"): read "Working on the code" at the end.

## How to explain it to a user

Use your own words, in their language, and keep it short. The points that matter:

1. **What it needs from them:** their CV (any format), about 10 minutes for a short interview, job alerts set up on LinkedIn or other boards and emailed to a Gmail or Outlook mailbox, and a Google account for the tracker Sheet (also for Outlook users). It works in Claude Code or Codex, on macOS or Windows.
2. **What happens in setup (about 20 minutes, once):**
   - they hand over the CV;
   - you ask 8 short questions (target roles, roles to avoid, location and time zones, work authorization, compensation, dealbreakers, skills the CV undersells, company stage and domain), plus up to 5 more only if the CV leaves gaps;
   - you write their **profile** and **rubric** (what every vacancy is scored against) and they correct them once;
   - you write an **ATS-friendly CV** for remote roles;
   - you connect the mailbox and create the tracker Sheet;
   - you do the first run together so they see the result;
   - you offer a **daily schedule** (local on their computer, or in the cloud).
3. **What happens every day after that:** new alert emails are read, every vacancy is opened and scored, good matches (7-10 Apply, 5-6 Review) go to the `Jobs` tab, the rest to `Skipped`, processed emails are labeled so they are never read twice, and they get a short report. Their only job is to read the `Jobs` tab and update the `Status` column when they apply.
4. **Important nuance:** vacancies are scored against the profile and rubric, not against the CV file. The CV is the source the profile is built from, and the document they send when applying. If the CV changes a lot, the profile should be regenerated.
5. **Privacy:** everything stays on their machine and their own Google or Microsoft account. Passwords are typed into the `jobsearch` prompts, stored in `~/.job-search/secrets.json`, and never pass through you.

Be honest about what is not built yet (see "Status"). Do not promise tailored CVs, cover letters or LinkedIn profile sync until those milestones land.

## Install for a user

Requirements: Node 20 or newer (`node -v`), git, and either Claude Code or Codex, on macOS or Windows. The engine is not on npm yet, so it is installed from this checkout.

```bash
git clone https://github.com/baquerizojp-code/job-search-agent.git
cd job-search-agent
corepack enable          # provides pnpm; if not available: npm install -g pnpm
pnpm install
pnpm build
cd packages/engine && npm link && cd ../..   # puts `jobsearch` on the PATH
npx playwright install chromium               # browser used to read job pages
jobsearch --version
```

On Windows run the same commands in PowerShell (not as administrator); open a new terminal after `npm link` so PATH refreshes. If `jobsearch` is still not found, use `node <repo>\packages\engine\dist\cli.js` and tell the user.

**Codex:** shell commands have no network by default, and every step above needs it. Ask the user to approve when Codex prompts, or to enable it once in `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`):

```toml
[sandbox_workspace_write]
network_access = true
```

Then install the skill so it is available in every session:

- **Short path:** `npx skills add ./ -g -a claude-code -a codex` from the repo root (the cross-agent Agent Skills installer; asks before writing).
- **Manual path (always works):** copy the folder `skills/job-search` to
  - Claude Code: `~/.claude/skills/job-search/` (Windows: `%USERPROFILE%\.claude\skills\job-search\`)
  - Codex: `~/.agents/skills/job-search/` (Windows: `%USERPROFILE%\.agents\skills\job-search\`)

Start a new session and say "set up my job search" (Claude Code: `/job-search setup`; Codex: `$job-search setup`). From here, `skills/job-search/SKILL.md` is the source of truth.

## The workflow, end to end

```
setup (once, interactive)
  jobsearch init ─► interview ─► profile.md + rubric.md ─► cv/cv.md
  ─► jobsearch mail setup ─► jobsearch sheet setup ─► jobsearch doctor ─► first run ─► schedule

run (daily, can be unattended)
  mailbox ──► jobsearch fetch / ingest ──► runs/<date>/batch-NN.json
                                              │  (pending-urls.json: pages the engine could not read;
                                              │   you open them with your browser and call fetch --postings)
             you score each posting ──► runs/<date>/scores-NN.json
  jobsearch commit ──► validates scores, writes rows (or commit.json for you to write),
                       marks emails processed, writes runs/<date>/report.md
```

Which mailbox path to use (details in `skills/job-search/references/mail-setup.md`):

| User's mailbox | Claude Code | Codex |
|---|---|---|
| Gmail | Gmail connector (host-connector), or app password (engine) | app password (engine), or Gmail plugin (host-connector) |
| Outlook, personal (outlook.com, hotmail) | Outlook MCP server, no Azure setup (host-connector) | same |
| Outlook, work/school | Microsoft 365 connector or the MCP server (host-connector) | Outlook plugin or the MCP server (host-connector) |
| Anything else | webmail in the browser (host-browser), while the user watches | same, if a browser tool is installed |

The tracker is always a Google Sheet: written by the agent's Sheets/Drive tool when it has one (host-connector), otherwise by the engine through a small Apps Script web app the user deploys once (`templates/sheet/README.md`). Platform and runtime differences (paths, approvals, network, scheduling): `skills/job-search/references/runtimes.md` and `scheduling.md`.

Where the user's data lives: workspace `~/job-search/` (config, profile, rubric, CV, runs, logs); secrets `~/.job-search/secrets.json`. Neither is in this repo.

## Status

| Piece | State |
|---|---|
| Daily run with Claude connectors (Gmail + Sheets) | verified live 2026-10-27 |
| Gmail via app password, Sheet via Apps Script | built and unit-tested; not yet run against a real account |
| LinkedIn alerts, including forwarded ones | verified live |
| Other boards (Indeed, Glassdoor, Wellfound, feeds) | generic link extractor only; dedicated support is M4 |
| Interview, profile, rubric, ATS CV in Markdown | instructions in the skill; not yet run with a new user |
| CV as docx and PDF (`jobsearch cv build`) | not built (M2) |
| Outlook | through the agent: MCP server or connector (host-connector); documented, not yet run live |
| Status updates from emails, tailored CV and cover letter, LinkedIn sync | not built (M5) |
| Scheduling | documented per app and OS in `scheduling.md` (app scheduler, cloud routine, launchd, Task Scheduler); no helper command yet |
| Windows | code is path-safe and CI runs on Windows; not yet run on a real Windows machine |
| npm package | not published (M6); install from the clone |

Roadmap: `docs/ROADMAP.md`.

## Working on the code

- Layout: `packages/engine/src/{commands,core,providers/mail,providers/sheet,sources/email,fetchers,schema}`, tests in `packages/engine/test`, skill in `skills/job-search`, Apps Script in `templates/apps-script/Code.gs`.
- Gates before any PR: `pnpm typecheck && pnpm test && pnpm build`. CI runs them on Ubuntu and Windows.
- Contracts: every engine command prints one JSON object on stdout and logs to stderr and `<workspace>/logs/`. The Sheet header lives in `src/schema/sheet.ts` and in `Code.gs`; a test keeps them equal. Score rules (ranges, sum, verdict bands, visible 1-10) live in `src/schema/score.ts` and are restated in `skills/job-search/references/scoring.md`; change both together.
- Judgment stays in the skill, I/O stays in the engine. Do not add LLM calls to the engine.
- Never commit anyone's CV, profile, rubric, Sheet IDs, run files or secrets. Test fixtures use made-up people and `example.com`.
- Inside `page.evaluate` bodies avoid declaring inner functions (tsx injects a helper that does not exist in the page).
