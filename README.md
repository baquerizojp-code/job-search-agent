# job-search-agent

A job-hunting assistant that lives inside your AI coding agent (Claude Code or Codex). It reads the job-alert emails you already get, scores every vacancy 1-10 against your profile, and keeps a Google Sheet tracker up to date, every day, without you opening a single alert.

> **Status: early beta.** The daily run is verified live with Claude Code. Onboarding works but has not been tested by many people yet, and several pieces (CV as docx/PDF, Outlook, tailored CVs) are still on the roadmap. See [Status](#status).

## How it works

You set it up once with your agent (about 20 minutes):

1. **Your CV.** Hand it over in any format (PDF, Word, Markdown).
2. **A short interview.** Eight questions: roles you want and don't want, where you live and which time zones you cover, work authorization, salary target and floor, dealbreakers, skills your CV undersells, and the kind of company and product you're after. Up to five more only if your CV leaves gaps.
3. **Your profile and scoring rubric.** The agent writes both from your CV and answers. Every vacancy is scored against them. You review and correct them once.
4. **An ATS-friendly CV for remote roles.** Single column, standard sections, your remote experience up front.
5. **Your mailbox and your tracker.** The agent connects to the mailbox where your job alerts arrive and creates a Google Sheet with two tabs: `Jobs` (worth a look) and `Skipped` (everything else, kept so nothing is scored twice).
6. **A first run together,** then a **daily schedule**, either on your computer or in the cloud.

Then, every day:

- New alert emails are read (LinkedIn today; more boards coming).
- Each vacancy is opened and its full description read.
- Your agent scores it: **7-10 Apply**, **5-6 Review**, **1-4 Skip**, with a one-line reason and any red flags (on-site, wrong country, salary below your floor, agency posting...).
- Apply and Review go to `Jobs`; the rest to `Skipped`. Closed postings are recognized and filed as closed.
- Processed emails get a `Job Search/Processed` label so they are never read twice.
- You get a short report. You update the `Status` column when you apply.

**What you need:** job alerts set up on LinkedIn (or other boards) and emailed to a Gmail or Outlook inbox; a Google account; Node 20+; Claude Code or Codex on macOS or Windows.

## Install

The easiest way: open Claude Code or Codex in an empty folder and say:

> Clone https://github.com/baquerizojp-code/job-search-agent, read its AGENTS.md, install it for me and set up my job search.

The agent follows [AGENTS.md](AGENTS.md), which has the exact steps. If you prefer to do it yourself:

```bash
git clone https://github.com/baquerizojp-code/job-search-agent.git
cd job-search-agent
corepack enable
pnpm install
pnpm build
cd packages/engine && npm link && cd ../..
npx playwright install chromium
```

Then copy `skills/job-search` to `~/.claude/skills/` (Claude Code) and/or `~/.agents/skills/` (Codex), start a new session and say **"set up my job search"**.

## Two ways to connect your mail and Sheet

- **Through your agent's connectors (simplest).** If your agent already has Gmail and Google Sheets access (claude.ai connectors in Claude Code, plugins in Codex), the agent reads the alerts and writes the rows itself. Nothing else to configure.
- **Through the engine.** Gmail with an app password (2-Step Verification on, two minutes, no Google Cloud project), and a Google Sheet of your own with a small Apps Script you paste and deploy once ([templates/sheet/README.md](templates/sheet/README.md)). This works from any agent and from scheduled jobs on your computer.

## Privacy

Everything runs on your machine and your own accounts. Your CV, profile, rubric and run history live in `~/job-search/`. Passwords and the Sheet script URL live in `~/.job-search/secrets.json`, are typed into the tool's own prompts, and never pass through the AI agent or into logs. Nothing is sent to the author of this project.

## Status

| | |
|---|---|
| Daily run with Claude Code connectors (Gmail + Google Sheets) | working, verified live |
| LinkedIn alerts (including alerts you forward from another inbox) | working |
| Interview, profile, rubric, ATS CV in Markdown | working, beta |
| Gmail app password + Apps Script Sheet | built, first live test pending |
| CV exported as Word and PDF | planned (M2) |
| Outlook | planned (M3) |
| Indeed, Glassdoor, Wellfound, Remotive, We Work Remotely, Himalayas, GetOnBoard | planned (M4); other boards' links are picked up generically meanwhile |
| Status updates from rejection/interview emails, CV and cover letter per vacancy, LinkedIn profile sync | planned (M5) |
| One-command scheduling, npm package | planned (M6) |

Full roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## How it's built

- **The skill** ([skills/job-search/SKILL.md](skills/job-search/SKILL.md)) is what your agent follows. Standard [Agent Skills](https://agentskills.io) format, so it works in Claude Code, Codex and other agents that read `SKILL.md`.
- **The engine** ([packages/engine](packages/engine)) is a Node CLI, `jobsearch`, that does the mechanical, repeatable work: mailbox, job pages, Google Sheet, validation. It has no AI inside and needs no API key; your agent does the reading, scoring and writing.

Contributing: see the last section of [AGENTS.md](AGENTS.md). Gates: `pnpm typecheck && pnpm test && pnpm build`.

## License

MIT
