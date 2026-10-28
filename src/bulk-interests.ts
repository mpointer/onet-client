import { columnIndex, parseTabDelimited } from './bulk.js';
import { RIASEC_ELEMENT_IDS, hasAllRiasecDimensions, type RiasecScores } from './riasec.js';

/**
 * Parse "Career Interest Types.txt" (release 30.3 onwards; "Interests.txt"
 * before that, same columns) into O*NET-SOC code to RIASEC scores on the
 * Occupational Interest (OI) scale, 1 to 7. Rows on other scales (the
 * high-point rows, scale IH) and non-RIASEC elements are skipped. A code
 * without all six OI rows is left out, as riasecFromInterestElements does.
 */
export function parseCareerInterestTypes(text: string): Map<string, RiasecScores> {
  const { header, rows } = parseTabDelimited(text);
  const col = columnIndex(header, ['O*NET-SOC Code', 'Element ID', 'Scale ID', 'Data Value']);
  const partial = new Map<string, Partial<RiasecScores>>();
  for (const cells of rows) {
    const code = cells[col['O*NET-SOC Code'] as number];
    const element = cells[col['Element ID'] as number];
    const scale = cells[col['Scale ID'] as number];
    const value = parseFloat(cells[col['Data Value'] as number] ?? '');
    if (!code || scale !== 'OI' || !element) continue;
    const letter = RIASEC_ELEMENT_IDS[element];
    if (!letter || Number.isNaN(value)) continue;
    const scores = partial.get(code) ?? {};
    scores[letter] = value;
    partial.set(code, scores);
  }
  const out = new Map<string, RiasecScores>();
  for (const [code, scores] of partial) {
    if (hasAllRiasecDimensions(scores)) out.set(code, scores);
  }
  return out;
}
