import type { DataRow } from "../types/data";

/** True if the cell is only a number (not a categorical label). */
export function isLikelyNumericOnlyCell(val: unknown): boolean {
  if (typeof val === "number" && Number.isFinite(val)) return true;
  if (typeof val === "string") {
    const t = val.trim().replace(/,/g, "");
    if (t === "") return false;
    return !Number.isNaN(Number(t)) && !/[a-z]/i.test(t);
  }
  return false;
}

function distinctCategoricalCount(col: string, rows: DataRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row[col];
    if (v == null || v === "") continue;
    const s = String(v).trim();
    if (s === "") continue;
    if (isLikelyNumericOnlyCell(v)) continue;
    seen.add(s.toLowerCase());
  }
  return seen.size;
}

function columnHasCategoricalValues(col: string, rows: DataRow[], minDistinct: number): boolean {
  return distinctCategoricalCount(col, rows) >= minDistinct;
}

const GROUP_BY_BLOCKED = (c: string) =>
  /^(currency|ref|id|uuid)$/i.test(c) || /(^|_)currency($|_)|exchange|fx_rate/i.test(c);

/** Count distinct calendar years in a column (numeric years are not "categorical" elsewhere). */
export function countDistinctYears(rows: DataRow[], yearCol: string): number {
  const seen = new Set<number>();
  for (const row of rows) {
    const v = row[yearCol];
    if (v == null || v === "") continue;
    let y: number;
    if (typeof v === "number" && Number.isFinite(v)) {
      y = Math.trunc(v);
    } else {
      const m = String(v).match(/(19|20)\d{2}/);
      y = m ? parseInt(m[0], 10) : NaN;
    }
    if (!Number.isFinite(y) || y < 1990 || y > 2100) continue;
    seen.add(y);
  }
  return seen.size;
}

export function formatFiscalYearLabel(key: string): string {
  const t = key.trim();
  if (/^\d{4}$/.test(t)) return `FY ${t}`;
  return t;
}

/**
 * Pick a column for pie / "top by category" charts.
 * Avoids using `currency` when `raw` is numeric-only (common for PDF/image ingest rows).
 */
export function inferGroupByColumn(columns: string[], rows: DataRow[]): string {
  const lower = (c: string) => c.toLowerCase();

  const yearCol = columns.find((c) => /^year$/i.test(c));
  const metricCol = columns.find((c) => /^metric$/i.test(c));
  const valueCol = columns.find((c) => /^value$/i.test(c));

  // Ingested facts (year + metric + value): match CSV-style "Distribution by Year" when 2+ years exist.
  if (yearCol && metricCol && valueCol && countDistinctYears(rows, yearCol) >= 2) {
    return yearCol;
  }

  const preferredExact = ["metric", "category", "account", "line_item", "description", "name", "label"];
  for (const p of preferredExact) {
    const col = columns.find((c) => lower(c) === p);
    if (col && !GROUP_BY_BLOCKED(col) && columnHasCategoricalValues(col, rows, 2)) {
      return col;
    }
  }

  // Financial facts: many years, few metric labels → year (uses numeric year count)
  if (yearCol && metricCol) {
    const yCount = countDistinctYears(rows, yearCol);
    const mCount = distinctCategoricalCount(metricCol, rows);
    if (mCount < 2 && yCount >= 2) {
      return yearCol;
    }
  }

  // Highest-cardinality categorical column (skip blocked / numeric-only columns)
  let best: string | null = null;
  let bestCount = 0;
  for (const col of columns) {
    if (GROUP_BY_BLOCKED(col)) continue;
    const n = distinctCategoricalCount(col, rows);
    if (n > bestCount) {
      bestCount = n;
      best = col;
    }
  }
  if (best && bestCount >= 1) return best;

  if (yearCol) return yearCol;
  return columns[0] ?? "category";
}

/** Matches backend metric `other_income` and common label text. */
export function isOtherIncomeMetric(mRaw: string): boolean {
  const m = String(mRaw ?? "").trim().toLowerCase();
  if (!m) return false;
  return (
    m === "other_income" ||
    /other\s*income|non-?operating\s*income|interest\s*income|dividend\s*income|miscellaneous\s*income/i.test(
      m,
    ) ||
    (m.includes("other") && m.includes("income") && !/operating\s*income/.test(m))
  );
}

export function isExpenseMetric(mRaw: string): boolean {
  const m = String(mRaw ?? "").trim().toLowerCase();
  if (!m) return false;
  if (isOtherIncomeMetric(mRaw)) return false;
  return (
    m === "expenses" ||
    m === "ebitda" ||
    /^total_?expenses$|^operating_?expenses$|^costs?$|^opex$|^cogs$/i.test(m) ||
    (/expense/.test(m) && !/income/.test(m))
  );
}

/** Core revenue only (excludes other income and expenses). */
export function isCoreRevenueMetric(mRaw: string): boolean {
  const m = String(mRaw ?? "").trim().toLowerCase();
  if (!m) return false;
  if (isOtherIncomeMetric(mRaw)) return false;
  if (isExpenseMetric(mRaw)) return false;
  return (
    m === "revenue" ||
    m === "sales" ||
    m === "turnover" ||
    ["net_sales", "gross_revenue", "operating_revenue"].includes(m) ||
    (m.includes("revenue") && !m.includes("other") && !m.includes("non-operating"))
  );
}

/**
 * Per period: Volume over time — value1 = Revenue, value2 = Expenses.
 */
export function aggregateFactsRevenueExpenseByPeriod(
  rows: DataRow[],
  periodCol: string,
  valueCol: string,
  metricCol: string,
): Record<string, { value1: number; value2: number }> {
  const timeGrouped: Record<string, { value1: number; value2: number }> = {};

  for (const row of rows) {
    const rawKey = String(row[periodCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(timeGrouped).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (!timeGrouped[existingKey]) {
      timeGrouped[existingKey] = { value1: 0, value2: 0 };
    }
    const v = Number(row[valueCol]) || 0;
    const m = String(row[metricCol] ?? "");

    if (isCoreRevenueMetric(m)) timeGrouped[existingKey].value1 += v;
    else if (isExpenseMetric(m)) timeGrouped[existingKey].value2 += v;
  }

  return timeGrouped;
}

/**
 * Per period: Volume over time — value1 = Revenue, value2 = Other income (matches Top Year bars).
 */
export function aggregateFactsRevenueOtherIncomeByPeriod(
  rows: DataRow[],
  periodCol: string,
  valueCol: string,
  metricCol: string,
): Record<string, { value1: number; value2: number }> {
  const timeGrouped: Record<string, { value1: number; value2: number }> = {};

  for (const row of rows) {
    const rawKey = String(row[periodCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(timeGrouped).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (!timeGrouped[existingKey]) {
      timeGrouped[existingKey] = { value1: 0, value2: 0 };
    }
    const v = Number(row[valueCol]) || 0;
    const m = String(row[metricCol] ?? "");

    if (isCoreRevenueMetric(m)) timeGrouped[existingKey].value1 += v;
    else if (isOtherIncomeMetric(m)) timeGrouped[existingKey].value2 += v;
  }

  return timeGrouped;
}

/**
 * Per group (e.g. year): Top Year bars — value = Revenue, value2 = Other income.
 */
function numCellWide(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "").replace(/[₹$€£¥\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Wide P&L-style sheet: one row per period, headers like "Revenue from Operations".
 * Splits core revenue vs other income using the same rules as long-format facts.
 */
export function aggregateWideSheetRevenueOtherIncomeByGroup(
  rows: DataRow[],
  groupCol: string,
  columns: string[],
): { groupedData: Record<string, number>; groupedData2: Record<string, number> } {
  const groupedData: Record<string, number> = {};
  const groupedData2: Record<string, number> = {};

  for (const row of rows) {
    const rawKey = String(row[groupCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(groupedData).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (groupedData[existingKey] === undefined) groupedData[existingKey] = 0;
    if (groupedData2[existingKey] === undefined) groupedData2[existingKey] = 0;

    for (const col of columns) {
      if (col === groupCol) continue;
      if (isCoreRevenueMetric(col)) groupedData[existingKey] += numCellWide(row[col]);
      else if (isOtherIncomeMetric(col)) groupedData2[existingKey] += numCellWide(row[col]);
    }
  }

  return { groupedData, groupedData2 };
}

export function aggregateWideSheetRevenueOtherIncomeByPeriod(
  rows: DataRow[],
  periodCol: string,
  columns: string[],
): Record<string, { value1: number; value2: number }> {
  const timeGrouped: Record<string, { value1: number; value2: number }> = {};

  for (const row of rows) {
    const rawKey = String(row[periodCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(timeGrouped).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (!timeGrouped[existingKey]) timeGrouped[existingKey] = { value1: 0, value2: 0 };

    for (const col of columns) {
      if (col === periodCol) continue;
      if (isCoreRevenueMetric(col)) timeGrouped[existingKey].value1 += numCellWide(row[col]);
      else if (isOtherIncomeMetric(col)) timeGrouped[existingKey].value2 += numCellWide(row[col]);
    }
  }

  return timeGrouped;
}

/** Wide P&L row: per-group revenue vs expenses (e.g. alternate charts); Volume over time uses ByPeriod. */
export function aggregateWideSheetRevenueExpenseByGroup(
  rows: DataRow[],
  groupCol: string,
  columns: string[],
): { groupedData: Record<string, number>; groupedData2: Record<string, number> } {
  const groupedData: Record<string, number> = {};
  const groupedData2: Record<string, number> = {};

  for (const row of rows) {
    const rawKey = String(row[groupCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(groupedData).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (groupedData[existingKey] === undefined) groupedData[existingKey] = 0;
    if (groupedData2[existingKey] === undefined) groupedData2[existingKey] = 0;

    for (const col of columns) {
      if (col === groupCol) continue;
      if (isCoreRevenueMetric(col)) groupedData[existingKey] += numCellWide(row[col]);
      else if (isExpenseMetric(col)) groupedData2[existingKey] += numCellWide(row[col]);
    }
  }

  return { groupedData, groupedData2 };
}

export function aggregateWideSheetRevenueExpenseByPeriod(
  rows: DataRow[],
  periodCol: string,
  columns: string[],
): Record<string, { value1: number; value2: number }> {
  const timeGrouped: Record<string, { value1: number; value2: number }> = {};

  for (const row of rows) {
    const rawKey = String(row[periodCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(timeGrouped).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (!timeGrouped[existingKey]) timeGrouped[existingKey] = { value1: 0, value2: 0 };

    for (const col of columns) {
      if (col === periodCol) continue;
      if (isCoreRevenueMetric(col)) timeGrouped[existingKey].value1 += numCellWide(row[col]);
      else if (isExpenseMetric(col)) timeGrouped[existingKey].value2 += numCellWide(row[col]);
    }
  }

  return timeGrouped;
}

export function aggregateFactsRevenueOtherIncomeByGroup(
  rows: DataRow[],
  groupCol: string,
  valueCol: string,
  metricCol: string,
): { groupedData: Record<string, number>; groupedData2: Record<string, number> } {
  const groupedData: Record<string, number> = {};
  const groupedData2: Record<string, number> = {};

  for (const row of rows) {
    const rawKey = String(row[groupCol] ?? "Unknown").trim();
    const existingKey =
      Object.keys(groupedData).find((k) => k.toLowerCase() === rawKey.toLowerCase()) || rawKey;
    if (groupedData[existingKey] === undefined) groupedData[existingKey] = 0;
    if (groupedData2[existingKey] === undefined) groupedData2[existingKey] = 0;

    const v = Number(row[valueCol]) || 0;
    const m = String(row[metricCol] ?? "");

    if (isCoreRevenueMetric(m)) groupedData[existingKey] += v;
    else if (isOtherIncomeMetric(m)) groupedData2[existingKey] += v;
  }

  return { groupedData, groupedData2 };
}

export function isFinancialFactsLayout(columns: string[]): boolean {
  const s = new Set(columns.map((c) => c.toLowerCase()));
  return s.has("metric") && s.has("year") && s.has("value");
}
