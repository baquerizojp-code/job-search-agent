import { parseCv, plainText, type Block } from './cv/parse.js';

/**
 * Character limits LinkedIn enforces in the profile editor. The agent writes
 * <workspace>/linkedin/profile.md (format in skills/job-search/references/linkedin-sync.md)
 * and this check proves every section fits before anything is pasted.
 */
export const LINKEDIN_LIMITS = {
  headline: 220,
  about: 2600,
  positionTitle: 100,
  positionDescription: 2000,
  skillName: 80,
  skills: 50,
} as const;

export interface LinkedinCheck { name: string; chars: number; limit: number; ok: boolean }
export interface LinkedinResult { ok: boolean; checks: LinkedinCheck[]; errors: string[] }

/** Text as it will be pasted: paragraphs on their own lines, bullets prefixed with "• ". */
function pasteText(blocks: Block[]): string {
  return blocks.flatMap((b) => {
    if (b.kind === 'bullets') return b.items.map((i) => `• ${plainText(i)}`);
    return [plainText(b.runs)];
  }).join('\n');
}

export function checkLinkedinProfile(markdown: string): LinkedinResult {
  const doc = parseCv(markdown);
  const checks: LinkedinCheck[] = [];
  const errors: string[] = [];
  const section = (re: RegExp) => doc.sections.find((s) => re.test(s.title));
  const push = (name: string, chars: number, limit: number) => checks.push({ name, chars, limit, ok: chars <= limit });

  const headline = section(/^headline$/i);
  if (!headline) errors.push('Missing "## Headline".');
  else push('Headline', pasteText(headline.blocks).length, LINKEDIN_LIMITS.headline);

  const about = section(/^about$/i);
  if (!about) errors.push('Missing "## About".');
  else push('About', pasteText(about.blocks).length, LINKEDIN_LIMITS.about);

  const experience = section(/^experience$/i);
  if (experience) {
    // Each "### Title | Company" starts a position; the blocks after it, minus the
    // "Dates:" and "Location:" lines that go into their own form fields, are the description.
    let title = '';
    let body: Block[] = [];
    const flush = () => {
      if (!title) return;
      const [role] = title.split('|').map((s) => s.trim());
      push(`Experience: ${title} (title)`, role.length, LINKEDIN_LIMITS.positionTitle);
      const description = body.filter((b) => !(b.kind === 'paragraph' && /^(dates|location|employment type)\s*:/i.test(plainText(b.runs))));
      push(`Experience: ${title} (description)`, pasteText(description).length, LINKEDIN_LIMITS.positionDescription);
    };
    for (const b of experience.blocks) {
      if (b.kind === 'subheading') { flush(); title = plainText(b.runs); body = []; }
      else body.push(b);
    }
    flush();
  }

  const skills = section(/^skills$/i);
  if (skills) {
    const names = pasteText(skills.blocks).replace(/^• /gm, '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    push('Skills (count)', names.length, LINKEDIN_LIMITS.skills);
    for (const n of names) if (n.length > LINKEDIN_LIMITS.skillName) push(`Skill "${n.slice(0, 40)}"`, n.length, LINKEDIN_LIMITS.skillName);
  }

  return { ok: errors.length === 0 && checks.every((c) => c.ok), checks, errors };
}
