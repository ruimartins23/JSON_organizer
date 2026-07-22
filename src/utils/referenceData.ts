// Pure helpers for the model's data fixture (the context/tools it was given).
// Kept out of the component file so React fast-refresh stays happy.

// A request to reveal a specific fixture record (from a timeline lookup chip).
export interface FixtureFocus {
  block: string;
  tableIndex: number;
  rowIndex: number;
  nonce: number;
}

export type Row = Record<string, unknown>;
export interface Table {
  label?: string;
  rows: Row[];
}

// Friendly tab names + preferred ordering for the known context blocks.
export const LABELS: Record<string, string> = {
  accounts: 'Accounts',
  plans: 'Plans',
  features: 'Features',
  technician_data: 'Technicians',
  outages: 'Outages',
  lineDiagnostics: 'Line Diagnostics',
};
const ORDER = Object.keys(LABELS);

// Blocks that aren't useful to rate against, hidden from the tabs.
const EXCLUDE = new Set(['current_date', '_session']);

const isRecordArray = (v: unknown): v is Row[] =>
  Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null;

// Turn a block into one or more tables (a block is usually an object wrapping an array of records).
export function toTables(value: unknown): Table[] {
  if (isRecordArray(value)) return [{ rows: value }];
  if (value && typeof value === 'object') {
    const tables: Table[] = [];
    for (const [key, v] of Object.entries(value)) {
      if (isRecordArray(v)) tables.push({ label: key, rows: v });
    }
    return tables;
  }
  return [];
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Full, readable value for the expanded row detail (pretty-print nested JSON).
export function fullCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function recordCount(value: unknown): number {
  return toTables(value).reduce((sum, t) => sum + t.rows.length, 0);
}

// Tab keys in display order, excluding the non-rateable blocks.
export function orderedFixtureKeys(data: Record<string, unknown>): string[] {
  const present = Object.keys(data).filter(k => !EXCLUDE.has(k));
  const ordered = ORDER.filter(k => present.includes(k));
  const extras = present.filter(k => !ORDER.includes(k));
  return [...ordered, ...extras];
}

// How strongly a single record matches a value. Higher = more likely the record
// the value "belongs to" (i.e. where it's the id) rather than one that merely mentions it.
function scoreRow(row: Row, value: string): number {
  let best = 0;
  for (const [field, fieldValue] of Object.entries(row)) {
    const idLike = /id$/i.test(field); // id, accountId, slotId, serviceId, outageId, ...
    if (fieldValue !== null && typeof fieldValue !== 'object') {
      const s = String(fieldValue).toLowerCase();
      if (s === value) best = Math.max(best, idLike ? 100 : 70);        // exact id / exact value
      else if (s.includes(value)) best = Math.max(best, idLike ? 60 : 30); // id contains it / value contains it
    } else if (fieldValue && typeof fieldValue === 'object') {
      if (JSON.stringify(fieldValue).toLowerCase().includes(value)) best = Math.max(best, 10); // buried in a nested field
    }
  }
  return best;
}

// Locate the fixture record a value most likely belongs to (the row where it's the
// identifier wins over rows that only reference it). Ties break by block/row order.
export function findFixtureMatch(
  data: Record<string, unknown>,
  rawValue: unknown,
): { block: string; tableIndex: number; rowIndex: number; blockLabel: string } | null {
  const value = String(rawValue).trim().toLowerCase();
  if (value.length < 3) return null;

  let best: { block: string; tableIndex: number; rowIndex: number; blockLabel: string } | null = null;
  let bestScore = 0;

  for (const block of orderedFixtureKeys(data)) {
    const tables = toTables(data[block]);
    for (let ti = 0; ti < tables.length; ti++) {
      const rows = tables[ti].rows;
      for (let ri = 0; ri < rows.length; ri++) {
        const score = scoreRow(rows[ri], value);
        if (score > bestScore) {
          bestScore = score;
          best = { block, tableIndex: ti, rowIndex: ri, blockLabel: LABELS[block] || block };
        }
      }
    }
  }

  return bestScore > 0 ? best : null;
}
