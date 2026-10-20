import { describe, it, expect } from 'vitest';
import { hollandCodeFromScores, riasecFromInterestElements, hasAllRiasecDimensions } from '../src/index.js';

describe('riasec', () => {
  it('hollandCodeFromScores orders letters by score, ties in RIASEC order', () => {
    expect(hollandCodeFromScores({ R: 91, I: 69, A: 10, S: 20, E: 40, C: 55 })).toBe('RIC');
    expect(hollandCodeFromScores({ R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 })).toBe('RIA');
    expect(hollandCodeFromScores({ R: 1, I: 2, A: 3, S: 4, E: 5, C: 6 }, 2)).toBe('CE');
  });

  it('riasecFromInterestElements matches by id, then by name, and needs all six', () => {
    const byId = riasecFromInterestElements([
      { id: '1.B.1.a', occupational_interest: 1 }, { id: '1.B.1.b', occupational_interest: 2 }, { id: '1.B.1.c', occupational_interest: 3 },
      { id: '1.B.1.d', occupational_interest: 4 }, { id: '1.B.1.e', occupational_interest: 5 }, { id: '1.B.1.f', occupational_interest: 6 },
    ]);
    expect(byId).toEqual({ R: 1, I: 2, A: 3, S: 4, E: 5, C: 6 });

    const byName = riasecFromInterestElements([
      { name: 'Realistic', occupational_interest: 1 }, { name: ' investigative ', occupational_interest: 2 }, { name: 'Artistic', occupational_interest: 3 },
      { name: 'Social', occupational_interest: 4 }, { name: 'Enterprising', occupational_interest: 5 }, { name: 'Conventional', occupational_interest: 6 },
    ]);
    expect(byName).toEqual(byId);

    expect(riasecFromInterestElements([{ id: '1.B.1.a', occupational_interest: 1 }])).toBeNull();
    expect(riasecFromInterestElements([{ id: '1.B.1.a' }])).toBeNull();
  });

  it('hasAllRiasecDimensions is a shape check', () => {
    expect(hasAllRiasecDimensions({ R: 1, I: 2, A: 3, S: 4, E: 5, C: 6 })).toBe(true);
    expect(hasAllRiasecDimensions({ R: 1, I: 2, A: 3, S: 4, E: 5 })).toBe(false);
    expect(hasAllRiasecDimensions({ R: 1, I: 2, A: 3, S: 4, E: 5, C: 'six' })).toBe(false);
    expect(hasAllRiasecDimensions(null)).toBe(false);
  });
});
