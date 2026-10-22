import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The copy rules in CONTRIBUTING that a machine can check, run on the
// landing page. The rest (triples used for rhythm, announced honesty,
// decorative adverbs, whether a claim is specific) still need a reader.

const root = join(import.meta.dirname, '..', '..');

interface Block {
  tag: 'p' | 'li';
  text: string;
  fine: boolean;
}

/** The text of every paragraph and list item in a Preact page. */
export function blocksOf(source: string): Block[] {
  const body = source.slice(source.indexOf('return ('));
  const blocks: Block[] = [];
  for (const m of body.matchAll(/<(p|li)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const text = m[3]!
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .trim();
    blocks.push({ tag: m[1] as 'p' | 'li', text, fine: /fineprint/.test(m[2]!) });
  }
  return blocks;
}

export function sentencesIn(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=\S)/).filter((s) => s.trim() !== '');
}

/** A negation set up to be knocked down: "not X, it's Y", "X, not Y", ". Not X." */
const CONTRAST_FRAMES: RegExp[] = [
  /\bnot (?:just |only |merely |simply )?[\w' -]{1,40}[,;:.]? (?:but|it'?s|it is|they'?re|we'?re)\b/i,
  /\b(?:isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|won'?t) (?:just |only |merely )?[\w' -]{1,40}[,;.] (?:it'?s|they'?re|it |but )/i,
  /(?:^|[.!?]\s+)Not\s/,
  /\w,\s+not\s+\w+/,
  /\bless \w+(?: \w+)?,? more \w+/i,
];

const HYPE =
  /(?:#1|\bnumber one\b|\bbest\b|\bleading\b|\brevolution\w*|\bseamless\w*|\beffortless\w*|\bpowerful\b|\bsupercharg\w*|\bgame[- ]chang\w*|\bblazing\b|\bcutting[- ]edge\b|\bworld[- ]class\b|\bunlock\w*)/i;

const SOCIAL_PROOF =
  /(?:\bloved by\b|\btrusted by\b|\b\d[\d,]*\+? (?:users|people|downloads|stars|teams)\b|<blockquote|\btestimonial)/i;

describe('what the checks catch', () => {
  it.each([
    "It's not a tool, it's a workflow.",
    'Not files. Things.',
    'Think in things, not files.',
    "Yesteryear doesn't assume any. It reads what your space contains.",
    'Less clutter, more clarity.',
    'Not only fast, but private.',
  ])('flags the contrast frame: %s', (text) => {
    expect(CONTRAST_FRAMES.some((re) => re.test(text))).toBe(true);
  });

  it.each([
    'Skipping a day is fine, and so is never answering.',
    'Most spaces have no Goal type, and you do not need one.',
    'Farview never deletes anything, and every card links back to the object.',
    'A plain connection asks for read access only.',
  ])('leaves a plain statement alone: %s', (text) => {
    expect(CONTRAST_FRAMES.some((re) => re.test(text))).toBe(false);
  });

  it('flags hype and invented proof', () => {
    for (const text of ['The #1 app', 'A powerful timeline', 'Loved by 5,000 users', 'Unlock your notes']) {
      expect(HYPE.test(text) || SOCIAL_PROOF.test(text), text).toBe(true);
    }
  });

  it('counts sentences', () => {
    expect(sentencesIn('One. Two! Three? Four.')).toHaveLength(4);
    expect(sentencesIn('Settings → Capacities API → Connections.')).toHaveLength(1);
  });
});

describe('the landing page copy', () => {
  const blocks = blocksOf(readFileSync(join(root, 'src/landing/main.tsx'), 'utf8')).filter(
    (b) => !b.fine,
  );
  const everything = blocks.map((b) => b.text).join('\n');

  it('has paragraphs and lists to check', () => {
    expect(blocks.filter((b) => b.tag === 'p').length).toBeGreaterThan(4);
    expect(blocks.filter((b) => b.tag === 'li').length).toBeGreaterThan(3);
  });

  it('keeps every paragraph to three sentences and every list item to two', () => {
    for (const block of blocks) {
      const limit = block.tag === 'p' ? 3 : 2;
      expect(sentencesIn(block.text).length, block.text).toBeLessThanOrEqual(limit);
    }
  });

  it('sets up no contrast frames', () => {
    for (const block of blocks) {
      for (const re of CONTRAST_FRAMES) expect(re.test(block.text), block.text).toBe(false);
    }
  });

  it('makes no superlative or hype claims', () => {
    expect(everything).not.toMatch(HYPE);
  });

  it('shows no testimonials or counts it cannot back', () => {
    expect(readFileSync(join(root, 'src/landing/main.tsx'), 'utf8')).not.toMatch(SOCIAL_PROOF);
  });
});
