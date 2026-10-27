# Rubric template

Write `<workspace>/rubric.md` from this template, filled with the interview answers. Keep the five dimensions and their weights (they are what the engine validates): Skills Overlap 50, Role Fit 20, Geo / Remote 5, Domain Fit 15, Company Signal 10. Fill every bracket with the user's own skills, roles, region and thresholds.

```markdown
# Job scoring rubric

Score each posting 0-100 as the sum of five dimensions.

## 1. Skills overlap (50)

Match against profile.md.

**Core (5 each)**: <3 to 5 must-have skills>
**Strong (3 each)**: <5 to 10 strongly relevant skills>
**Nice-to-have (1 each)**: <adjacent or learning skills>

Cap at 50.

## 2. Role fit (20)

**Full 20**: <role titles that map directly to the target>
**Pinned partial values**: <adjacent role>: 15 · <adjacent role>: 12 · <generic role>: 8
**Poor fit**: <fallback roles>: 3 (still scored, not skipped) · anything else: 0

## 3. Geo / remote (5)

- Fully remote with no exclusion that blocks <country>: 5
- "Remote" with no stated restriction: 5 (do not penalize ambiguity)
- Remote but must live in another country, or US-only / EU-only: 0 + red flag
- Hybrid or on-site outside <acceptable locations>: 0 + red flag

## 4. Domain fit (15)

- <most aligned domain> as the core product: 15
- <adjacent domain>: 12
- <bonus condition, e.g. LATAM market or Spanish product>: +3 (capped at 15)
- General overlap with the target industry: 8
- Adjacent but not core: 4
- Unrelated: 0

## 5. Company signal (10)

Missing compensation is never a red flag.

- Compensation stated at or above <target>: 10
- Recognized strong company, no compensation stated: 8
- Compensation stated between <floor> and <target>: 8
- Unknown company, no compensation: 6
- Compensation stated below <floor>: 2 + red flag
- No website, vague description, agency posting, expired: 2

## Verdict

Apply >= 70 · Review 50-69 · Skip < 50 (Skip rows go to the Skipped tab).

## Red flags

- Exclusion that blocks <country>
- In-office requirement outside <acceptable locations>
- Agency posting with no named employer
- Posted more than 30 days ago
- Unpaid, equity-only, or compensation stated below <floor>
- <vertical dealbreakers: crypto, gambling, MLM, …>
- Posting closed
- <role-type dealbreakers>
```
