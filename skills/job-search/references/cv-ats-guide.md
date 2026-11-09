# ATS-friendly CV for remote roles

Write `<workspace>/cv/cv.md` from `cv/source.md` and `interview.md`. `jobsearch cv build` turns it into `cv.docx` and `cv.pdf` with a single-column template; the Markdown itself must already obey these rules, because the text is what an applicant tracking system parses.

The engine reads only this Markdown subset: `#` for the name, `##` for sections, `###` for each role or project, `- ` bullets, one-line paragraphs, `**bold**`, `*italic*` and `[text](url)`. Nothing else (no tables, HTML, images or nested bullets).

## Structure (in this order, these headings)

1. **Name line**, then one line with city and country, time zone (UTC±X), email, phone, LinkedIn URL, portfolio or GitHub. No photo, no address.
2. **Headline**: one line with the target role and the two or three strongest signals.
3. **Summary**: three or four sentences. State remote experience explicitly (years fully remote, distributed teams, time zones covered, async tools).
4. **Skills**: grouped lists, plain comma-separated text. Use the exact terms job postings use (both "Postgres" and "PostgreSQL" when relevant).
5. **Experience**: reverse chronological. For each role: `Title, Company` on one line, `Month YYYY to Month YYYY, Remote or City` on the next, then three to six bullets. Bullets start with a verb and carry a number where one exists (users, revenue, latency, team size). Mark remote roles as Remote.
6. **Projects** (optional): same format, for work that proves target-role skills.
7. **Education and certifications**: one line each.
8. **Languages**: with level.

## Improve, do not just reformat

The user should be able to see why the new CV is better. For every recent role:

- Rewrite each bullet as verb + what changed + a real number from the CV or the interview ("Cut manual data entry by 30 hours a week by building 40 CRM integrations", not "Responsible for integrations").
- Use only facts the user gave you. When a bullet needs a number you do not have, write `[confirm: <what is missing>]`, ask the user, and replace it. `jobsearch cv lint` refuses to build while any `[confirm: ...]` is left.
- Put the work that matches the target roles in `profile.md` first, and cut what the user said they no longer want to do.
- Add current work from the interview's opening confirmation.



- Single column, no tables, no text boxes, no columns, no icons, no graphics, no headers or footers that carry content.
- Standard section names exactly as above (Summary, Skills, Experience, Education). Parsers key on them.
- Dates as `Month YYYY`. No date ranges inside bullets.
- No first-person pronouns, no filler adjectives, no em dashes.
- Keywords come from the target roles in `profile.md`; mirror the vocabulary of the postings the user is targeting, but only for skills the user has.
- One to two pages. Cut the oldest roles to one line each before cutting recent bullets.
- Remote fit shows up three times: summary, the Remote marker on roles, and tools or practices in Skills (async communication, documentation, overlap hours).
- Keep the file in the workspace language unless the user targets postings in another language; then write the CV in the postings' language.

## Check, review, build

1. `jobsearch cv lint`. Errors (tables, em dashes, missing sections, `[confirm: ...]` left) must be fixed. Fix the warnings too, or tell the user why one stays (for example, a role that really was on-site).
2. Show the user a short summary of what changed against `cv/source.md`: sections added or renamed, bullets rewritten with numbers, roles shortened or cut. Then the full CV. Adjust until they approve.
3. `jobsearch cv build`. It writes `cv/cv.docx` and `cv/cv.pdf` (Letter paper for time zones in the Americas, A4 elsewhere; `--paper` overrides) and reports the PDF page count. Tell the user where both files are. No Chromium: `jobsearch cv build --no-pdf` and they export the PDF from Word.

## Tailored version (milestone 5)

For `apply`, copy `cv/cv.md` to `cv/tailored/<company>-<role>/cv.md` and change only: headline, summary, the order of skill groups and bullets, and up to three bullets rewritten to the posting's vocabulary. Never add experience the user does not have. Build it with `jobsearch cv build --input cv/tailored/<company>-<role>/cv.md`.
