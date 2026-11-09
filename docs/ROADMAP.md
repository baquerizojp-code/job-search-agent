# Roadmap

- **M0** (done) Scaffold: monorepo, engine skeleton, skill skeleton, CI.
- **M1** (done: verified live with Claude connectors on 2026-10-27; Gmail app password + Apps Script path still untested live) Daily run on Gmail + Claude Code: Gmail IMAP, LinkedIn and generic extractors, LinkedIn and generic fetchers (Playwright), Apps Script tracker, `fetch` / `commit`, skill `run`.
- **M2** (done, live test with a new user pending) Onboarding: `cv import` (pdf, docx, md), interview that persists answers and asks for real metrics, profile and rubric, `cv lint` and `cv build` (docx, pdf), `cv` and `cv refresh` skill commands. LinkedIn profile sync moved here from M5 (`linkedin check` + browser-assisted paste).
- **M3** (documented, live test pending) Outlook through the Microsoft 365 MCP server or connectors (host-connector), Codex and Windows instructions. Optional later: an engine-side Outlook provider for cron runs without an agent tool.
- **M4** More sources: public feeds (Remotive, RemoteOK, We Work Remotely, Himalayas, GetOnBoard) and Indeed / Glassdoor / Wellfound email extractors.
- **M5** Follow-up and applying: status updates from emails, tailored CV and cover letter (`cv build --input` already renders a tailored file).
- **M6** Scheduling helpers (launchd, Task Scheduler, cron, cloud routines), `doctor`, import of older trackers, npm publish, Windows pass.
