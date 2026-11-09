# LinkedIn profile sync

LinkedIn has no API for editing your own profile, so this is browser-assisted, interactive, and never unattended. The CV (`cv/cv.md`) is the source; LinkedIn gets a version written for people reading a profile, not for an ATS.

## 1. Draft and check

Write `<workspace>/linkedin/profile.md` from `cv/cv.md`, `profile.md` and `interview.md`, in exactly this shape:

```markdown
# LinkedIn profile

## Headline

<target role and two or three strongest signals; keywords recruiters search for>

## About

<first person is fine here; 3 to 5 short paragraphs: what you do, proof with numbers, how you work remotely (time zones, async), what you are looking for>

## Experience

### <Title> | <Company>
Dates: <Month YYYY> to <Month YYYY or Present>
Location: <City, Country or Remote>

- <bullet from the CV, same numbers>

## Skills

<comma-separated, most relevant first, at most 50>
```

One `###` block per role, newest first, only roles that should change on LinkedIn. Then:

```
jobsearch linkedin check
```

It counts characters as they will be pasted (bullets become `• ` lines) against LinkedIn's limits: Headline 220, About 2,600, position title 100, position description 2,000, 50 skills. Shorten anything red and run it again until `ok` is true. Show the user the whole draft and adjust until they approve it.

## 2. Before touching the browser

- Ask whether LinkedIn should notify their network about the changes. Default: no. Most edit forms have a "Notify network" (or "Share with network") toggle; set it to their choice before saving each form.
- Tell them the order you will follow and that you will show each text and wait for their yes before every save.

## 3. Section by section

Open `https://www.linkedin.com/in/me/` in a browser where the user is already signed in. For each section below: open the edit form, paste the text from the draft, show the user exactly what is in the form, wait for a clear yes, save, then reload the profile and confirm the new text is there before moving on.

1. **Headline**: the pencil on the intro card, field "Headline".
2. **About**: the pencil on the About section (or "Add profile section > About" if it does not exist yet).
3. **Experience**, one role at a time: if a position with the same company and a matching title exists, edit it (title, dates, location, location type Remote when it applies, description); otherwise use "Add position". Never remove or merge existing positions.
4. **Skills**: add the skills from the draft that are missing. Do not delete skills; if the user wants some removed, list them and let them confirm each one.

Labels and buttons change often: read the page instead of trusting the names above.

## Hard rules

- Never sign in for the user, never type a password, never solve a CAPTCHA or a verification step. If LinkedIn asks for any of these, stop and ask the user to do it.
- Never delete anything (positions, skills, education, recommendations) unless the user asks for that specific item.
- Never save without the user's yes for that exact text. One yes covers one save.
- Never run this from a scheduled or unattended run.

## Which browser

- **Claude Code:** Claude in Chrome (the user's own Chrome, already signed in) is the best fit. The built-in browser also works if the user signs in to LinkedIn there.
- **Codex:** the browser tool the user has installed (for example a Playwright or Chrome MCP server, or the app's browser), with the user signed in.
- **No browser tool:** hand the user `linkedin/profile.md` and walk them through the same sections; they paste and save, you check each section with them.
