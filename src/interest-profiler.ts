/**
 * Interest Profiler helpers: the answer string the hosted scorer takes and
 * the validation a client should run before persisting or submitting
 * answers. The client never scores anything itself; O*NET's /results
 * endpoint does, and the item text is rendered as returned.
 */
import { createHash } from 'node:crypto';
import type { RiasecArea } from './riasec.js';

export type InterestProfilerForm = 30 | 60;

export interface InterestProfilerQuestion {
  index: number;
  area: RiasecArea;
  text: string;
}

export interface InterestProfilerAnswerOption {
  value: number;
  name: string;
}

export interface InterestProfilerQuestionSet {
  form: InterestProfilerForm;
  questions: InterestProfilerQuestion[];
  answerOptions: InterestProfilerAnswerOption[];
  /** Stable hash of (index, area, text) for every question; see computeItemSetVersion. */
  itemSetVersion: string;
}

export interface InterestProfilerAreaResult {
  code: RiasecArea;
  title: string;
  description: string;
  score: number;
  href?: string;
}

export interface InterestProfilerResult {
  /** Scores keyed by area, from the `result` list. The client throws rather than return a partial set. */
  scores: Record<RiasecArea, number>;
  result: InterestProfilerAreaResult[];
  /** Link to the Matching careers service for these scores, when the API includes it. */
  careers?: string;
}

export class InvalidAnswersError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnswersError';
  }
}

/** True when `value` is an integer Likert response 1 to 5. */
export function isAnswerValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Build the `answers` query value: one digit per question in index order,
 * exactly `form` characters. Accepts a positional array (answers[0] is
 * question 1) or a string that is already in that form.
 */
export function answersToString(answers: readonly number[] | string, form: InterestProfilerForm): string {
  const s = typeof answers === 'string' ? answers : answers.map((a) => {
    if (!isAnswerValue(a)) throw new InvalidAnswersError(`Answer values must be integers 1 to 5; got ${JSON.stringify(a)}`);
    return String(a);
  }).join('');
  if (s.length !== form) {
    throw new InvalidAnswersError(`The ${form}-item form needs exactly ${form} answers; got ${s.length}`);
  }
  if (!/^[1-5]+$/.test(s)) {
    throw new InvalidAnswersError('Answer string may contain only the digits 1 to 5');
  }
  return s;
}

/**
 * Convert a persisted answers map (keys are question indices as strings) to
 * the positional array the scorer needs. Returns null, never a partial
 * array, unless the map holds exactly `expectedCount` entries with
 * contiguous indices 1..expectedCount in canonical integer-string form.
 */
export function answersMapToOrderedArray(
  answers: Record<string, number>,
  expectedCount: number,
): number[] | null {
  const keys = Object.keys(answers);
  for (const key of keys) {
    if (String(Number(key)) !== key) return null;
  }
  const indices = keys.map(Number);
  if (indices.length !== expectedCount) return null;
  const sorted = [...indices].sort((a, b) => a - b);
  for (let i = 0; i < expectedCount; i++) {
    if (sorted[i] !== i + 1) return null;
  }
  return sorted.map((index) => answers[String(index)] as number);
}

/** Every value in the map is a valid Likert response. */
export function hasValidAnswerValues(answers: Record<string, unknown>): boolean {
  return Object.values(answers).every(isAnswerValue);
}

/**
 * Every key in the map is a canonical question index in 1..itemCount. A
 * partial save may hold fewer than itemCount entries, but each one must name
 * a real question, so a garbage key surfaces now rather than at final submit.
 */
export function hasValidAnswerKeys(answers: Record<string, unknown>, itemCount: number): boolean {
  return Object.keys(answers).every((key) => {
    if (String(Number(key)) !== key) return false;
    const index = Number(key);
    return Number.isInteger(index) && index >= 1 && index <= itemCount;
  });
}

/**
 * Stable, order-independent hash of a question set's identity (index, area,
 * text). Sorts by index before hashing so pagination order never affects
 * the result. Store it with in-progress answers and compare on resume to
 * detect that O*NET has revised the item set since the answers were saved.
 */
export function computeItemSetVersion(questions: readonly InterestProfilerQuestion[]): string {
  const serialized = [...questions]
    .sort((a, b) => a.index - b.index)
    .map((q) => `${q.index}:${q.area}:${q.text}`)
    .join('|');
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}
