# job-search-agent

A job-hunting assistant that lives inside your AI coding agent (Claude Code or Codex). It reads the job-alert emails you already get, scores every vacancy 1-10 against your profile, and keeps a Google Sheet tracker up to date, every day, without you opening a single alert.

> **Status: early beta.** The daily run is verified live with Claude Code. The CV and LinkedIn tools are new and Codex has not been tested live yet, so expect rough edges and please report them. See [Status](#status).

## How it works

You set it up once with your agent (about 20 minutes):

1. **Your CV.** Hand it over in any format (PDF, Word, Markdown).
2. **A short interview.** Eight questions: roles you want and don't want, where you live and which time zones you cover, work authorization, salary target and floor, dealbreakers, skills your CV undersells, and the kind of company and product you're after. Up to five more only if your CV leaves gaps.
3. **Your profile and scoring rubric.** The agent writes both from your CV and answers. Every vacancy is scored against them. You review and correct them once.
4. **A better CV, ready to send.** The agent rewrites your bullets with the real numbers you gave it (it never invents them), shows you what changed, and builds `cv.docx` and `cv.pdf`: single column, standard sections, your remote experience up front, readable by applicant tracking systems.
5. **Your LinkedIn, if you want.** The agent drafts your headline, About and experience to fit LinkedIn's limits, then pastes them section by section in your browser, waiting for your OK before every save.
6. **Your mailbox and your tracker.** The agent connects to the mailbox where your job alerts arrive and creates a Google Sheet with two tabs: `Jobs` (worth a look) and `Skipped` (everything else, kept so nothing is scored twice).
7. **A first run together,** then a **daily schedule**, either on your computer or in the cloud.

Then, every day:

- New alert emails are read (LinkedIn today; more boards coming).
- Each vacancy is opened and its full description read.
- Your agent scores it: **7-10 Apply**, **5-6 Review**, **1-4 Skip**, with a one-line reason and any red flags (on-site, wrong country, salary below your floor, agency posting...).
- Apply and Review go to `Jobs`; the rest to `Skipped`. Closed postings are recognized and filed as closed.
- Processed emails get a `Job Search/Processed` label so they are never read twice.
- You get a short report. You update the `Status` column when you apply.

**What you need:** job alerts set up on LinkedIn (or other boards) and emailed to a Gmail or Outlook inbox; a Google account for the tracker (free is fine, also for Outlook users); Node 20+ and git; Claude Code or Codex on macOS or Windows.

## Start with your CV

You can use only the CV part, with no mailbox or tracker. Open Codex or Claude Code in an empty folder and paste this (put the path to your CV where it says so):

```text
Clone https://github.com/baquerizojp-code/job-search-agent, read its AGENTS.md and install it for me.
Ask before any step that needs network or writes outside this folder.
Then use the job-search skill with the `cv` command, in English:
1. Import my CV from <PATH TO MY CV, PDF OR WORD> with `jobsearch cv import`.
2. Interview me one question at a time. Ask what changed since this CV and ask for real numbers
   on my recent roles. Never invent metrics.
3. Write my profile and an improved ATS-friendly CV for remote roles, show me what you changed
   versus my original, and adjust until I approve.
4. Run `jobsearch cv lint` and `jobsearch cv build`, and tell me where cv.docx and cv.pdf are.
Do not touch LinkedIn yet.
```

When the CV is final, update LinkedIn with: *"Use the job-search skill to sync my LinkedIn profile from my new CV. Show me each section and wait for my OK before every save."* You need to be signed in to LinkedIn in a browser your agent can use (see [linkedin-sync.md](skills/job-search/references/linkedin-sync.md)); without one, the agent gives you the text to paste.

## Install

The easiest way: open Claude Code or Codex in an empty folder and say:

> Clone https://github.com/baquerizojp-code/job-search-agent, read its AGENTS.md, install it for me and set up my job search.

The agent follows [AGENTS.md](AGENTS.md), which has the exact steps. If you prefer to do it yourself:

```bash
git clone https://github.com/baquerizojp-code/job-search-agent.git
cd job-search-agent
corepack enable   # Node 25+ no longer ships corepack: use `npm install -g pnpm` instead
pnpm install
pnpm build
cd packages/engine && npm link && cd ../..
npx playwright install chromium
```

Then copy `skills/job-search` to `~/.claude/skills/` (Claude Code) and/or `~/.agents/skills/` (Codex), start a new session and say **"set up my job search"**. On Windows use PowerShell; the folders are under `%USERPROFILE%`. On Codex, allow network for commands when asked (or see [runtimes.md](skills/job-search/references/runtimes.md)).

## Gmail or Outlook, Claude or Codex

The agent picks the simplest option for your setup during onboarding:

- **Gmail:** through your agent's Gmail connector (Claude Code) or plugin (Codex), or with a Gmail app password (2-Step Verification on, two minutes, no Google Cloud project).
- **Outlook (personal or work):** through a small open-source Microsoft 365 server the agent adds for you; you sign in once with a code, no Azure setup. Work accounts can also use the Microsoft 365 connector or Outlook plugin.
- **The tracker** is a Google Sheet: the agent writes it with its Sheets tool, or the tool writes it through a small script you paste into the Sheet once ([templates/sheet/README.md](templates/sheet/README.md)).
- **Daily schedule:** in the Claude or Codex desktop app (easiest, on Mac and Windows), in the cloud with Claude routines, or with the system scheduler. Details: [scheduling.md](skills/job-search/references/scheduling.md).

## Privacy

Everything runs on your machine and your own accounts. Your CV, profile, rubric and run history live in `~/job-search/`. Passwords and the Sheet script URL live in `~/.job-search/secrets.json`, are typed into the tool's own prompts, and never pass through the AI agent or into logs. Nothing is sent to the author of this project.

## Status

| | |
|---|---|
| Daily run with Claude Code connectors (Gmail + Google Sheets) | working, verified live |
| LinkedIn alerts (including alerts you forward from another inbox) | working |
| Interview, profile, rubric | working, beta |
| Improved CV as Markdown, Word and PDF (`jobsearch cv import / lint / build`) | built and tested, beta |
| LinkedIn profile sync, browser-assisted with a confirmation per save | built, first live run pending |
| Gmail app password + Apps Script Sheet | built, first live test pending |
| Outlook (personal and work) through the Microsoft 365 MCP server | documented, first live test pending |
| Codex, Windows | documented and path-safe, first live test pending |
| Indeed, Glassdoor, Wellfound, Remotive, We Work Remotely, Himalayas, GetOnBoard | planned (M4); other boards' links are picked up generically meanwhile |
| Status updates from rejection/interview emails, CV and cover letter per vacancy | planned (M5) |
| One-command scheduling, npm package | planned (M6) |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## How it's built

- **The skill** ([skills/job-search/SKILL.md](skills/job-search/SKILL.md)) is what your agent follows. Standard [Agent Skills](https://agentskills.io) format, so it works in Claude Code, Codex and other agents that read `SKILL.md`.
- **The engine** ([packages/engine](packages/engine)) is a Node CLI, `jobsearch`, that does the mechanical, repeatable work: mailbox, job pages, Google Sheet, validation. It has no AI inside and needs no API key; your agent does the reading, scoring and writing. It also checks the CV against ATS rules and renders it to Word and PDF.

Contributing: see the last section of [AGENTS.md](AGENTS.md). Gates: `pnpm typecheck && pnpm test && pnpm build`.

## License

MIT
