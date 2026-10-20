/**
 * Holland (RIASEC) interest helpers shared by the live interests report, the
 * Interest Profiler results and the bulk "Career Interest Types" file.
 */

export const RIASEC_LETTERS = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
export type RiasecLetter = (typeof RIASEC_LETTERS)[number];

export const RIASEC_AREAS = [
  'realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional',
] as const;
export type RiasecArea = (typeof RIASEC_AREAS)[number];

export const RIASEC_LETTER_BY_AREA: Record<RiasecArea, RiasecLetter> = {
  realistic: 'R', investigative: 'I', artistic: 'A', social: 'S', enterprising: 'E', conventional: 'C',
};

export const RIASEC_AREA_BY_LETTER: Record<RiasecLetter, RiasecArea> = {
  R: 'realistic', I: 'investigative', A: 'artistic', S: 'social', E: 'enterprising', C: 'conventional',
};

/** O*NET element ids of the six interest areas (Career Interest Types / interests reports). */
export const RIASEC_ELEMENT_IDS: Record<string, RiasecLetter> = {
  '1.B.1.a': 'R',
  '1.B.1.b': 'I',
  '1.B.1.c': 'A',
  '1.B.1.d': 'S',
  '1.B.1.e': 'E',
  '1.B.1.f': 'C',
};

export type RiasecScores = Record<RiasecLetter, number>;

/** True when every one of the six letters is present as a finite number. Shape only, no range check. */
export function hasAllRiasecDimensions(value: unknown): value is RiasecScores {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return RIASEC_LETTERS.every((k) => Number.isFinite(o[k]));
}

/**
 * The three-letter Holland code: the letters ordered by descending score.
 * Ties keep R-I-A-S-E-C order, which is the convention O*NET's own
 * `interest_code` follows for its high-point code.
 */
export function hollandCodeFromScores(scores: RiasecScores, length = 3): string {
  return RIASEC_LETTERS
    .map((letter, order) => ({ letter, order, score: scores[letter] }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, length)
    .map((x) => x.letter)
    .join('');
}

/** Interest element as the details/interests report returns it; only the fields this module reads. */
export interface InterestElementLike {
  id?: string;
  name?: string;
  occupational_interest?: number;
}

/**
 * RIASEC scores from a details/interests element list. Elements are matched
 * by id first (`1.B.1.a` to `1.B.1.f`), then by name, so a renamed element
 * still lands. Returns null unless all six areas are present: a partial set
 * cannot produce a trustworthy Holland code, and callers that store the
 * result should store nothing rather than a guess.
 */
export function riasecFromInterestElements(elements: readonly InterestElementLike[]): RiasecScores | null {
  const scores: Partial<RiasecScores> = {};
  for (const el of elements) {
    const byId = el.id ? RIASEC_ELEMENT_IDS[el.id] : undefined;
    const byName = el.name ? RIASEC_LETTER_BY_AREA[el.name.trim().toLowerCase() as RiasecArea] : undefined;
    const letter = byId ?? byName;
    if (!letter || typeof el.occupational_interest !== 'number') continue;
    scores[letter] = el.occupational_interest;
  }
  return hasAllRiasecDimensions(scores) ? scores : null;
}
