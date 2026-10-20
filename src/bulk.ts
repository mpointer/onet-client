/**
 * Helpers for the O*NET database bulk files (the tab-delimited text
 * distribution at onetcenter.org/database.html). These need no API key: the
 * files are public, released a few times a year, and are the right source
 * when you want every occupation at once rather than one report per call.
 */

/** Base URL of a release's tab-delimited text distribution, e.g. `30.3`. */
export function bulkTextBase(release: string): string {
  if (!/^\d+\.\d+$/.test(release)) throw new TypeError(`Release must look like 30.3; got ${JSON.stringify(release)}`);
  return `https://www.onetcenter.org/dl_files/database/db_${release.replace('.', '_')}_text`;
}

/** URL of one file inside a release, by its published name ("Occupation Data.txt"). */
export function bulkFileUrl(release: string, fileName: string): string {
  return `${bulkTextBase(release)}/${encodeURIComponent(fileName)}`;
}

/** The files this module parses, by their published names. */
export const BULK_FILES = {
  occupationData: 'Occupation Data.txt',
  careerInterestTypes: 'Career Interest Types.txt',
} as const;

export interface TabTable {
  header: string[];
  rows: string[][];
}

/** Split a tab-delimited file into header and data rows. Blank lines are dropped; cells are trimmed. */
export function parseTabDelimited(text: string): TabTable {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    rows.push(line.split('\t').map((c) => c.trim()));
  }
  return { header, rows };
}

/**
 * Resolve column indices by header text rather than position, so a column
 * added or reordered in a later release does not silently misparse. Throws
 * naming every missing column together with the header actually observed.
 */
export function columnIndex(header: readonly string[], names: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const name of names) {
    const idx = header.findIndex((h) => h === name);
    if (idx === -1) missing.push(name);
    else out[name] = idx;
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing column(s) ${missing.map((m) => JSON.stringify(m)).join(', ')} in header ${JSON.stringify(header)}; the file layout may have changed`,
    );
  }
  return out;
}

export interface OccupationRow {
  code: string;
  title: string;
  description: string;
}

/** Parse "Occupation Data.txt" (O*NET-SOC Code, Title, Description) into a map by code. */
export function parseOccupationData(text: string): Map<string, OccupationRow> {
  const { header, rows } = parseTabDelimited(text);
  const col = columnIndex(header, ['O*NET-SOC Code', 'Title', 'Description']);
  const out = new Map<string, OccupationRow>();
  for (const cells of rows) {
    const code = cells[col['O*NET-SOC Code'] as number] ?? '';
    if (!code) continue;
    out.set(code, {
      code,
      title: cells[col['Title'] as number] ?? '',
      description: cells[col['Description'] as number] ?? '',
    });
  }
  return out;
}

export interface OccupationDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

/** Which codes a release added, removed or changed (title or description) relative to a previous one. */
export function diffOccupations(
  previous: ReadonlyMap<string, OccupationRow>,
  current: ReadonlyMap<string, OccupationRow>,
): OccupationDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const [code, row] of current) {
    const prev = previous.get(code);
    if (!prev) added.push(code);
    else if (prev.title !== row.title || prev.description !== row.description) changed.push(code);
    else unchanged++;
  }
  for (const code of previous.keys()) {
    if (!current.has(code)) removed.push(code);
  }
  return { added, removed, changed, unchanged };
}
