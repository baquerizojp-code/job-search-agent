# ATS-friendly CV for remote roles

Write `<workspace>/cv/cv.md`. `jobsearch cv build` (milestone 2) turns it into docx and pdf with a single-column template; the Markdown itself must already obey these rules, because the text is what an applicant tracking system parses.

## Structure (in this order, these headings)

1. **Name line**, then one line with city and country, time zone (UTC±X), email, phone, LinkedIn URL, portfolio or GitHub. No photo, no address.
2. **Headline**: one line with the target role and the two or three strongest signals.
3. **Summary**: three or four sentences. State remote experience explicitly (years fully remote, distributed teams, time zones covered, async tools).
4. **Skills**: grouped lists, plain comma-separated text. Use the exact terms job postings use (both "Postgres" and "PostgreSQL" when relevant).
5. **Experience**: reverse chronological. For each role: `Title, Company` on one line, `Month YYYY to Month YYYY, Remote or City` on the next, then three to six bullets. Bullets start with a verb and carry a number where one exists (users, revenue, latency, team size). Mark remote roles as Remote.
6. **Projects** (optional): same format, for work that proves target-role skills.
7. **Education and certifications**: one line each.
8. **Languages**: with level.

## Rules

- Single column, no tables, no text boxes, no columns, no icons, no graphics, no headers or footers that carry content.
- Standard section names exactly as above (Summary, Skills, Experience, Education). Parsers key on them.
- Dates as `Month YYYY`. No date ranges inside bullets.
- No first-person pronouns, no filler adjectives, no em dashes.
- Keywords come from the target roles in `profile.md`; mirror the vocabulary of the postings the user is targeting, but only for skills the user has.
- One to two pages. Cut the oldest roles to one line each before cutting recent bullets.
- Remote fit shows up three times: summary, the Remote marker on roles, and tools or practices in Skills (async communication, documentation, overlap hours).
- Keep the file in the workspace language unless the user targets postings in another language; then write the CV in the postings' language.

## Tailored version (milestone 5)

For `apply`, copy `cv/cv.md` to `cv/tailored/<company>-<role>/cv.md` and change only: headline, summary, the order of skill groups and bullets, and up to three bullets rewritten to the posting's vocabulary. Never add experience the user does not have.
