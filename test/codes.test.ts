import { describe, it, expect } from 'vitest';
import { isOnetCode, assertOnetCode, socToOnetCode, onetToSocCode, InvalidOnetCodeError, ONET_CODE_RE } from '../src/index.js';

describe('codes', () => {
  it('isOnetCode accepts the NN-NNNN.NN shape only', () => {
    expect(isOnetCode('15-1252.00')).toBe(true);
    expect(isOnetCode('29-1141.01')).toBe(true);
    for (const bad of ['15-1252', '15-1252.0', '151252.00', ' 15-1252.00', '15-1252.00 ', 'x', 15, null, undefined]) {
      expect(isOnetCode(bad), String(bad)).toBe(false);
    }
    expect(ONET_CODE_RE.test('15-1252.00')).toBe(true);
  });

  it('assertOnetCode trims and returns the code, or throws a typed error', () => {
    expect(assertOnetCode('  15-1252.00\n')).toBe('15-1252.00');
    expect(() => assertOnetCode('../x')).toThrow(InvalidOnetCodeError);
    expect(() => assertOnetCode(undefined)).toThrow(InvalidOnetCodeError);
  });

  it('socToOnetCode appends .00 unless a detail suffix is already there', () => {
    expect(socToOnetCode('15-1252')).toBe('15-1252.00');
    expect(socToOnetCode('29-1141.01')).toBe('29-1141.01');
    expect(socToOnetCode(' 15-1252 ')).toBe('15-1252.00');
  });

  it('onetToSocCode strips the detail suffix', () => {
    expect(onetToSocCode('29-1141.01')).toBe('29-1141');
    expect(() => onetToSocCode('29-1141')).toThrow(InvalidOnetCodeError);
  });
});
