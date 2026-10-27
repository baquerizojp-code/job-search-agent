# Scoring postings

You score; the engine validates. For every `runs/<date>/batch-NN.json` you write `runs/<date>/scores-NN.json`. Read `<workspace>/profile.md` and `<workspace>/rubric.md` once per run and keep them in mind for every posting.

## Input

`batch-NN.json`:

```json
{ "run": "2026-10-27", "batch": 1, "postings": [
  { "jobId": "linkedin:4404044430", "source": "linkedin", "url": "...", "title": "...", "company": "...",
    "location": "...", "description": "...", "fetchStatus": "ok", "descriptionTruncated": false } ] }
```

`fetchStatus` meanings: `ok` full description; `partial` short description; `pending`, `authwall`, `blocked`, `empty` no description (only what the email carried); `closed` do not score, the engine files it as closed.

## Output

`scores-NN.json`, one entry per posting you scored, same `run` and `batch`:

```json
{ "run": "2026-10-27", "batch": 1, "scores": [
  { "jobId": "linkedin:4404044430",
    "company": "Voxly AI", "role": "Senior Voice AI Engineer", "location": "Remote (Americas)",
    "skills_overlap": 40, "role_fit": 20, "geo_remote": 5, "domain_fit": 15, "company_signal": 8,
    "total": 88, "verdict": "Apply",
    "match_summary": "Direct stack match on voice and conversational AI; Series B with LATAM-friendly remote policy.",
    "red_flags": "" } ] }
```

Field rules the engine enforces (it rejects the file otherwise):

- `jobId` must be one from the batch.
- Integers within range: `skills_overlap` 0-50, `role_fit` 0-20, `geo_remote` 0-5, `domain_fit` 0-15, `company_signal` 0-10, `total` 0-100.
- `total` equals the sum of the five dimensions. Add them up before writing.
- `verdict` follows the band: `total` >= 70 `Apply`, 50-69 `Review`, below 50 `Skip`. The visible score in the Sheet is `floor(total / 10)` (minimum 1), so Apply is 7-10, Review 5-6, Skip 1-4.
- `match_summary` at most 300 characters, plain text, one or two sentences: the strongest match first, then the decisive weakness.
- `red_flags` at most 300 characters; empty string when none. Only genuine concerns from the rubric's red-flag list.
- `location`: what the posting says; `Not specified` when it says nothing. Never invent.

## How to score

- Apply the rubric literally. Each dimension is scored on its own; a strong skills match does not raise the geo score and vice versa.
- Be calibrated, not generous. The user prefers an honest 55 to a flattering 72. If the description is `partial` or missing, score only what you can see and mention it in `match_summary` ("scored from the alert snippet only").
- Score every posting whose `fetchStatus` is not `closed` and that has either a description or at least a title and company. Leave out only postings where you know nothing beyond a URL; the engine retries them in later runs.
- One posting at a time, in order. Do not compare postings with each other and do not rescale to fit a quota.
- Company recognition: use what the description says about stage, size and funding. Missing compensation is never a red flag; compensation stated below the floor in `profile.md` is.
- Agency postings ("our client", no named employer) get the rubric's agency score and a red flag.
- Keep the language of `match_summary` and `red_flags` in the workspace language (`config.json` → `language`).
