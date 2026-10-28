import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bulkTextBase, bulkFileUrl, BULK_FILES, parseOccupationData, diffOccupations, parseCareerInterestTypes, columnIndex, parseTabDelimited } from '../src/index.js';

describe('bulk file urls', () => {
  it('builds the release text distribution paths', () => {
    expect(bulkTextBase('30.3')).toBe('https://www.onetcenter.org/dl_files/database/db_30_3_text');
    expect(bulkFileUrl('31.0', BULK_FILES.occupationData)).toBe('https://www.onetcenter.org/dl_files/database/db_31_0_text/Occupation%20Data.txt');
    expect(() => bulkTextBase('latest')).toThrow(TypeError);
  });
});

describe('parseTabDelimited / columnIndex', () => {
  it('splits header and rows, trims cells, drops blank lines and CRLF', () => {
    const t = parseTabDelimited('A\tB\r\n1\t 2 \r\n\r\n3\t4\n');
    expect(t.header).toEqual(['A', 'B']);
    expect(t.rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('columnIndex names every missing column together with the header seen', () => {
    expect(columnIndex(['X', 'Y'], ['Y'])).toEqual({ Y: 1 });
    expect(() => columnIndex(['X'], ['Y', 'Z'])).toThrow(/"Y", "Z".*\["X"\]/);
  });
});

describe('parseOccupationData / diffOccupations', () => {
  const v1 = parseOccupationData(['O*NET-SOC Code\tTitle\tDescription', '11-1011.00\tChief Executives\tOld text', '11-1021.00\tGeneral and Operations Managers\tSame', '11-2011.00\tAdvertising Managers\tGone'].join('\n'));
  const v2 = parseOccupationData(['O*NET-SOC Code\tTitle\tDescription', '11-1011.00\tChief Executives\tNew text', '11-1021.00\tGeneral and Operations Managers\tSame', '11-3012.00\tAdministrative Services Managers\tNew'].join('\n'));

  it('parses by header name', () => {
    expect(v1.get('11-1011.00')).toEqual({ code: '11-1011.00', title: 'Chief Executives', description: 'Old text' });
    const reordered = parseOccupationData('Description\tO*NET-SOC Code\tTitle\nd\t11-1011.00\tt');
    expect(reordered.get('11-1011.00')).toEqual({ code: '11-1011.00', title: 't', description: 'd' });
    expect(() => parseOccupationData('Code\tTitle\n')).toThrow(/O\*NET-SOC Code/);
  });

  it('diffs added, removed, changed and unchanged codes', () => {
    expect(diffOccupations(v1, v2)).toEqual({ added: ['11-3012.00'], removed: ['11-2011.00'], changed: ['11-1011.00'], unchanged: 1 });
  });
});

describe('parseCareerInterestTypes', () => {
  it('reads OI-scale RIASEC rows by header name and ignores other scales and elements', () => {
    const text = [
      'Scale ID\tO*NET-SOC Code\tData Value\tElement ID',
      'OI\t11-1011.00\t5\t1.B.1.a',
      'OI\t11-1011.00\t6\t1.B.1.b',
      'IH\t11-1011.00\t99\t1.B.1.g',
      'IM\t11-1011.00\t99\t1.B.1.c',
      'OI\t11-1011.00\t9\t2.C.1.a',
    ].join('\n');
    // Only R and I came through, so the code is left out rather than zero-filled
    expect(parseCareerInterestTypes(text).has('11-1011.00')).toBe(false);
    const full = [
      text,
      'OI\t11-1011.00\t1\t1.B.1.c',
      'OI\t11-1011.00\t2\t1.B.1.d',
      'OI\t11-1011.00\t3\t1.B.1.e',
      'OI\t11-1011.00\t4\t1.B.1.f',
    ].join('\n');
    expect(parseCareerInterestTypes(full).get('11-1011.00')).toEqual({ R: 5, I: 6, A: 1, S: 2, E: 3, C: 4 });
  });

  it('CONTRACT: the real release 30.3 file sample still parses', () => {
    const text = readFileSync(new URL('./fixtures/career-interest-types-30-3-sample.txt', import.meta.url), 'utf8');
    const scores = parseCareerInterestTypes(text);
    expect(scores.size).toBeGreaterThan(0);
    expect(scores.get('11-1011.00')).toEqual({ R: 1.26, I: 3.05, A: 2.16, S: 3.54, E: 6.96, C: 4.97 });
  });
});
