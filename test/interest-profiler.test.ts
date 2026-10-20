import { describe, it, expect } from 'vitest';
import {
  answersToString, answersMapToOrderedArray, hasValidAnswerKeys, hasValidAnswerValues, computeItemSetVersion, InvalidAnswersError,
} from '../src/index.js';

describe('answersToString', () => {
  it('joins positional answers into the digit string the scorer takes', () => {
    expect(answersToString([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5], 30)).toBe('123451234512345123451234512345');
    expect(answersToString('5'.repeat(60), 60)).toBe('5'.repeat(60));
  });

  it('rejects wrong lengths, non-integers and out-of-range digits', () => {
    expect(() => answersToString([1, 2, 3], 30)).toThrow(InvalidAnswersError);
    expect(() => answersToString([...Array(29).fill(3), 2.5], 30)).toThrow(InvalidAnswersError);
    expect(() => answersToString('0'.repeat(30), 30)).toThrow(InvalidAnswersError);
    expect(() => answersToString('1'.repeat(31), 30)).toThrow(InvalidAnswersError);
  });
});

describe('answersMapToOrderedArray', () => {
  it('orders by question index', () => {
    expect(answersMapToOrderedArray({ '3': 5, '1': 1, '2': 3 }, 3)).toEqual([1, 3, 5]);
  });

  it('returns null for a sparse, oversized or non-canonical map', () => {
    expect(answersMapToOrderedArray({ '1': 1, '3': 3 }, 3)).toBeNull();
    expect(answersMapToOrderedArray({ '1': 1, '2': 2, '3': 3, '4': 4 }, 3)).toBeNull();
    expect(answersMapToOrderedArray({ '01': 1, '2': 2, '3': 3 }, 3)).toBeNull();
    expect(answersMapToOrderedArray({ '0': 1, '1': 2, '2': 3 }, 3)).toBeNull();
  });
});

describe('answer validation', () => {
  it('hasValidAnswerValues accepts integers 1 to 5 only', () => {
    expect(hasValidAnswerValues({ '1': 1, '2': 5 })).toBe(true);
    expect(hasValidAnswerValues({ '1': 0 })).toBe(false);
    expect(hasValidAnswerValues({ '1': 6 })).toBe(false);
    expect(hasValidAnswerValues({ '1': '3' })).toBe(false);
    expect(hasValidAnswerValues({ '1': 2.5 })).toBe(false);
  });

  it('hasValidAnswerKeys accepts canonical indices within the item count', () => {
    expect(hasValidAnswerKeys({ '1': 1, '30': 1 }, 30)).toBe(true);
    expect(hasValidAnswerKeys({ '31': 1 }, 30)).toBe(false);
    expect(hasValidAnswerKeys({ '0': 1 }, 30)).toBe(false);
    expect(hasValidAnswerKeys({ '1.0': 1 }, 30)).toBe(false);
    expect(hasValidAnswerKeys({}, 30)).toBe(true);
  });
});

describe('computeItemSetVersion', () => {
  const a = [{ index: 1, area: 'realistic' as const, text: 'Build kitchen cabinets' }, { index: 2, area: 'social' as const, text: 'Teach' }];

  it('is stable regardless of order and changes with text', () => {
    const v = computeItemSetVersion(a);
    expect(v).toMatch(/^[0-9a-f]{16}$/);
    expect(computeItemSetVersion([a[1]!, a[0]!])).toBe(v);
    expect(computeItemSetVersion([{ ...a[0]!, text: 'Build kitchen cabinets.' }, a[1]!])).not.toBe(v);
  });
});
