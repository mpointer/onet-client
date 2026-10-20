import { columnIndex, parseTabDelimited } from './bulk.js';
import { RIASEC_ELEMENT_IDS, type RiasecScores } from './riasec.js';

/**
 * Parse "Career Interest Types.txt" (release 30.3 onwards; "Interests.txt"
 * before that, same columns) into O*NET-SOC code to RIASEC scores on the
 * Occupational Interest (OI) scale, 1 to 7. Rows on other scales (the
 * high-point rows, scale IH) and non-RIASEC elements are skipped.
 */
export function parseCareerInterestTypes(text: string): Map<string, RiasecScores> {
  const { header, rows } = parseTabDelimited(text);
  const col = columnIndex(header, ['O*NET-SOC Code', 'Element ID', 'Scale ID', 'Data Value']);
  const out = new Map<string, RiasecScores>();
  for (const cells of rows) {
    const code = cells[col['O*NET-SOC Code'] as number];
    const element = cells[col['Element ID'] as number];
    const scale = cells[col['Scale ID'] as number];
    const value = parseFloat(cells[col['Data Value'] as number] ?? '');
    if (!code || scale !== 'OI' || !element) continue;
    const letter = RIASEC_ELEMENT_IDS[element];
    if (!letter || Number.isNaN(value)) continue;
    let scores = out.get(code);
    if (!scores) {
      scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
      out.set(code, scores);
    }
    scores[letter] = value;
  }
  return out;
}
