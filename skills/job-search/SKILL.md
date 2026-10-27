---
name: job-search
description: Automates a remote job search end to end. Reads job-alert emails (LinkedIn and other boards, Gmail or Outlook), scores every vacancy 1-10 against the user's profile and rubric, tracks everything in a Google Sheet, and builds the profile, ATS-friendly CV, tailored CVs and cover letters. Use for "job search", "score my job alerts", "run the job scorer", "set up my job hunt", "tailor my CV for this job", or when a scheduled run asks for it.
license: MIT
compatibility: Claude Code and Codex on macOS or Windows; Gmail or Outlook. Needs Node 20+ and the `jobsearch` CLI from the job-search-agent repo.
metadata:
  version: "0.1.0"
  repo: https://github.com/baquerizojp-code/job-search-agent
---

# Job search

Two layers. The **engine** (`jobsearch` CLI) does every deterministic step: mailbox, job pages, Google Sheet, files, validation. **You** do every step that needs judgment: interviewing the user, scoring postings, writing CVs and letters, classifying emails. You and the engine exchange JSON files inside the user's workspace (default `~/job-search`). Never paste long content through the terminal; write files.

Commands you support: `setup`, `run`, `status`, `apply <row or url>`, `cv refresh`, `linkedin-sync`. If the user's request does not name one, pick the closest. `status`, `apply`, `cv refresh` and `linkedin-sync` arrive in later milestones; tell the user so if they ask.

## Ground rules

- **Unattended runs never ask questions.** When the prompt says the run is scheduled or autonomous, or when there is no user to answer, pick the documented default and keep going. Report at the end.
- **Secrets never pass through you.** Passwords and script URLs are typed by the user into `jobsearch` prompts and stored in `~/.job-search/secrets.json`. Do not read that file, do not echo it, do not put secrets in files you write.
- **The Sheet is the source of truth** for which jobs were already seen. Do not keep your own list.
- **Rows are written by the engine** (Apps Script mode) or by your Sheets tool from `commit.json` (host-connector mode). Never type into the spreadsheet through a browser; it is slow and corrupts rows.
- **Every engine command prints one JSON object on stdout.** Read it; it tells you what to do next (batches, pending URLs, deferred rows).
- **Know your runtime.** Claude Code or Codex, macOS or Windows: paths, approvals, network and scheduling differ. [references/runtimes.md](references/runtimes.md) has the table. On Codex, `jobsearch` needs network access approved (or enabled in `config.toml`) before anything works.

## Finding the engine

```
jobsearch --version
```

If that fails, the engine is not installed yet. It is not on npm yet: install it from a checkout of https://github.com/baquerizojp-code/job-search-agent following the "Install for a user" section of that repo's AGENTS.md (clone, `pnpm install`, `pnpm build`, `npm link` in `packages/engine`, `npx playwright install chromium`). Node 20 or newer is required. On Windows run these in PowerShell. Then `jobsearch doctor` tells you what is missing; fix what it lists before continuing.

Before setup, explain to the user in a few sentences what will happen (CV, short interview, profile and rubric, ATS CV, mailbox, Sheet, first run, daily schedule) and what is not built yet (CV as docx/PDF, Outlook, tailored CVs and cover letters, LinkedIn sync). AGENTS.md in the repo has a ready explanation.

## `setup` (first time, interactive)

Work through these in order. Each step is idempotent, so a `setup` after a partial one only fills gaps.

1. **Workspace.** `jobsearch init` (add `--language es` etc. and `--timezone` from what the user tells you; `--cv <file>` if they hand you a Markdown CV; `--cloud` only if they want cloud scheduling). Ask for their CV in any format; if it is PDF or docx, read it with your own file tools and save the text as `<workspace>/cv/source.md` yourself.
2. **Interview.** Follow [references/interview.md](references/interview.md): 8 fixed questions, up to 5 extra only when the CV leaves real gaps. One question at a time, in the workspace language.
3. **Profile and rubric.** Write `<workspace>/profile.md` using [references/profile-template.md](references/profile-template.md) and `<workspace>/rubric.md` using [references/rubric-template.md](references/rubric-template.md). Show the user both and adjust until they agree. Be calibrated, not flattering.
4. **CV.** Write `<workspace>/cv/cv.md` following [references/cv-ats-guide.md](references/cv-ats-guide.md) (milestone 2 adds `jobsearch cv build` for docx and pdf).
5. **Mailbox.** Gmail or Outlook. Follow [references/mail-setup.md](references/mail-setup.md): it picks one of five paths (Gmail connector, Gmail app password, Outlook connector, Outlook MCP server, webmail in the browser) from what the user has and what tools you have, and says how each one runs unattended. Then confirm the user has at least one job alert set up on LinkedIn (and other boards they use), emailed to this mailbox. Without alerts there is nothing to read.
6. **Tracker.** The tracker is always a Google Sheet, also for Outlook users (a free Google account is enough). You have a Google Sheets or Drive tool: create a spreadsheet named "Job search tracker" with tabs `Jobs` and `Skipped`, header row exactly `Date | Source | Company | Role | Location | Link | Score | Verdict | Match Summary | Red Flags | Status | Status Updated | Notes | Job ID`, then `jobsearch sheet setup --provider host-connector --sheet-url <url> -y`. No tool: `jobsearch sheet setup` interactively, which walks the user through creating a Sheet and deploying the Apps Script from templates/sheet/README.md.
7. **Check.** `jobsearch doctor` must be all green. Then do one `run` together with the user watching.
8. **Schedule.** Offer the options from [references/scheduling.md](references/scheduling.md) that fit their app, OS and mailbox path, recommend the app's own scheduler, set it up, and record it in `config.json` under `schedule`.

## `run` (daily, works unattended)

```
jobsearch fetch
```

In host modes you first collect the emails yourself, then call `ingest` instead of `fetch`:

- **host-connector:** search the mailbox with your mail tool (Gmail connector or plugin, Outlook connector, or the Outlook MCP server; exact queries per provider in [references/mail-setup.md](references/mail-setup.md)) for messages from the senders in `config.json` (`mail.senders`), newer than `mail.lookbackDays` days, not yet in `mail.folders.processed`. Write them to `<workspace>/runs/<today>/emails.json` as `{ "provider": "host-connector", "messages": [{ "id", "threadId", "from", "subject", "date", "text", "html" }] }` (include the HTML body when the tool gives it; LinkedIn links live there). Then `jobsearch ingest --input <that file>`.
  Alert emails are large (50-80k characters of HTML). If your mail tool saves an oversized result to a file instead of returning it, do not read that file into your context: convert it with a shell tool. For a Gmail `get_thread` result saved as JSON: `jq -s '{provider:"host-connector", messages:[.[]|.messages[]|{id, threadId, from:.sender, subject, date, text:(.plaintextBody//""), html:(.htmlBody//"")}]}' <saved files> > emails.json`. Forwarded alerts work too; the LinkedIn extractor recognizes them by their job links, so add the forwarding address to `mail.senders`.
- **host-browser:** open the webmail, search `from:<sender>` for each sender, open each unread alert, and save the same JSON with the visible text and the job links you can read. Then `ingest`.
- **Sheet in host-connector mode:** before `fetch`/`ingest`, read both tabs with your Sheets tool and save `<workspace>/runs/<today>/rows.json` as `{ "Jobs": [[...row values...]], "Skipped": [[...]] }` (arrays in header order, or objects keyed by header). Pass `--sheet-rows <file>` to `fetch`/`ingest` and to `commit`. This is how dedup works in that mode.

Read the JSON the engine prints. Then:

1. **Pending postings.** If `pending > 0` and you have a browser: open each URL in `runs/<today>/pending-urls.json`, read title, company, location and the full description (click "Show more" first on LinkedIn), and save `runs/<today>/postings.json` as an array of `{ "url", "title", "company", "location", "description", "closed": false }`. Then `jobsearch fetch --postings runs/<today>/postings.json`. No browser, or unattended without one: skip this step; the engine retries those jobs in later runs.
2. **Score.** For every `runs/<today>/batch-NN.json` write `runs/<today>/scores-NN.json` exactly as [references/scoring.md](references/scoring.md) says. Score one posting at a time, all of them, before moving to the next batch.
3. **Commit.** `jobsearch commit`. Exit code 2 means some scores were rejected: read `runs/<today>/commit-errors.json`, fix those entries in the scores files (the usual causes: the five dimensions do not add up to `total`, or `verdict` does not match the band), and run `commit` again.
4. **Host modes only.** `commit.json` lists what the engine could not do itself:
   - `appendRows.Jobs` and `appendRows.Skipped`: append these value arrays to the matching tab with your Sheets tool, in one call per tab.
   - `processedMessageIds`: Gmail: add the `mail.folders.processed` label and remove `INBOX` and `UNREAD`. Outlook: mark read and move to the Processed folder. Webmail: the same by hand in the page.
5. **Report.** Show `runs/<today>/report.md` to the user (or return it as the result of a scheduled run). Keep the prose short; the table is the report.

If `fetch` says `messages: 0`, there is nothing new: say so and stop.

## Later commands

- `status`: classify new emails from companies the user applied to and update the Status column (milestone 5, [references/status-classifier.md](references/status-classifier.md)).
- `apply <row or url>`: tailored CV and cover letter for one vacancy (milestone 5).
- `cv refresh`: re-ask one interview dimension and regenerate the CV (milestone 2).
- `linkedin-sync`: paste the updated profile into LinkedIn section by section with the user confirming each save (milestone 5, [references/linkedin-sync.md](references/linkedin-sync.md)).

## When something fails

- `jobsearch` prints `{"ok": false, "error": ...}`: read the error. Mailbox login errors mean the app password or 2-Step Verification; Sheet errors mean the web app URL, the secret, or a missing authorization. Run `jobsearch doctor` and fix the red item; do not edit the engine.
- A job page shows a login wall or a bot check: leave it pending; never try to log in on the user's behalf or solve a CAPTCHA.
- Logs with secrets redacted are in `<workspace>/logs/<date>.log`.
