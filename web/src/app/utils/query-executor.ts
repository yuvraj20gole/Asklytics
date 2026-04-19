/**
 * Local query execution for uploaded sheets (CSV/XLSX + ingested PDF/image rows).
 *
 * SEARCH TAGS:
 * - @ui:ask_local_engine          → `executeQuery`
 * - @ui:formula_engine_csv        → `executeCsvFinancialFormulas` (ratios, margins, YoY, aggregates)
 * - @ui:long_facts_structured     → `executeLongFactsStructuredQuery` (year/metric/value layout)
 * - @ui:generic_numeric_queries   → fallback heuristics for arbitrary numeric columns
 * - @ui:currency_infer            → `detectCurrency` / `currency-infer.ts`
 *
 * This module is the “client-side brain” used by `pages/chat.tsx` and `pages/analytics.tsx`
 * when an in-memory sheet exists, avoiding backend SQL for many common questions.
 */

import type { DataRow, QueryResult } from "../types/data";
import { isFinancialFactsLayout } from "./analytics-infer";
import {
  canUseCsvFormulaEngine,
  detectCsvFormulaKinds,
  executeCsvFinancialFormulas,
  type FormulaKind,
} from "./financial-formulas-csv";
import { inferCurrencyPrefix } from "./currency-infer";

export type { QueryResult } from "../types/data";

// Currency symbol for chat copy (column names / optional currency column).
function detectCurrency(data: DataRow[], columns?: string[]): string {
  const cols = columns?.length ? columns : Object.keys(data[0] ?? {});
  return inferCurrencyPrefix(data, cols);
}

// Financial keywords mapping
const FINANCIAL_KEYWORDS: Record<string, string[]> = {
  /** Longer / net-profit phrases first so `findBestColumn` does not pick PBT before PAT. */
  profit: [
    "profit after tax",
    "pat",
    "p.a.t",
    "profit for the year",
    "net profit",
    "net income",
    "earnings",
    "profit before tax",
    "pbt",
    "profit",
  ],
  revenue: ["revenue", "sales", "income", "turnover", "receipts", "operations"],
  expense: ["expense", "cost", "expenditure", "spending", "outlay", "cost of", "operating expense"],
  tax: ["tax", "taxation", "income tax"],
  loss: ["loss", "deficit", "negative"],
  year: ["year", "fy", "fiscal year"],
  month: ["month", "period"],
  quarter: ["quarter", "q1", "q2", "q3", "q4"],
  category: ["category", "type", "class", "department", "division"],
  product: ["product", "item", "sku"],
  customer: ["customer", "client", "account"],
};

// NEW: Strict column detection using keyword matching
function detectColumn(input: string, columns: string[], type: keyof typeof FINANCIAL_KEYWORDS): string | null {
  const keywords = FINANCIAL_KEYWORDS[type];
  const lowerInput = input.toLowerCase();
  
  // First, check if user explicitly mentioned a column name
  for (const col of columns) {
    if (lowerInput.includes(col.toLowerCase())) {
      // Check if this column matches the type we're looking for
      const colLower = col.toLowerCase();
      if (keywords.some(k => colLower.includes(k))) {
        return col;
      }
    }
  }
  
  // Then search for columns by keywords
  return findBestColumn(columns, keywords);
}

function findBestColumn(columns: string[], keywords: string[]): string | null {
  const lowerColumns = columns.map((col) => col.toLowerCase());
  
  for (const keyword of keywords) {
    const found = columns.find((col, idx) => 
      lowerColumns[idx].includes(keyword.toLowerCase())
    );
    if (found) return found;
  }
  
  return null;
}

/** Match EBITDA / common typos / EBIT / India PBIDT–style headers in wide financial CSVs. */
function findEbitdaLikeColumn(columns: string[]): string | null {
  const score = (raw: string): number => {
    const lc = raw.toLowerCase().trim().replace(/^\ufeff/, "");
    const letters = lc.replace(/[^a-z]/g, "");
    if (lc.includes("ebitda") || letters.includes("ebitda")) return 4;
    if (
      lc.includes("ebita") ||
      letters.includes("ebita") ||
      letters.includes("ebidta") ||
      letters.includes("ebdita")
    )
      return 3;
    if (/\bebit\b/.test(lc) || /(^|[^a-z])ebit([^a-z]|$)/.test(lc)) return 2;
    if (
      letters.includes("pbidt") ||
      letters.includes("oibda") ||
      letters.includes("pbitda") ||
      letters.includes("pbdt")
    )
      return 2;
    if (letters === "editda") return 3;
    if (
      lc.includes("depreciation") &&
      (lc.includes("amortization") || lc.includes("amortisation")) &&
      (lc.includes("interest") || lc.includes("tax") || lc.includes("finance cost")) &&
      (lc.includes("before") || lc.includes("earnings"))
    )
      return 2;
    return 0;
  };
  let best: string | null = null;
  let bestScore = 0;
  for (const col of columns) {
    const s = score(col);
    if (s > bestScore) {
      bestScore = s;
      best = col;
    }
  }
  return bestScore > 0 ? best : null;
}

function groupBySumTwoMetrics(
  data: DataRow[],
  groupCol: string,
  colA: string,
  colB: string
): Record<string, { a: number; b: number }> {
  const groups: Record<string, { a: number; b: number }> = {};
  for (const row of data) {
    const key = String(row[groupCol] ?? "");
    if (!groups[key]) groups[key] = { a: 0, b: 0 };
    groups[key].a += Number(row[colA]) || 0;
    groups[key].b += Number(row[colB]) || 0;
  }
  return groups;
}

function isNumericColumn(data: DataRow[], column: string): boolean {
  return data.some((row) => typeof row[column] === "number" && !isNaN(row[column] as number));
}

function isYearColumn(column: string): boolean {
  return /^year$/i.test(column.toLowerCase()) || 
         /year$/i.test(column.toLowerCase()) ||
         /^fy$/i.test(column.toLowerCase());
}

// NEW: Validate that a column actually contains year values
function containsYearValues(data: DataRow[], column: string): boolean {
  const values = data.map(row => row[column]).filter(v => v != null);
  if (values.length === 0) return false;
  
  // Check if values are 4-digit numbers (years like 2020, 2021, etc.) OR FY format (FY 2019, FY 2020)
  const yearPattern = /^(19|20)\d{2}$/;
  const fyPattern = /^FY\s*(19|20)\d{2}$/i;
  const yearCount = values.filter(v => {
    const str = String(v).trim();
    return yearPattern.test(str) || fyPattern.test(str);
  }).length;
  
  // At least 50% of values should be year-like
  return yearCount / values.length >= 0.5;
}

// NEW: Smart year column finder that validates content
function findYearColumn(data: DataRow[], columns: string[]): string | null {
  // First try columns with "year" in the name
  const yearNamedColumns = columns.filter(col => isYearColumn(col));
  for (const col of yearNamedColumns) {
    if (containsYearValues(data, col)) {
      return col;
    }
  }
  
  // Then try any column that contains year values
  for (const col of columns) {
    if (containsYearValues(data, col)) {
      return col;
    }
  }
  
  return null;
}

/** Long `year` / `metric` / `value` ingest: filter by metric slug, not by column name. */
function longFactsMetricSlug(m: unknown): string {
  return String(m ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function longFactsIsOperatingRevenue(m: unknown): boolean {
  const t = longFactsMetricSlug(m);
  if (!t) return false;
  if (t.includes("total_income") || t.includes("total-income")) return false;
  if (t.includes("totalincome")) return false;
  if (t.includes("other_income") || t.includes("other-income")) return false;
  if (t === "revenue" || t.includes("revenue_from") || (t.includes("revenue") && !t.includes("other"))) return true;
  return false;
}

function longFactsIsNetProfit(m: unknown): boolean {
  const t = String(m ?? "").toLowerCase();
  if (t.includes("net profit") || t.includes("net_profit")) return true;
  if (t.includes("profit after tax") || /\bpat\b/.test(t)) return true;
  if (t.includes("net income") || t.includes("net_income")) return true;
  if (t.trim().toLowerCase() === "profit") return true;
  return false;
}

function longFactsIsTotalExpenses(m: unknown): boolean {
  const t = String(m ?? "").toLowerCase();
  return t.includes("total expense") || t.includes("total_expense") || t === "expenses" || t === "expense";
}

function longFactsIsTotalIncome(m: unknown): boolean {
  const t = String(m ?? "").toLowerCase();
  return t.includes("total income") || t.includes("total_income");
}

function longFactsIsOtherIncome(m: unknown): boolean {
  const t = String(m ?? "").toLowerCase();
  return t.includes("other income") || t.includes("other_income");
}

function longFactsPick(
  data: DataRow[],
  yearCol: string,
  metricCol: string,
  valueCol: string,
  pred: (m: unknown) => boolean,
): { year: number; value: number }[] {
  const out: { year: number; value: number }[] = [];
  for (const row of data) {
    if (!pred(row[metricCol])) continue;
    const y = Number(row[yearCol]);
    const v = Number(row[valueCol]);
    if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
    out.push({ year: y, value: v });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}

/**
 * Image ingest often stores one wrong `metric`/`value` per year while `raw` still has the full
 * wide row: `2019 385672 5328 391000 347000 32500 49.62`
 */
type ApexStyleWideParsed = {
  year: number;
  revenue: number;
  other_income: number;
  total_income: number;
  total_expenses: number;
  net_profit: number;
  eps?: number;
};

function parseWideFinancialRaw(raw: string): ApexStyleWideParsed | null {
  const t = String(raw ?? "").trim();
  const m = t.match(/^(\d{4})\s+(.+)$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  const tokens = m[2]!.trim().split(/\s+/);
  const nums: number[] = [];
  for (const tok of tokens) {
    const clean = tok.replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(clean)) continue;
    nums.push(parseFloat(clean));
  }
  if (nums.length < 4) return null;
  let eps: number | undefined;
  if (nums.length >= 2 && nums[nums.length - 1]! < 500) {
    eps = nums.pop()!;
  }
  if (nums.length < 4) return null;
  let revenue: number;
  let other_income: number;
  let total_income: number;
  let total_expenses: number;
  let net_profit: number;
  if (nums.length >= 5) {
    revenue = nums[0]!;
    other_income = nums[1]!;
    total_income = nums[2]!;
    total_expenses = nums[3]!;
    net_profit = nums[4]!;
  } else {
    revenue = nums[0]!;
    other_income = nums[1]!;
    total_expenses = nums[2]!;
    net_profit = nums[3]!;
    total_income = revenue + other_income;
  }
  return { year, revenue, other_income, total_income, total_expenses, net_profit, eps };
}

function apexSeriesFromLongFactRows(data: DataRow[], rawCol: string): ApexStyleWideParsed[] {
  const byYear = new Map<number, ApexStyleWideParsed>();
  for (const row of data) {
    const p = parseWideFinancialRaw(String(row[rawCol] ?? ""));
    if (!p) continue;
    if (!byYear.has(p.year)) byYear.set(p.year, p);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/** Typo-tolerant lowercasing for NL matching on uploaded financial rows. */
function normalizeLooseFinancePrompt(userInput: string): string {
  let s = userInput.toLowerCase();
  s = s.replace(/\bshiw\b/g, "show");
  s = s.replace(/\btreand\b/g, "trend");
  s = s.replace(/\brevnue\b|\brevneu\b|\brevenu\b/g, "revenue");
  s = s.replace(/\bexpence\b|\bexpences\b/g, "expense");
  s = s.replace(/\bprotit\b|\bprofict\b/g, "profit");
  return s;
}

function sqlLiteralNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "NULL";
  return String(v);
}

/** Portable `VALUES` SQL for chat export (SQLite / PostgreSQL style). */
function sqlValuesWideSnapshot(
  headerComments: readonly string[],
  alias: string,
  columnNames: readonly string[],
  tuples: readonly (readonly (number | null))[],
): string {
  const header = headerComments.map((c) => `-- ${c}`).join("\n");
  if (!columnNames.length || !tuples.length) {
    return `${header}\nSELECT NULL AS ${columnNames[0] ?? "x"} WHERE 0;`;
  }
  const body = tuples
    .map((row) => {
      const cells = columnNames.map((_, i) => sqlLiteralNumber(row[i] ?? null));
      return `  (${cells.join(", ")})`;
    })
    .join(",\n");
  const cols = columnNames.join(", ");
  return `${header}\nSELECT ${cols}\nFROM (\n  VALUES\n${body}\n) AS ${alias}(${cols})\nORDER BY ${columnNames[0]};`;
}

/** ISO code for chat table rows so tooltips/Y-axis can format money (see chat.tsx). */
function isoCurrencyFromDisplayPrefix(prefix: string): string {
  if (prefix.includes("$")) return "USD";
  if (prefix.includes("€")) return "EUR";
  if (prefix.includes("£")) return "GBP";
  return "INR";
}

function withIsoCurrency<T extends Record<string, unknown>>(rows: T[], iso: string): Array<T & { currency: string }> {
  return rows.map((r) => ({ ...r, currency: iso }));
}

/** Plain-language trend note; calls out YoY dips, not only start vs end. */
function insightYearValueTrend(
  series: readonly { year: number; value: number }[],
  metricLabel: string,
  currencyPrefix: string,
): string {
  if (!series.length) return `No ${metricLabel} values matched this question.`;
  if (series.length === 1) {
    const s = series[0]!;
    return `${metricLabel} for ${s.year}: ${currencyPrefix}${s.value.toLocaleString()}.`;
  }
  const a = series[0]!;
  const b = series[series.length - 1]!;
  const pct = a.value !== 0 ? Math.round((10000 * (b.value - a.value)) / Math.abs(a.value)) / 100 : null;

  const yoyDownYears: number[] = [];
  for (let i = 1; i < series.length; i++) {
    if (series[i]!.value < series[i - 1]!.value) yoyDownYears.push(series[i]!.year);
  }

  const pctSentence =
    pct == null ? "" : ` From ${a.year} to ${b.year} the overall change is about ${pct >= 0 ? "+" : ""}${pct}%.`;

  const labelLc = metricLabel.toLowerCase();
  let pathNote = "";
  if (yoyDownYears.length === 0) {
    pathNote = "Each year is at or above the prior year in this window.";
  } else if (pct != null && b.value > a.value) {
    pathNote = `Year-on-year ${labelLc} was lower moving into ${yoyDownYears.join(
      " and ",
    )} than the prior year, then recovered—the ${pct >= 0 ? "+" : ""}${pct}% change above is from ${a.year} to ${b.year} only, not every step.`;
  } else if (pct != null && b.value < a.value) {
    pathNote = `Year-on-year decreases include: ${yoyDownYears.join(", ")}.`;
  } else {
    pathNote = `Some years are below the prior year (${yoyDownYears.join(", ")}).`;
  }

  return (
    `${metricLabel} goes from ${currencyPrefix}${a.value.toLocaleString()} (${a.year}) to ${currencyPrefix}${b.value.toLocaleString()} (${b.year}), ${series.length} periods.` +
    pctSentence +
    ` ${pathNote}` +
    " These numbers match the chart and are read in order from each uploaded statement line (wide text), not from a blended total across every metric row."
  );
}

/**
 * Structured Q&A for ingested long facts (PDF/image rows). Avoids grouping `value` across all metrics.
 */
function executeLongFactsStructuredQuery(
  userInput: string,
  data: DataRow[],
  columns: string[],
): QueryResult | null {
  if (!isFinancialFactsLayout(columns) || data.length === 0) return null;

  const yearCol = columns.find((c) => /^year$/i.test(c));
  const metricCol = columns.find((c) => /^metric$/i.test(c));
  const valueCol = columns.find((c) => /^value$/i.test(c));
  const rawCol = columns.find((c) => /^raw$/i.test(c));
  if (!yearCol || !metricCol || !valueCol) return null;

  const lower = normalizeLooseFinancePrompt(userInput);
  const cur = detectCurrency(data, columns);
  const moneyIso = isoCurrencyFromDisplayPrefix(cur);

  const apex = rawCol ? apexSeriesFromLongFactRows(data, rawCol) : [];
  const apexOk = apex.length >= 2;

  // Common typos for expense in chat prompts.
  const mentionsExpensesLoose =
    lower.includes("expense") ||
    lower.includes("expenses") ||
    lower.includes("cost") ||
    lower.includes("exoense") ||
    lower.includes("exoenses") ||
    lower.includes("exoense") ||
    lower.includes("exoenses");

  const twoYearRange = lower.match(/\bfrom\s+(20\d{2})\s+to\s+(20\d{2})\b/);

  const asksOtherIncomeRatio =
    /other\s+income/.test(lower) &&
    (lower.includes("%") || lower.includes("percent") || lower.includes("ratio"));

  const asksExpensePctOfTotalIncome =
    (lower.includes("total expense") || lower.includes("expenses")) &&
    lower.includes("total income") &&
    (lower.includes("%") || lower.includes("percent") || lower.includes("ratio") || lower.includes("of"));

  const asksDatasetMetricList =
    (/\blist\b/.test(lower) || /\bshow\b/.test(lower) || /^\s*what\s+(are|is)\s+/i.test(userInput)) &&
    /\bmetrics?\b/.test(lower) &&
    /\b(in\s+(the\s+)?data|upload|uploaded|file|dataset)\b/.test(lower) &&
    !/\bratio\b/.test(lower) &&
    !/\bkpi\s+dashboard\b/.test(lower);

  if (asksDatasetMetricList) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of data) {
      const m = String(row[metricCol] ?? "").trim();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      ordered.push(m);
    }
    const sql = `SELECT DISTINCT ${metricCol} FROM uploaded_data ORDER BY ${metricCol};`;
    return {
      sql,
      table: ordered.map((m) => ({ Metric: m })),
      chartData: [],
      message: `**${ordered.length}** distinct metric value(s) in this upload.`,
      chartType: "bar",
      insight: ordered.length ? ordered.join(", ") : "No rows in the metric column.",
    };
  }

  // --- Highest/lowest profit by year (long facts) ---
  // Many users say "profit" but mean "net profit" for the bottom line; for image/PDF uploads we
  // can read it from the parsed wide `raw` row (preferred) or fall back to metric filtering.
  const asksProfitSuperlative =
    (lower.includes("highest") ||
      lower.includes("lowest") ||
      lower.includes("maximum") ||
      lower.includes("minimum") ||
      lower.includes("best") ||
      lower.includes("worst") ||
      lower.includes("which year") ||
      lower.includes("what year")) &&
    /\bprofits?\b|\bpat\b|\bnet\s+income\b|\bnet\s+profit\b/.test(lower);

  if (asksProfitSuperlative) {
    // Prefer parsed wide raw rows.
    if (apexOk) {
      const series = apex.map((p) => ({ year: p.year, value: p.net_profit }));
      const hasAny = series.some((s) => Number.isFinite(s.value) && s.value !== 0);
      if (hasAny) {
        const wantLow =
          lower.includes("lowest") || lower.includes("minimum") || lower.includes("worst");
        const pick = series.reduce((a, b) =>
          wantLow ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a),
        );
        const sql = sqlValuesWideSnapshot(
          [
            "Net profit by year (wide screenshot / PDF rows).",
            "Fifth numeric token after the year in each `raw` line (wide P&L layout).",
          ],
          "net_profit_series",
          ["year", "net_profit"],
          series.map((s) => [s.year, s.value]),
        );
        const trail = insightYearValueTrend(series, "Net profit", cur);
        return {
          sql,
          table: [{ Year: pick.year, "Net profit": pick.value }],
          chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
          message: `${wantLow ? "Lowest" : "Highest"} net profit is **${pick.year}** at ${cur}${pick.value.toLocaleString()}.`,
          chartType: "line",
          insight: `${wantLow ? "Lowest" : "Highest"} year highlighted in the table; ${trail}`,
          metrics: ["net_profit"],
        };
      }
    }

    // Fallback: filter metric column for net profit-like labels.
    const series = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsNetProfit);
    if (series.length >= 1) {
      const wantLow =
        lower.includes("lowest") || lower.includes("minimum") || lower.includes("worst");
      const pick = series.reduce((a, b) =>
        wantLow ? (b.value < a.value ? b : a) : (b.value > a.value ? b : a),
      );
      const sql = `-- Long facts: net profit by year (filter metric in app)\nSELECT ${yearCol}, ${metricCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%net%profit%'\n   OR LOWER(CAST(${metricCol} AS TEXT)) LIKE '%net_income%'\n   OR LOWER(CAST(${metricCol} AS TEXT)) LIKE '%pat%'\nORDER BY ${yearCol};`;
      return {
        sql,
        table: [{ Year: pick.year, "Net profit": pick.value }],
        chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
        message: `${wantLow ? "Lowest" : "Highest"} net profit is **${pick.year}** at ${cur}${pick.value.toLocaleString()}.`,
        chartType: "line",
        insight: "Filters metric to net profit-like labels before comparing years.",
        metrics: ["net_profit"],
      };
    }
  }

  // --- Revenue trend by year (long facts) ---
  const asksRevenueTrendContext =
    /\brevenue\b|\bsales\b|\bturnover\b/.test(lower) &&
    (lower.includes("trend") ||
      lower.includes("over") ||
      lower.includes("each year") ||
      lower.includes("every year") ||
      lower.includes("by year") ||
      lower.includes("plot") ||
      lower.includes("chart") ||
      lower.includes("graph") ||
      lower.includes("show me") ||
      (/\bshow\b/.test(lower) && /\brevenue\b|\bsales\b|\bturnover\b/.test(lower)) ||
      (lower.includes("see") && /\brevenue\b|\bsales\b|\bturnover\b/.test(lower)) ||
      /\bhistorical\b|\btrajectory\b|\bprogression\b/.test(lower));

  if (asksRevenueTrendContext) {
    const series = apexOk
      ? apex.map((p) => ({ year: p.year, value: p.revenue }))
      : longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsOperatingRevenue);
    if (series.length < 1) return null;
    const sql = apexOk
      ? sqlValuesWideSnapshot(
          [
            "Optional documentation only (-- lines are not executed). Snapshot matches the chat table.",
            "Rule: operating revenue = first numeric token after the calendar year on each uploaded wide statement line (not the mixed metric/value rows).",
          ],
          "operating_revenue_trend",
          ["year", "revenue"],
          series.map((s) => [s.year, s.value]),
        )
      : `-- Long facts: operating revenue by year\nSELECT ${yearCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%revenue%'\n  AND LOWER(CAST(${metricCol} AS TEXT)) NOT LIKE '%other%'\n  AND LOWER(CAST(${metricCol} AS TEXT)) NOT LIKE '%total_income%'\nORDER BY ${yearCol};`;
    return {
      sql,
      table: withIsoCurrency(
        series.map((s) => ({ Year: s.year, Revenue: s.value })),
        moneyIso,
      ),
      chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
      message: `Operating revenue by year (${series.length} period(s)).`,
      chartType: "line",
      chartValueFormat: "currency",
      insight: apexOk
        ? insightYearValueTrend(series, "Operating revenue", cur)
        : "Filters metric to operating revenue (excludes other income / total income).",
      metrics: ["revenue"],
    };
  }

  // --- Expenses / cost trend by year (long facts) ---
  if (
    mentionsExpensesLoose &&
    (lower.includes("trend") ||
      lower.includes("over") ||
      lower.includes("each year") ||
      lower.includes("every year") ||
      lower.includes("by year") ||
      lower.includes("plot") ||
      lower.includes("chart") ||
      lower.includes("graph") ||
      lower.includes("show me"))
  ) {
    let series = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsTotalExpenses);
    if (series.length < 1 && apexOk) {
      series = apex.map((p) => ({ year: p.year, value: p.total_expenses }));
    }
    if (series.length < 1) return null;
    const sql = apexOk
      ? sqlValuesWideSnapshot(
          [
            "Total expenses by year (wide `raw` rows).",
            "Fourth numeric token after the year on each line.",
          ],
          "total_expenses_trend",
          ["year", "total_expenses"],
          series.map((s) => [s.year, s.value]),
        )
      : `-- Long facts: total expenses by year\nSELECT ${yearCol}, ${metricCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%expense%'\nORDER BY ${yearCol};`;
    const rows: DataRow[] = series.map((s) => ({ Year: s.year, "Total expenses": s.value }));
    return {
      sql,
      table: rows,
      chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
      message: `Total expenses by year (${series.length} period(s)).`,
      chartType: "line",
      insight: apexOk
        ? insightYearValueTrend(series, "Total expenses", cur)
        : "Filters `metric` to expense rows before grouping by year.",
      metrics: ["expenses"],
    };
  }

  // --- Other income trend by year (long facts) ---
  if (
    /other\s+income/.test(lower) &&
    (lower.includes("trend") ||
      lower.includes("over") ||
      lower.includes("each year") ||
      lower.includes("every year") ||
      lower.includes("by year") ||
      lower.includes("plot") ||
      lower.includes("chart") ||
      lower.includes("graph") ||
      lower.includes("show me"))
  ) {
    let series = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsOtherIncome);
    if (series.length < 1 && apexOk) {
      series = apex.map((p) => ({ year: p.year, value: p.other_income }));
    }
    if (series.length < 1) return null;
    const sql = apexOk
      ? sqlValuesWideSnapshot(
          [
            "Other income by year (wide `raw` rows).",
            "Second numeric token after the year on each line.",
          ],
          "other_income_trend",
          ["year", "other_income"],
          series.map((s) => [s.year, s.value]),
        )
      : `-- Long facts: other income by year\nSELECT ${yearCol}, ${metricCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%other%income%'\nORDER BY ${yearCol};`;
    const rows: DataRow[] = series.map((s) => ({ Year: s.year, "Other income": s.value }));
    return {
      sql,
      table: rows,
      chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
      message: `Other income by year (${series.length} period(s)).`,
      chartType: "line",
      insight: apexOk
        ? insightYearValueTrend(series, "Other income", cur)
        : "Filters `metric` to other income rows before grouping by year.",
      metrics: ["other_income"],
    };
  }

  // --- Operating revenue vs total expenses (wide `raw`); before expenses-only "by year" branch ---
  const asksRevenueVsExpenses =
    apexOk &&
    /\brevenue\b/.test(lower) &&
    /\bexpenses?\b/.test(lower) &&
    (/\bvs\b|\bversus\b|\bcompare\b/.test(lower) ||
      (/\band\b/.test(lower) && /\bby\s+year\b/.test(lower)));
  if (asksRevenueVsExpenses) {
    const rows: DataRow[] = apex.map((p) => ({
      Year: p.year,
      Revenue: p.revenue,
      "Total expenses": p.total_expenses,
    }));
    const sql = sqlValuesWideSnapshot(
      [
        "Operating revenue and total expenses by year (same wide `raw` line per year).",
        "Revenue = first numeric token after year; total expenses = fourth token.",
      ],
      "revenue_vs_expenses",
      ["year", "revenue", "total_expenses"],
      apex.map((p) => [p.year, p.revenue, p.total_expenses]),
    );
    const revSeries = apex.map((p) => ({ year: p.year, value: p.revenue }));
    return {
      sql,
      table: rows,
      chartData: rows.map((row) => ({
        name: String(row.Year),
        revenue: row.Revenue as number,
        expenses: row["Total expenses"] as number,
      })),
      message: `Operating **revenue** vs **total expenses** by year (${rows.length} periods).`,
      chartType: "multi-bar",
      insight:
        `Compares the two headline flows from each uploaded line. ${insightYearValueTrend(revSeries, "Revenue", cur)} (Expenses column is the 4th number after the year.)`,
      metrics: ["revenue", "expenses"],
    };
  }

  // --- Combined: other income % of revenue AND expenses % of total income ---
  if (asksOtherIncomeRatio && asksExpensePctOfTotalIncome && apexOk) {
    const rows: DataRow[] = apex.map((p) => ({
      Year: p.year,
      "Other income % of revenue":
        p.revenue !== 0 ? Math.round((10000 * p.other_income) / p.revenue) / 100 : "—",
      "Expenses % of total income":
        p.total_income !== 0 ? Math.round((10000 * p.total_expenses) / p.total_income) / 100 : "—",
    }));
    const sql =
      `-- Parsed wide rows from \`raw\` (Year, Rev, OI, TI, Exp, PAT, EPS)\nSELECT * FROM uploaded_data;`;
    return {
      sql,
      table: rows,
      chartData: rows.map((row) => ({
        name: String(row.Year),
        sales: (row["Other income % of revenue"] as number) ?? 0,
      })),
      message:
        "Other income as % of **operating revenue**, and total expenses as % of **total income**, by year (from parsed `raw` rows).",
      chartType: "line",
      chartValueFormat: "percent",
      insight: "Second metric is in the table; chart highlights other-income %.",
    };
  }

  // --- Revenue % change (must not steal "other income % of revenue") ---
  const asksRevenueDelta =
    !asksOtherIncomeRatio &&
    /\brevenue\b|\bsales\b|\bturnover\b/.test(lower) &&
    (lower.includes("change") ||
      lower.includes("growth") ||
      twoYearRange != null ||
      /\bfrom\s+20\d{2}\s+to\s+20\d{2}/.test(lower));

  if (asksRevenueDelta) {
    const series = apexOk
      ? apex.map((p) => ({ year: p.year, value: p.revenue }))
      : longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsOperatingRevenue);
    if (series.length < 1) return null;
    const yA = twoYearRange ? parseInt(twoYearRange[1], 10) : series[0].year;
    const yB = twoYearRange ? parseInt(twoYearRange[2], 10) : series[series.length - 1].year;
    const va = series.find((x) => x.year === yA)?.value;
    const vb = series.find((x) => x.year === yB)?.value;
    if (va == null || vb == null || va === 0) return null;
    const pct = ((vb - va) / va) * 100;
    const sql = apexOk
      ? sqlValuesWideSnapshot(
          [
            `Operating revenue: ${yA} vs ${yB} (wide \`raw\`, first amount after year).`,
            `Overall change ≈ ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%.`,
          ],
          "revenue_two_year",
          ["year", "revenue"],
          [
            [yA, va],
            [yB, vb],
          ],
        )
      : `-- Long facts: operating revenue for ${yA} vs ${yB}\nSELECT ${yearCol}, ${metricCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(${metricCol}) LIKE '%revenue%' AND LOWER(${metricCol}) NOT LIKE '%other%'\n  AND LOWER(${metricCol}) NOT LIKE '%total_income%'\n  AND ${yearCol} IN (${yA}, ${yB});`;
    return {
      sql,
      table: [
        { Year: yA, Revenue: va },
        { Year: yB, Revenue: vb },
        { "Δ %": `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` },
      ],
      chartData: [
        { name: String(yA), sales: va },
        { name: String(yB), sales: vb },
      ],
      message: `Revenue changed from ${cur}${va.toLocaleString()} (${yA}) to ${cur}${vb.toLocaleString()} (${yB}), **${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%** overall.`,
      chartType: "bar",
      insight: apexOk
        ? `**${yA}→${yB}:** ${pct >= 0 ? "up" : "down"} about **${Math.abs(pct).toFixed(1)}%** on operating revenue parsed from each line’s first amount after the year (not the mixed \`value\` column).`
        : `End-to-end change across the period: ${pct.toFixed(1)}% ${pct >= 0 ? "growth" : "decline"}.`,
    };
  }

  if (
    (lower.includes("highest") || lower.includes("lowest") || lower.includes("which year") || lower.includes("what year")) &&
    (lower.includes("net profit") || lower.includes("net income") || /\bpat\b/.test(lower))
  ) {
    let series = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsNetProfit);
    if (series.length < 1 && apexOk) {
      series = apex.map((p) => ({ year: p.year, value: p.net_profit }));
    }
    if (series.length < 1) return null;
    const best = series.reduce((a, b) => (a.value >= b.value ? a : b));
    const worst = series.reduce((a, b) => (a.value <= b.value ? a : b));
    let wantHigh = lower.includes("highest") || lower.includes("maximum") || lower.includes("best");
    const wantLow = lower.includes("lowest") || lower.includes("minimum") || lower.includes("worst");
    if (!wantHigh && !wantLow) wantHigh = true;
    const sql = `-- Long facts: net profit by year\nSELECT ${yearCol}, ${metricCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%net%profit%'\n   OR LOWER(CAST(${metricCol} AS TEXT)) LIKE '%net_income%'\n   OR LOWER(CAST(${metricCol} AS TEXT)) LIKE '%pat%';`;
    if (wantHigh && wantLow) {
      return {
        sql,
        table: [
          { Kind: "Highest", Year: best.year, "Net profit": best.value },
          { Kind: "Lowest", Year: worst.year, "Net profit": worst.value },
        ],
        chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
        message: `**Highest** net profit: **${best.year}** (${cur}${best.value.toLocaleString()}). **Lowest**: **${worst.year}** (${cur}${worst.value.toLocaleString()}).`,
        chartType: "line",
        insight: `Full series spans ${series.length} years.`,
      };
    }
    const pick = wantLow ? worst : best;
    return {
      sql,
      table: [{ Year: pick.year, "Net profit": pick.value }],
      chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
      message: `${wantLow ? "Lowest" : "Highest"} net profit is **${pick.year}** at ${cur}${pick.value.toLocaleString()}.`,
      chartType: "line",
      insight: `Range: ${cur}${worst.value.toLocaleString()} (${worst.year}) to ${cur}${best.value.toLocaleString()} (${best.year}).`,
    };
  }

  // --- Total expenses trend by year ---
  if (
    longFactsIsTotalExpenses("total expenses") &&
    (lower.includes("expense") || lower.includes("expenses")) &&
    (lower.includes("trend") ||
      lower.includes("over the") ||
      lower.includes("each year") ||
      lower.includes("every year") ||
      lower.includes("by year") ||
      lower.includes("plot") ||
      lower.includes("describe") ||
      lower.includes("chart") ||
      lower.includes("graph"))
  ) {
    let series = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsTotalExpenses);
    if (series.length < 1 && apexOk) {
      series = apex.map((p) => ({ year: p.year, value: p.total_expenses }));
    }
    if (series.length < 1) return null;
    const sql = apexOk
      ? sqlValuesWideSnapshot(
          [
            "Total expenses by year (wide `raw` rows).",
            "Fourth numeric token after the year on each line.",
          ],
          "total_expenses_trend_alt",
          ["year", "total_expenses"],
          series.map((s) => [s.year, s.value]),
        )
      : `-- Long facts: total expenses by year\nSELECT ${yearCol}, ${valueCol}\nFROM uploaded_data\nWHERE LOWER(CAST(${metricCol} AS TEXT)) LIKE '%expense%'\nORDER BY ${yearCol};`;
    return {
      sql,
      table: series.map((s) => ({ Year: s.year, "Total expenses": s.value })),
      chartData: series.map((s) => ({ name: String(s.year), sales: s.value })),
      message: `Total expenses by year (${series.length} periods).`,
      chartType: "line",
      insight: apexOk
        ? insightYearValueTrend(series, "Total expenses", cur)
        : `From ${cur}${series[0].value.toLocaleString()} (${series[0].year}) to ${cur}${series[series.length - 1].value.toLocaleString()} (${series[series.length - 1].year}).`,
    };
  }

  // --- Other income % of (operating) revenue ---
  if (asksOtherIncomeRatio && !asksExpensePctOfTotalIncome) {
    if (apexOk) {
      const rows: DataRow[] = apex.map((p) => ({
        Year: p.year,
        "Other income": p.other_income,
        Revenue: p.revenue,
        "Other income % of revenue":
          p.revenue !== 0 ? Math.round((10000 * p.other_income) / p.revenue) / 100 : "—",
      }));
      const sql = sqlValuesWideSnapshot(
        [
          "Other income vs operating revenue by year (wide `raw`).",
          "Percent = other_income / revenue × 100 (NULL when revenue is 0).",
        ],
        "other_income_pct_of_revenue",
        ["year", "other_income", "revenue", "other_income_pct_of_revenue"],
        apex.map((p) => [
          p.year,
          p.other_income,
          p.revenue,
          p.revenue !== 0 ? Math.round((10000 * p.other_income) / p.revenue) / 100 : null,
        ]),
      );
      return {
        sql,
        table: rows,
        chartData: rows.map((row) => ({
          name: String(row.Year),
          sales: (row["Other income % of revenue"] as number) ?? 0,
        })),
        message: `Other income as % of operating revenue, by year.`,
        chartType: "line",
        chartValueFormat: "percent",
        insight:
          "Shows how large **other income** is relative to **operating revenue** each year (same numbers as the chart).",
      };
    }
    const rev = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsOperatingRevenue);
    const oi = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsOtherIncome);
    if (rev.length < 1 || oi.length < 1) return null;
    const oiByYear = new Map(oi.map((x) => [x.year, x.value]));
    const rows: DataRow[] = [];
    for (const r of rev) {
      const o = oiByYear.get(r.year);
      if (o == null || r.value === 0) continue;
      rows.push({
        Year: r.year,
        "Other income": o,
        Revenue: r.value,
        "Other income % of revenue": Math.round((10000 * o) / r.value) / 100,
      });
    }
    if (!rows.length) return null;
    const sql = `-- Long facts: other_income / revenue per year\n-- (filter metric in app)`;
    return {
      sql,
      table: rows,
      chartData: rows.map((row) => ({
        name: String(row.Year),
        sales: row["Other income % of revenue"] as number,
      })),
      message: `Other income as % of operating revenue, by year.`,
      chartType: "line",
      chartValueFormat: "percent",
      insight: "Uses **revenue** (operating) as denominator, not total income.",
    };
  }

  // --- Total expenses % of total income ---
  if (asksExpensePctOfTotalIncome && !asksOtherIncomeRatio) {
    if (apexOk) {
      const rows: DataRow[] = apex.map((p) => ({
        Year: p.year,
        "Total income": p.total_income,
        "Total expenses": p.total_expenses,
        "Expenses % of total income":
          p.total_income !== 0 ? Math.round((10000 * p.total_expenses) / p.total_income) / 100 : "—",
      }));
      const sql = sqlValuesWideSnapshot(
        [
          "Total expenses vs total income by year (wide `raw`).",
          "expenses_pct_of_total_income = expenses / total_income × 100 (NULL when total income is 0).",
        ],
        "expenses_pct_of_total_income",
        ["year", "total_income", "total_expenses", "expenses_pct_of_total_income"],
        apex.map((p) => [
          p.year,
          p.total_income,
          p.total_expenses,
          p.total_income !== 0 ? Math.round((10000 * p.total_expenses) / p.total_income) / 100 : null,
        ]),
      );
      return {
        sql,
        table: rows,
        chartData: rows.map((row) => ({
          name: String(row.Year),
          sales: (row["Expenses % of total income"] as number) ?? 0,
        })),
        message: `Total expenses as % of total income, by year.`,
        chartType: "line",
        chartValueFormat: "percent",
        insight:
          "Lower **expenses % of total income** usually means more income is left after operating costs (chart uses the same ratio as the table).",
      };
    }
    const ti = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsTotalIncome);
    const ex = longFactsPick(data, yearCol, metricCol, valueCol, longFactsIsTotalExpenses);
    if (ti.length < 1 || ex.length < 1) return null;
    const exByYear = new Map(ex.map((x) => [x.year, x.value]));
    const rows: DataRow[] = [];
    for (const t of ti) {
      const e = exByYear.get(t.year);
      if (e == null || t.value === 0) continue;
      rows.push({
        Year: t.year,
        "Total income": t.value,
        "Total expenses": e,
        "Expenses % of total income": Math.round((10000 * e) / t.value) / 100,
      });
    }
    if (!rows.length) return null;
    const sql = `-- Long facts: total_expenses / total_income per year`;
    return {
      sql,
      table: rows,
      chartData: rows.map((row) => ({
        name: String(row.Year),
        sales: row["Expenses % of total income"] as number,
      })),
      message: `Total expenses as % of total income, by year.`,
      chartType: "line",
      chartValueFormat: "percent",
      insight: "Lower % generally means more income retained before tax items.",
    };
  }

  return null;
}

function formulaKindDisplayNames(kinds: FormulaKind[]): string {
  const map: Partial<Record<FormulaKind, string>> = {
    debt_to_equity: "Debt-to-equity ratio",
    current_ratio: "Current ratio",
    quick_ratio: "Quick ratio",
    interest_coverage: "Interest coverage",
    roe: "Return on equity (ROE)",
    roa: "Return on assets (ROA)",
    roce: "Return on capital employed (ROCE)",
    gross_margin: "Gross margin",
    operating_margin: "Operating margin",
    ebitda_margin: "EBITDA margin",
    net_margin: "Net profit margin",
    asset_turnover: "Asset turnover",
    inventory_days: "Inventory days",
    receivable_days: "Receivable days",
    payable_days: "Payable days",
    eps: "EPS",
    pe: "P/E ratio",
    yoy: "Year-over-year growth",
    gross_profit: "Gross profit",
    ebitda_absolute: "EBITDA",
    all: "Full financial ratios",
  };
  return kinds.map((k) => map[k] ?? k.replace(/_/g, " ")).join(" + ");
}

/** User asked for a computed ratio/metric but the sheet cannot run the formula engine (or pivot failed). */
function formulaIntentWithoutEngineSupport(
  userInput: string,
  kinds: FormulaKind[],
  reason: "sheet_layout" | "pivot_empty",
): QueryResult {
  const title = formulaKindDisplayNames(kinds);
  const balanceHint =
    kinds.includes("debt_to_equity") ||
    kinds.includes("current_ratio") ||
    kinds.includes("quick_ratio") ||
    kinds.includes("roe") ||
    kinds.includes("roa") ||
    kinds.includes("roce")
      ? "This usually needs **balance sheet** lines in the file (e.g. total borrowings/debt and shareholders’ equity, or current assets/liabilities), not only a single P&L revenue column."
      : "The upload needs additional numeric line-item columns that map to this metric.";

  const msg =
    reason === "pivot_empty"
      ? `You asked for **${title}**, but no periods could be built from the rows (check year/period and numeric values).`
      : `You asked for **${title}**. ${balanceHint}`;

  return {
    sql: `-- ${kinds.join(", ")}: requires classified financial columns (wide or long facts layout).`,
    table: [
      {
        Topic: title,
        Status: reason === "pivot_empty" ? "No periods in pivot" : "Not enough structured columns",
        Detail: msg,
      },
    ],
    chartData: [],
    message: msg,
    chartType: "bar",
    insight:
      "Try **Analytics** for ratio dashboards, or upload a CSV with **Year** (or period) plus the balance-sheet and P&L lines needed for this metric. For revenue-only sheets, ask about **revenue**, **profit**, or **expenses** you actually have columns for.",
  };
}

export function executeQuery(
  userInput: string,
  data: DataRow[],
  columns: string[]
): QueryResult {
  const lowerInput = normalizeLooseFinancePrompt(userInput);

  const kindsFromQuestion = detectCsvFormulaKinds(lowerInput);
  if (kindsFromQuestion?.length) {
    if (canUseCsvFormulaEngine(columns, data)) {
      const formulaHit = executeCsvFinancialFormulas(userInput, data, columns);
      if (formulaHit) return formulaHit;
      return formulaIntentWithoutEngineSupport(userInput, kindsFromQuestion, "pivot_empty");
    }
    return formulaIntentWithoutEngineSupport(userInput, kindsFromQuestion, "sheet_layout");
  }

  const longFactsHit = executeLongFactsStructuredQuery(userInput, data, columns);
  if (longFactsHit) return longFactsHit;

  // Categorize columns
  const numericColumns = columns.filter((col) => isNumericColumn(data, col));
  const textColumns = columns.filter((col) => !numericColumns.includes(col));

  console.log("🔍 Query Analysis:", {
    input: userInput,
    numericColumns,
    textColumns,
    allColumns: columns
  });

  // Detect query intent
  const wantsTotal = lowerInput.includes("total") || lowerInput.includes("sum");
  const wantsAverage = lowerInput.includes("average") || lowerInput.includes("avg") || lowerInput.includes("mean");
  const wantsCount = lowerInput.includes("count") || lowerInput.includes("number of") || lowerInput.includes("how many");
  const wantsTop = lowerInput.includes("top") || lowerInput.includes("highest") || lowerInput.includes("best") || lowerInput.includes("maximum") || lowerInput.includes("most") || lowerInput.includes("good") || lowerInput.includes("great") || lowerInput.includes("strong");
  const wantsBottom = lowerInput.includes("bottom") || lowerInput.includes("lowest") || lowerInput.includes("worst") || lowerInput.includes("minimum") || lowerInput.includes("least") || lowerInput.includes("bad") || lowerInput.includes("poor") || lowerInput.includes("weak");
  const wantsGrouping = lowerInput.includes("by ") || lowerInput.includes("each") || lowerInput.includes("per") || 
                        lowerInput.includes("breakdown") || lowerInput.includes("group");
  
  // Detect WHICH questions (asking for a specific item, not a list)
  // Expanded detection for singular answer queries
  const asksWhich = lowerInput.includes("which") || 
                    (lowerInput.includes("what") && (wantsTop || wantsBottom));
  const asksForThe = lowerInput.match(/\b(the|a|an)\s+(highest|lowest|best|worst|top|bottom|maximum|minimum)/);
  const asksTellMe = (lowerInput.includes("tell me") || lowerInput.includes("show me") || lowerInput.includes("give me")) && 
                     (wantsTop || wantsBottom);
  const hasExplicitNumber = /top\s+\d+|bottom\s+\d+|first\s+\d+|last\s+\d+/i.test(lowerInput);
  
  // Want single answer if:
  // 1. Uses "which/what" with superlative, OR
  // 2. Uses "the/a/an" + superlative (e.g., "the highest"), OR  
  // 3. Uses "tell/show/give me" + superlative, OR
  // 4. BUT NOT if they specify a number (e.g., "top 5")
  const wantsSingleAnswer = ((asksWhich || asksForThe || asksTellMe) && (wantsTop || wantsBottom)) && !hasExplicitNumber;
  
  // Financial intent detection
  const mentionsProfit = lowerInput.includes("profit") || lowerInput.includes("earnings") || lowerInput.includes("net income");
  const mentionsRevenue = lowerInput.includes("revenue") || lowerInput.includes("sales") || lowerInput.includes("income");
  const mentionsExpense = lowerInput.includes("expense") || lowerInput.includes("cost") || lowerInput.includes("expenditure");
  const mentionsLoss = lowerInput.includes("loss") || lowerInput.includes("lost") || lowerInput.includes("deficit") || lowerInput.includes("negative");

  // NEW: Enhanced intent detection
  const wantsComparison = lowerInput.includes("compare") || lowerInput.includes("vs") || 
                          lowerInput.includes("versus") || lowerInput.includes("and");
  const wantsGrowth = lowerInput.includes("growth") || lowerInput.includes("growth rate") || 
                      lowerInput.includes("increase") || lowerInput.includes("decrease") ||
                      lowerInput.includes("yoy") || lowerInput.includes("y-o-y") ||
                      lowerInput.includes("year over year") || lowerInput.includes("year-over-year") ||
                      lowerInput.includes("trend %") || lowerInput.includes("growth %");
  const wantsSummary =
    lowerInput.includes("summary") ||
    lowerInput.includes("complete") ||
    lowerInput.includes("overall") ||
    lowerInput.includes("full picture") ||
    lowerInput.includes("everything") ||
    (/\ball metrics\b/.test(lowerInput) &&
      /\b(financial|ratio|ratios|kpi|overview|dashboard)\b/.test(lowerInput));
  const wantsInsight = lowerInput.includes("why") || lowerInput.includes("analyze") || 
                       lowerInput.includes("analysis") || lowerInput.includes("explain") ||
                       lowerInput.includes("best") || lowerInput.includes("worst");
  const wantsMargin = lowerInput.includes("margin") || lowerInput.includes("percentage");

  // Detect trend query early (needed for column detection)
  const isTrendQuery = 
    lowerInput.includes("trend") || 
    lowerInput.includes("over time") || 
    lowerInput.includes("over years") || 
    lowerInput.includes("over months") || 
    lowerInput.includes("growth") || 
    lowerInput.includes("progression");

  console.log("🎯 Query Intent:", {
    wantsTotal, wantsAverage, wantsCount, wantsTop, wantsBottom, wantsGrouping,
    mentionsProfit, mentionsRevenue, mentionsExpense, mentionsLoss,
    asksWhich, wantsSingleAnswer, isTrendQuery,  // ADD isTrendQuery
    wantsComparison, wantsGrowth, wantsSummary, wantsInsight, wantsMargin // NEW
  });

  console.log("🔍 Comparison Check:", {
    wantsComparison,
    mentionsRevenue,
    mentionsExpense,
    willTriggerComparison: wantsComparison && (mentionsRevenue || mentionsExpense)
  });

  // Find relevant columns
  let valueColumn: string | null = null;
  let groupColumn: string | null = null;

  const asksEbitLine =
    lowerInput.includes("ebitda") ||
    lowerInput.includes("ebita") ||
    /\bebit\b/.test(lowerInput);
  const ebitMeasureCol = asksEbitLine ? findEbitdaLikeColumn(columns) : null;
  if (ebitMeasureCol) {
    valueColumn = ebitMeasureCol;
  }

  // Priority 1: Find columns mentioned in the query (skip EBITDA measure col — non-numeric ₹ cells
  // were wrongly treated as a grouping dimension)
  for (const col of columns) {
    if (ebitMeasureCol !== null && col === ebitMeasureCol) continue;
    const colLower = col.toLowerCase().trim().replace(/^\ufeff/, "");
    if (lowerInput.includes(colLower)) {
      if (isNumericColumn(data, col) && !isYearColumn(col) && !valueColumn) {
        valueColumn = col;
        console.log("✅ Found value column from query:", col);
      } else if (!isNumericColumn(data, col) && !groupColumn) {
        groupColumn = col;
        console.log("✅ Found group column from query:", col);
      }
    }
  }

  // Priority 2: Smart financial column detection
  if (!valueColumn) {
    if (mentionsLoss) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.loss) || 
                    findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    } else if (mentionsProfit && !wantsMargin) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.profit);
    } else if (mentionsRevenue) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    } else if (mentionsExpense) {
      valueColumn = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    }
    
    // Fallback to first numeric non-year column
    if (!valueColumn) {
      valueColumn = numericColumns.find(col => !isYearColumn(col)) || numericColumns[0];
    }
    console.log("💡 Smart detected value column:", valueColumn);
  }

  // Priority 3: Find grouping column - MORE AGGRESSIVE
  if (!groupColumn) {
    // SPECIAL: For trend queries, prioritize finding a VALID year column
    if (isTrendQuery) {
      const validYearCol = findYearColumn(data, columns);
      if (validYearCol) {
        groupColumn = validYearCol;
        console.log("📅 Found validated year column for trend:", groupColumn);
      }
    }
    
    // If query wants grouping OR mentions specific grouping keywords
    if (!groupColumn && (wantsGrouping || wantsTop || wantsBottom || 
        lowerInput.includes("show") || lowerInput.includes("what") || lowerInput.includes("which"))) {
      // Look for year/month/category mentions
      const potentialYear = findBestColumn(columns, FINANCIAL_KEYWORDS.year);
      
      // Validate year column actually contains years
      if (potentialYear && containsYearValues(data, potentialYear)) {
        groupColumn = potentialYear;
      } else {
        // Try other grouping options
        groupColumn = 
          findBestColumn(columns, FINANCIAL_KEYWORDS.month) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.category) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.product) ||
          findBestColumn(columns, FINANCIAL_KEYWORDS.customer) ||
          textColumns[0]; // Default to first text column
      }
      
      console.log("💡 Auto-detected group column:", groupColumn);
    }
  }

  // FORCE GROUPING: If we have both columns but no grouping, assume user wants grouping
  if (valueColumn && !groupColumn && textColumns.length > 0) {
    groupColumn = textColumns[0];
    console.log("🔧 Forcing group column (default behavior):", groupColumn);
  }

  // Handle special case: simple total without grouping
  if (wantsTotal && !wantsGrouping && valueColumn) {
    if (isFinancialFactsLayout(columns)) {
      return {
        sql: `-- Long facts: do not SUM(value) across mixed metrics; filter by metric first.`,
        table: data.slice(0, 20),
        chartData: [],
        message:
          "Your upload is **year / metric / value** rows. Asking for a single “total” would add revenue, expenses, and profit together. Ask for a **specific metric** (e.g. total revenue by year) or use **Analytics**.",
        chartType: "bar",
        insight: "Tip: e.g. “Total expenses by year” or “Other income % of revenue”.",
      };
    }
    const total = data.reduce((sum, row) => sum + (Number(row[valueColumn!]) || 0), 0);
    
    const sql = `SELECT SUM(${valueColumn}) as total FROM uploaded_data;`;
    const currency = detectCurrency(data, columns);
    const message = `The total ${valueColumn} is ${currency}${total.toLocaleString()}`;
    
    const insight = `Total ${valueColumn} across all records is ${currency}${total.toLocaleString()}. This represents the complete sum of ${data.length} data entries.`;
    
    return {
      sql,
      table: [{ "Metric": "Total", [valueColumn]: `${currency}${total.toLocaleString()}` }],
      chartData: [{ name: "Total", sales: total }],
      message,
      insight,
      chartType: "bar",
    };
  }

  // NEW: Handle comprehensive financial summary - HIGHEST PRIORITY
  if (wantsSummary) {
    console.log("🎯 SUMMARY QUERY DETECTED - EXECUTING COMPREHENSIVE SUMMARY");
    
    const revenueCol = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    const expenseCol = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    const profitCol = findBestColumn(columns, FINANCIAL_KEYWORDS.profit);
    const yearCol = findYearColumn(data, columns);
    
    console.log("📊 Summary columns found:", { revenueCol, expenseCol, profitCol, yearCol });
    
    if (revenueCol && expenseCol && yearCol) {
      // Calculate comprehensive metrics
      const totalRevenue = data.reduce((sum, row) => sum + (Number(row[revenueCol]) || 0), 0);
      const totalExpense = data.reduce((sum, row) => sum + (Number(row[expenseCol]) || 0), 0);
      const totalProfit = totalRevenue - totalExpense;
      const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      
      // Group by year to calculate growth and find best year
      const grouped = calculateProfit(data, yearCol, revenueCol, expenseCol);
      const yearlyData = Object.entries(grouped)
        .map(([year, values]) => ({
          year,
          revenue: values.revenue,
          expense: values.expense,
          profit: values.revenue - values.expense,
          margin: calculateProfitMargin(values.revenue - values.expense, values.revenue),
        }))
        .sort((a, b) => String(a.year).localeCompare(String(b.year))); // CHRONOLOGICAL SORT
      
      console.log("📅 Yearly data (sorted):", yearlyData);
      
      // Calculate average growth
      const revenueByYear = yearlyData.map(y => y.revenue);
      let totalGrowth = 0;
      let growthCount = 0;
      
      for (let i = 1; i < revenueByYear.length; i++) {
        if (revenueByYear[i - 1] > 0) {
          const growth = ((revenueByYear[i] - revenueByYear[i - 1]) / revenueByYear[i - 1]) * 100;
          totalGrowth += growth;
          growthCount++;
        }
      }
      
      const avgGrowth = growthCount > 0 ? totalGrowth / growthCount : 0;
      
      console.log("📈 Average growth:", avgGrowth, "from", growthCount, "periods");
      
      // Find best year using composite scoring
      let bestYear = yearlyData[0];
      let bestScore = -Infinity;
      
      yearlyData.forEach(yearData => {
        // Composite score: profit (50%) + margin (30%) + growth (20%)
        const profitScore = yearData.profit;
        const marginScore = yearData.margin * totalRevenue / 100; // Normalize margin
        
        // Calculate this year's growth
        const yearIndex = yearlyData.indexOf(yearData);
        let growthScore = 0;
        if (yearIndex > 0 && yearlyData[yearIndex - 1].revenue > 0) {
          const growth = ((yearData.revenue - yearlyData[yearIndex - 1].revenue) / yearlyData[yearIndex - 1].revenue) * 100;
          growthScore = growth * totalRevenue / 100; // Normalize growth
        }
        
        const compositeScore = (profitScore * 0.5) + (marginScore * 0.3) + (growthScore * 0.2);
        
        console.log(`🏆 ${yearData.year} score: ${compositeScore} (profit: ${profitScore}, margin: ${marginScore}, growth: ${growthScore})`);
        
        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          bestYear = yearData;
        }
      });
      
      const currency = detectCurrency(data, columns);
      
      // Build summary table
      const summaryTable = [
        { "Metric": "Total Revenue", "Value": `${currency}${totalRevenue.toLocaleString()}` },
        { "Metric": "Total Expenses", "Value": `${currency}${totalExpense.toLocaleString()}` },
        { "Metric": "Total Profit", "Value": `${currency}${totalProfit.toLocaleString()}` },
        { "Metric": "Overall Margin", "Value": `${overallMargin.toFixed(1)}%` },
        { "Metric": "Average Growth", "Value": `${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(1)}%` },
        { "Metric": "Best Year", "Value": `${bestYear.year} (${currency}${bestYear.profit.toLocaleString()} profit, ${bestYear.margin.toFixed(1)}% margin)` },
      ];
      
      // Chart data showing yearly breakdown
      const chartData = yearlyData.map(y => ({
        name: String(y.year),
        Revenue: y.revenue,
        Expense: y.expense,
        Profit: y.profit,
      }));
      
      // SQL representation
      const sql = `-- Financial Summary\nSELECT \n  SUM(${revenueCol}) as total_revenue,\n  SUM(${expenseCol}) as total_expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as total_profit,\n  ROUND(((SUM(${revenueCol}) - SUM(${expenseCol})) / SUM(${revenueCol})) * 100, 1) as overall_margin\nFROM uploaded_data;\n\n-- Yearly Breakdown\nSELECT \n  ${yearCol},\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit\nFROM uploaded_data\nGROUP BY ${yearCol}\nORDER BY ${yearCol};`;
      
      // Comprehensive insight with correct trend
      const firstYear = yearlyData[0];
      const lastYear = yearlyData[yearlyData.length - 1];
      const trendDescription = lastYear.revenue > firstYear.revenue ? "increasing" : "declining";
      
      const insight = `Complete Financial Summary: Total revenue of ${currency}${totalRevenue.toLocaleString()} with ${currency}${totalExpense.toLocaleString()} in expenses, resulting in ${currency}${totalProfit.toLocaleString()} profit (${overallMargin.toFixed(1)}% margin). Revenue shows ${trendDescription} trend from ${firstYear.year} to ${lastYear.year} with average year-over-year growth of ${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(1)}%. ${bestYear.year} was the best performing year with ${currency}${bestYear.profit.toLocaleString()} profit and ${bestYear.margin.toFixed(1)}% margin, driven by strong profitability${avgGrowth > 0 ? ' and consistent growth' : ''}.`;
      
      console.log("✅ SUMMARY COMPLETE - Returning comprehensive financial summary");
      
      return {
        sql,
        table: summaryTable,
        chartData,
        message: "Here is your comprehensive financial summary:",
        chartType: "multi-bar",
        insight,
        metrics: ["Revenue", "Expense", "Profit"],
      };
    }
    
    // Fallback if we can't find all required columns for summary
    console.log("⚠️ Summary requested but required columns not found");
  }

  // Handle calculation queries (profit = revenue - expense)
  if (mentionsProfit && mentionsRevenue && mentionsExpense) {
    const revenueCol = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    const expenseCol = findBestColumn(columns, FINANCIAL_KEYWORDS.expense);
    
    if (revenueCol && expenseCol && groupColumn) {
      const gCol = groupColumn;
      // Group by and calculate profit
      const grouped = calculateProfit(data, gCol, revenueCol, expenseCol);
      const results = Object.entries(grouped)
        .map(([key, values]) => ({
          [gCol]: key,
          profit: values.revenue - values.expense,
          revenue: values.revenue,
          expense: values.expense,
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

      const sql = `SELECT \n  ${gCol},\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit,\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense\nFROM uploaded_data\nGROUP BY ${gCol}\nORDER BY profit DESC\nLIMIT 10;`;

      const currency = detectCurrency(results, columns);

      const formattedTable = results.map((row) => ({
        [gCol]: row[gCol],
        "Profit": `${currency}${row.profit.toLocaleString()}`,
        "Revenue": `${currency}${row.revenue.toLocaleString()}`,
        "Expense": `${currency}${row.expense.toLocaleString()}`,
      }));

      const chartData = results.map((row) => ({
        name: String(row[gCol]),
        sales: row.profit,
      }));

      const insight = generateInsight(
        results,
        gCol,
        ["revenue", "expense"],
        lowerInput,
        currency
      );

      return {
        sql,
        table: formattedTable,
        chartData,
        message: `Here is the profit (revenue - expense) breakdown by ${gCol}:`,
        insight,
        chartType: "bar",
      };
    }
  }

  // NEW: Handle growth rate queries - PRIORITY BEFORE COMPARISON
  if (wantsGrowth && !wantsSummary && groupColumn && valueColumn) {
    const gCol = groupColumn;
    const vCol = valueColumn;
    console.log("🎯 GROWTH QUERY DETECTED - Calculating year-over-year growth");
    
    const resultsWithGrowth = calculateGrowthRate(data, gCol, vCol);
    
    console.log("📈 Growth results (first 3):", resultsWithGrowth.slice(0, 3));
    
    const sql = `SELECT \n  ${gCol},\n  SUM(${vCol}) as ${vCol},\n  ROUND(((SUM(${vCol}) - LAG(SUM(${vCol})) OVER (ORDER BY ${gCol})) / LAG(SUM(${vCol})) OVER (ORDER BY ${gCol})) * 100, 1) as growth_rate\nFROM uploaded_data\nGROUP BY ${gCol}\nORDER BY ${gCol} ASC;`;
    
    const currency = detectCurrency(resultsWithGrowth, columns);
    
    const formattedTable = resultsWithGrowth.map((row) => ({
      [gCol]: row[gCol],
      [vCol]: `${currency}${(row[vCol] as number).toLocaleString()}`,
      "Growth Rate": row.growth === 0 ? "—" : `${row.growth > 0 ? '+' : ''}${row.growth}%`,
    }));

    const chartData = resultsWithGrowth.map((row) => ({
      name: String(row[gCol]),
      [vCol]: row[vCol],
      "Growth %": row.growth,
    }));

    const insight = generateInsight(
      resultsWithGrowth,
      gCol,
      vCol,
      lowerInput,
      currency
    );

    console.log("✅ GROWTH QUERY COMPLETE");

    return {
      sql,
      table: formattedTable,
      chartData,
      message: `Here is the year-over-year growth rate for ${vCol}:`,
      chartType: "multi-line",
      insight,
      metrics: [vCol, "Growth Rate"],
    };
  }

  // NEW: Handle multi-metric comparison queries (compare revenue and expenses)
  // Only trigger if NOT a growth query
  if (!wantsGrowth && wantsComparison && (mentionsRevenue || mentionsExpense)) {
    console.log("🎯 COMPARISON QUERY DETECTED");
    
    // Use strict column detection
    const revenueCol = detectColumn(lowerInput, columns, "revenue");
    const expenseCol = detectColumn(lowerInput, columns, "expense");
    
    // Ensure group column is set (prioritize Year)
    if (!groupColumn) {
      const yearCol = findYearColumn(data, columns);
      if (yearCol) {
        groupColumn = yearCol;
        console.log("📅 Auto-selected Year column for comparison:", groupColumn);
      } else {
        groupColumn = textColumns[0];
      }
    }
    
    console.log("🔍 Multi-Metric Detection:", {
      revenueCol,
      expenseCol,
      groupColumn,
      query: lowerInput
    });
    
    if (revenueCol && expenseCol && groupColumn) {
      const gCol = groupColumn;
      // Group by and calculate both metrics
      const grouped = calculateProfit(data, gCol, revenueCol, expenseCol);
      
      // Sort by time if time-based
      const isTimeBased = isYearColumn(gCol) || /month|quarter|period|date/i.test(gCol);
      
      const results = Object.entries(grouped)
        .map(([key, values]) => ({
          [gCol]: key,
          revenue: values.revenue,
          expense: values.expense,
          profit: values.revenue - values.expense,
          margin: calculateProfitMargin(values.revenue - values.expense, values.revenue),
        }))
        .sort((a, b) => {
          if (isTimeBased) {
            return String(a[gCol]).localeCompare(String(b[gCol]));
          }
          return b.revenue - a.revenue;
        })
        .slice(0, 10);

      console.log("✅ Query Results (First 3):", results.slice(0, 3));

      const sql = `SELECT \n  ${gCol},\n  SUM(${revenueCol}) as revenue,\n  SUM(${expenseCol}) as expense,\n  SUM(${revenueCol}) - SUM(${expenseCol}) as profit,\n  ROUND(((SUM(${revenueCol}) - SUM(${expenseCol})) / SUM(${revenueCol})) * 100, 2) as profit_margin\nFROM uploaded_data\nGROUP BY ${gCol}\nORDER BY ${isTimeBased ? gCol : 'revenue'} ${isTimeBased ? 'ASC' : 'DESC'}\nLIMIT 10;`;

      const currency = detectCurrency(results, columns);
      
      const formattedTable = results.map((row) => ({
        [gCol]: row[gCol],
        "Revenue": `${currency}${row.revenue.toLocaleString()}`,
        "Expense": `${currency}${row.expense.toLocaleString()}`,
        "Profit": `${currency}${row.profit.toLocaleString()}`,
        "Margin": `${row.margin.toFixed(1)}%`,
      }));

      // Multi-metric chart data - use actual metric names
      const chartData = results.map((row) => ({
        name: String(row[gCol]),
        Revenue: row.revenue,
        Expense: row.expense,
        Profit: row.profit,
      }));

      console.log("📊 Chart Data (First 3):", chartData.slice(0, 3));

      const insight = generateInsight(
        results,
        gCol,
        ["revenue", "expense"],  // Use generic names for insight generation
        lowerInput,
        currency
      );

      console.log("💡 Generated Insight:", insight);

      return {
        sql,
        table: formattedTable,
        chartData,
        message: `Here is the comparison of ${revenueCol} and ${expenseCol} by ${gCol}:`,
        chartType: isTimeBased ? "multi-line" : "multi-bar",
        insight,
        metrics: [revenueCol, expenseCol, "Profit"],
      };
    }
  }

  // Net-style profit margin (wide sheets): profit line ÷ revenue × 100 — not raw PBT totals.
  const wantsNetMarginOnly =
    wantsMargin &&
    !wantsGrowth &&
    !wantsSummary &&
    !lowerInput.includes("gross margin") &&
    !(lowerInput.includes("gross") && lowerInput.includes("margin")) &&
    !lowerInput.includes("operating margin") &&
    !lowerInput.includes("ebitda margin");

  if (wantsNetMarginOnly && groupColumn) {
    const revenueCol = findBestColumn(columns, FINANCIAL_KEYWORDS.revenue);
    const profitCol = findBestColumn(columns, FINANCIAL_KEYWORDS.profit);
    if (
      revenueCol &&
      profitCol &&
      revenueCol !== profitCol &&
      isNumericColumn(data, revenueCol) &&
      isNumericColumn(data, profitCol)
    ) {
      const grouped = groupBySumTwoMetrics(data, groupColumn, revenueCol, profitCol);
      const isTimeBased =
        isYearColumn(groupColumn) ||
        /month|quarter|period|date/i.test(groupColumn);

      const rows = Object.entries(grouped)
        .map(([key, { a: revenueSum, b: profitSum }]) => {
          const marginPct =
            revenueSum !== 0 ? Math.round((10000 * profitSum) / revenueSum) / 100 : 0;
          return {
            [groupColumn]: key,
            [revenueCol]: revenueSum,
            [profitCol]: profitSum,
            profit_margin_pct: marginPct,
          };
        })
        .sort((x, y) => {
          if (isTimeBased) {
            return String(x[groupColumn]).localeCompare(String(y[groupColumn]));
          }
          return (y.profit_margin_pct as number) - (x.profit_margin_pct as number);
        })
        .slice(0, 10);

      if (rows.length === 0) {
        // fall through to generic paths
      } else {
      const sql = `SELECT 
  ${groupColumn},
  SUM(${revenueCol}) AS ${revenueCol},
  SUM(${profitCol}) AS ${profitCol},
  ROUND(100.0 * SUM(${profitCol}) / NULLIF(SUM(${revenueCol}), 0), 2) AS profit_margin_pct
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY ${groupColumn} ASC
LIMIT 10;`;

      const currency = detectCurrency(data, columns);
      const formattedTable = rows.map((row) => ({
        [groupColumn]: row[groupColumn],
        [revenueCol]: `${currency}${(row[revenueCol] as number).toLocaleString()}`,
        [profitCol]: `${currency}${(row[profitCol] as number).toLocaleString()}`,
        "Margin %": `${(row.profit_margin_pct as number).toFixed(1)}%`,
      }));

      const chartData = rows.map((row) => ({
        name: String(row[groupColumn]),
        sales: row.profit_margin_pct as number,
      }));

      const margins = rows.map((r) => r.profit_margin_pct as number);
      const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
      const bestIdx = rows.reduce(
        (bi, r, i) =>
          (r.profit_margin_pct as number) > (rows[bi].profit_margin_pct as number) ? i : bi,
        0,
      );
      const pl = profitCol.toLowerCase();
      const marginKind =
        pl.includes("pbt") || pl.includes("before tax") ? "Pre-tax profit margin" : "Net profit margin";
      const insight = `${marginKind} (${profitCol} ÷ ${revenueCol} × 100) averages ${avgMargin.toFixed(1)}% across periods. ${rows[bestIdx]?.[groupColumn]} shows the highest margin at ${(rows[bestIdx].profit_margin_pct as number).toFixed(1)}%.`;

      return {
        sql,
        table: formattedTable,
        chartData,
        message: `Here are profit margins by ${groupColumn} (${profitCol} as a % of ${revenueCol}):`,
        chartType: isTimeBased ? "line" : "bar",
        chartValueFormat: "percent",
        insight,
        metrics: [revenueCol, profitCol, "Margin %"],
      };
      }
    }
  }

  // Long facts: superlative + SUM(value) by year picks the wrong row (one metric per year in uploads).
  if (
    isFinancialFactsLayout(columns) &&
    groupColumn &&
    valueColumn &&
    /^value$/i.test(String(valueColumn)) &&
    findYearColumn(data, columns) === groupColumn &&
    wantsSingleAnswer &&
    mentionsProfit
  ) {
    const rawC = columns.find((c) => /^raw$/i.test(c));
    if (rawC && apexSeriesFromLongFactRows(data, rawC).length >= 2) {
      return {
        sql: `-- Avoid: SELECT year, SUM(value) ... on long facts (one mixed metric per year).`,
        table: data.slice(0, 12),
        chartData: [],
        message:
          "That question needs **net profit** values, not `SUM(value)` by year (that mixes line items). Re-run **“Which year had the highest net profit?”** — the chat now reads the multi-column **`raw`** row when present.",
        chartType: "bar",
        insight: "Image ingest often stores only one `value` per year; `raw` still has the full table text.",
      };
    }
  }

  // Handle grouped queries
  if (groupColumn && valueColumn) {
    let results: DataRow[] = [];
    let sql = "";
    let message = "";

    // Detect if groupColumn is time-based (year, month, quarter)
    const isTimeBased = 
      isYearColumn(groupColumn) ||
      /month/i.test(groupColumn) ||
      /quarter/i.test(groupColumn) ||
      /period/i.test(groupColumn) ||
      /date/i.test(groupColumn);
    
    const useLineChart = isTimeBased || isTrendQuery;

    if (wantsTotal) {
      // Group by and sum
      const grouped = groupBy(data, groupColumn, valueColumn, "sum");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [`total_${valueColumn}`]: value,
        }))
        .sort((a, b) => (b[`total_${valueColumn}`] as number) - (a[`total_${valueColumn}`] as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  SUM(${valueColumn}) as total_${valueColumn}
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY total_${valueColumn} DESC
LIMIT 10;`;

      message = `Here are the total ${valueColumn} grouped by ${groupColumn}:`;
    } else if (wantsAverage) {
      // Group by and average
      const grouped = groupBy(data, groupColumn, valueColumn, "avg");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [`avg_${valueColumn}`]: Math.round(value),
        }))
        .sort((a, b) => (b[`avg_${valueColumn}`] as number) - (a[`avg_${valueColumn}`] as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  AVG(${valueColumn}) as avg_${valueColumn}
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY avg_${valueColumn} DESC
LIMIT 10;`;

      message = `Here are the average ${valueColumn} by ${groupColumn}:`;
    } else if (wantsCount) {
      // Count by group
      const grouped = countBy(data, groupColumn);
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          count: value,
        }))
        .sort((a, b) => (b.count as number) - (a.count as number))
        .slice(0, 10);

      sql = `SELECT 
  ${groupColumn},
  COUNT(*) as count
FROM uploaded_data
GROUP BY ${groupColumn}
ORDER BY count DESC
LIMIT 10;`;

      message = `Here is the count by ${groupColumn}:`;
    } else {
      // Default: sum and group
      const grouped = groupBy(data, groupColumn, valueColumn, "sum");
      results = Object.entries(grouped)
        .map(([key, value]) => ({
          [groupColumn]: key,
          [valueColumn]: value,
        }))
        .sort((a, b) => {
          // OVERRIDE: If asking "which/what" with "highest/lowest", always sort by value
          if (wantsSingleAnswer) {
            if (wantsBottom) return (a[valueColumn] as number) - (b[valueColumn] as number);
            // Default to highest
            return (b[valueColumn] as number) - (a[valueColumn] as number);
          }
          
          // For time-based data WITHOUT superlative, sort by key (year/month)
          if (isTimeBased && !wantsTop && !wantsBottom) {
            const keyA = String(a[groupColumn]);
            const keyB = String(b[groupColumn]);
            return keyA.localeCompare(keyB);
          }
          
          // Sort by value
          if (wantsTop) return (b[valueColumn] as number) - (a[valueColumn] as number);
          if (wantsBottom) return (a[valueColumn] as number) - (b[valueColumn] as number);
          return (b[valueColumn] as number) - (a[valueColumn] as number);
        })
        .slice(0, wantsSingleAnswer ? 1 : 10); // Only 1 result if asking "which"

      // Build appropriate SQL and message
      const orderDirection = (wantsSingleAnswer && !wantsBottom) || wantsTop ? "DESC" : 
                             (wantsSingleAnswer && wantsBottom) || wantsBottom ? "ASC" : 
                             (isTimeBased ? "ASC" : "DESC");
      const limit = wantsSingleAnswer ? 1 : 10;

      sql = `SELECT \n  ${groupColumn},\n  SUM(${valueColumn}) as ${valueColumn}\nFROM uploaded_data\nGROUP BY ${groupColumn}\nORDER BY ${valueColumn} ${orderDirection}\nLIMIT ${limit};`;

      // Generate appropriate message
      if (wantsSingleAnswer && results.length > 0) {
        const topResult = results[0];
        const yearValue = topResult[groupColumn];
        const profitValue = topResult[valueColumn];
        const currency = detectCurrency(results, columns);
        message = `You earned the ${wantsBottom ? "lowest" : "highest"} ${valueColumn} in ${yearValue} with ${currency}${(profitValue as number).toLocaleString()}`;
      } else {
        message = `Here are your results by ${valueColumn}:`;
      }
    }

    // Format table and chart
    const formattedTable = formatTable(results);
    const chartData = formatChart(results);

    console.log("📊 Chart formatting:", {
      resultsLength: results.length,
      sampleResult: results[0],
      chartDataLength: chartData.length,
      sampleChartData: chartData[0],
      useLineChart
    });

    // Grouped SUM/AVG rows use total_${col} / avg_${col}, not the source column name
    const insightValueKey = wantsTotal
      ? `total_${valueColumn}`
      : wantsAverage
        ? `avg_${valueColumn}`
        : valueColumn;

    // NEW: Generate insight
    const currency = detectCurrency(results, columns);
    const insight = generateInsight(
      results,
      groupColumn,
      insightValueKey,
      lowerInput,
      currency
    );

    console.log("💡 Generated Insight for regular query:", insight);

    return { 
      sql, 
      table: formattedTable, 
      chartData, 
      message,
      chartType: useLineChart ? "line" : "bar", // NEW: specify chart type
      insight,
      metrics: [valueColumn],
    };
  }

  // Fallback: just show top 10 rows
  const results = data.slice(0, 10);
  const sql = `SELECT * FROM uploaded_data LIMIT 10;`;
  const message = "Here is a sample of your data:";

  // Try to generate a simple chart from the sample data
  let chartData: Array<{ name: string; sales: number }> = [];
  if (results.length > 0 && valueColumn) {
    chartData = results.map((row, idx) => ({
      name: String(row[columns[0]] || `Row ${idx + 1}`).slice(0, 20),
      sales: Number(row[valueColumn]) || 0,
    }));
  }

  // Generate insight for fallback data
  const currency = detectCurrency(results, columns);
  const fallbackInsight = generateFallbackInsight(results, columns, valueColumn, currency);

  return {
    sql,
    table: results,
    chartData,
    message,
    chartType: "bar",
    insight: fallbackInsight,
  };
}

function groupBy(
  data: DataRow[],
  groupCol: string,
  valueCol: string,
  operation: "sum" | "avg"
): Record<string, number> {
  const groups: Record<string, { sum: number; count: number }> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    const value = Number(row[valueCol]) || 0;

    if (!groups[key]) {
      groups[key] = { sum: 0, count: 0 };
    }

    groups[key].sum += value;
    groups[key].count += 1;
  }

  const result: Record<string, number> = {};
  for (const [key, { sum, count }] of Object.entries(groups)) {
    result[key] = operation === "sum" ? sum : sum / count;
  }

  return result;
}

function calculateProfit(
  data: DataRow[],
  groupCol: string,
  revenueCol: string,
  expenseCol: string
): Record<string, { revenue: number; expense: number }> {
  const groups: Record<string, { revenue: number; expense: number }> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    const revenue = Number(row[revenueCol]) || 0;
    const expense = Number(row[expenseCol]) || 0;

    if (!groups[key]) {
      groups[key] = { revenue: 0, expense: 0 };
    }

    groups[key].revenue += revenue;
    groups[key].expense += expense;
  }

  return groups;
}

function countBy(data: DataRow[], groupCol: string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of data) {
    const key = String(row[groupCol]);
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

function formatTable(results: DataRow[]): DataRow[] {
  const currency = detectCurrency(results, columns);
  return results.map((row) => {
    const formatted: DataRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") {
        // Format numbers with currency for financial columns
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("price") ||
          lowerKey.includes("cost") ||
          lowerKey.includes("revenue") ||
          lowerKey.includes("total") ||
          lowerKey.includes("sales") ||
          lowerKey.includes("profit") ||
          lowerKey.includes("expense") ||
          lowerKey.includes("income") ||
          lowerKey.includes("avg_") ||
          lowerKey.includes("sum_")
        ) {
          formatted[key] = `${currency}${value.toLocaleString()}`;
        } else {
          formatted[key] = value.toLocaleString();
        }
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  });
}

function formatChart(results: DataRow[]): Array<{ name: string; [key: string]: any }> {
  if (results.length === 0) return [];

  return results.map((row) => {
    const entries = Object.entries(row);

    // First entry is typically the grouping column (name)
    const nameCol = entries[0][0];
    const nameValue = String(row[nameCol]);

    // Find all numeric columns for the chart
    const chartRow: { name: string; [key: string]: any } = { name: nameValue };

    entries.forEach(([key, value]) => {
      if (key !== nameCol && typeof value === "number") {
        chartRow[key] = value;
      }
    });

    // Fallback: if no numeric values found, use "sales" key with 0
    if (Object.keys(chartRow).length === 1) {
      const valueCol = entries.find(([, v]) => typeof v === "number")?.[0] || entries[1]?.[0];
      chartRow["sales"] = valueCol ? Number(row[valueCol]) || 0 : 0;
    }

    return chartRow;
  });
}

function calculateGrowthRate(data: DataRow[], groupCol: string, valueCol: string): Array<{
  [key: string]: any;
  growth: number;
}> {
  const sorted = [...data].sort((a, b) => 
    String(a[groupCol]).localeCompare(String(b[groupCol]))
  );
  
  const grouped = groupBy(sorted, groupCol, valueCol, "sum");
  const entries = Object.entries(grouped);
  
  return entries.map(([key, value], index) => {
    let growth = 0;
    if (index > 0) {
      const previous = entries[index - 1][1];
      growth = previous !== 0 ? ((value - previous) / previous) * 100 : 0;
    }
    return {
      [groupCol]: key,
      [valueCol]: value,
      growth: Math.round(growth * 10) / 10, // Round to 1 decimal
    };
  });
}

function calculateProfitMargin(profit: number, revenue: number): number {
  return revenue !== 0 ? (profit / revenue) * 100 : 0;
}

// NEW: Smart Insight Generator
function generateInsight(
  data: Array<Record<string, any>>,
  groupCol: string,
  valueCol: string | string[],
  queryType: string,
  currency: string
): string {
  console.log("🔍 generateInsight called with:", {
    dataLength: data.length,
    groupCol,
    valueCol,
    queryType,
    currency,
    sampleData: data.slice(0, 2)
  });
  
  if (data.length === 0) {
    console.log("❌ No data - returning empty string");
    return "";
  }

  const insights: string[] = [];
  const valueColumns = Array.isArray(valueCol) ? valueCol : [valueCol];
  
  console.log("🎯 Value columns:", valueColumns);

  // For multi-metric queries (compare revenue and expenses)
  if (valueColumns.length > 1) {
    const firstMetric = valueColumns[0];
    const secondMetric = valueColumns[1];
    
    // Calculate totals using proper numeric extraction
    const total1 = data.reduce((sum, row) => {
      const val = typeof row[firstMetric] === 'number' ? row[firstMetric] : 0;
      return sum + val;
    }, 0);
    
    const total2 = data.reduce((sum, row) => {
      const val = typeof row[secondMetric] === 'number' ? row[secondMetric] : 0;
      return sum + val;
    }, 0);
    
    // Only add totals if they're meaningful
    if (total1 > 0 || total2 > 0) {
      insights.push(`Total ${firstMetric}: ${currency}${total1.toLocaleString()}, Total ${secondMetric}: ${currency}${total2.toLocaleString()}.`);
    }
    
    // Calculate profit margin if comparing revenue and expenses
    if (firstMetric.toLowerCase().includes("revenue") && secondMetric.toLowerCase().includes("expense")) {
      if (total1 > 0) {
        const overallProfit = total1 - total2;
        const overallMargin = (overallProfit / total1) * 100;
        insights.push(`Overall profit margin is ${overallMargin.toFixed(1)}% with net profit of ${currency}${overallProfit.toLocaleString()}.`);
      }
      
      // Find best performing year based on profit
      let bestYear = data[0];
      let bestProfit = (typeof data[0][firstMetric] === 'number' ? data[0][firstMetric] : 0) - 
                       (typeof data[0][secondMetric] === 'number' ? data[0][secondMetric] : 0);
      
      data.forEach(row => {
        const revenue = typeof row[firstMetric] === 'number' ? row[firstMetric] : 0;
        const expense = typeof row[secondMetric] === 'number' ? row[secondMetric] : 0;
        const profit = revenue - expense;
        
        if (profit > bestProfit) {
          bestProfit = profit;
          bestYear = row;
        }
      });
      
      const bestYearRevenue = typeof bestYear[firstMetric] === 'number' ? bestYear[firstMetric] : 0;
      const bestYearExpense = typeof bestYear[secondMetric] === 'number' ? bestYear[secondMetric] : 0;
      const bestYearMargin = bestYearRevenue > 0 ? ((bestYearRevenue - bestYearExpense) / bestYearRevenue) * 100 : 0;
      
      insights.push(`${bestYear[groupCol]} was the best year with ${currency}${bestYearRevenue.toLocaleString()} revenue, ${currency}${bestYearExpense.toLocaleString()} expenses, and ${bestYearMargin.toFixed(1)}% profit margin.`);
    }
    
    // Detect trends for both metrics
    const values1 = data.map(row => typeof row[firstMetric] === 'number' ? row[firstMetric] : 0);
    const values2 = data.map(row => typeof row[secondMetric] === 'number' ? row[secondMetric] : 0);
    
    const trend1 = detectTrendWithDetails(values1);
    const trend2 = detectTrendWithDetails(values2);
    
    if (values1.length > 1 && values2.length > 1) {
      const firstYear = data[0][groupCol];
      const lastYear = data[data.length - 1][groupCol];
      
      // Calculate growth rates
      if (values1[0] > 0) {
        const growth1 = ((values1[values1.length - 1] - values1[0]) / values1[0]) * 100;
        insights.push(`${firstMetric} ${trend1.description} from ${firstYear} to ${lastYear} with ${growth1 > 0 ? '+' : ''}${growth1.toFixed(1)}% total growth.`);
      }
      
      if (values2[0] > 0) {
        const growth2 = ((values2[values2.length - 1] - values2[0]) / values2[0]) * 100;
        insights.push(`${secondMetric} ${trend2.description} with ${growth2 > 0 ? '+' : ''}${growth2.toFixed(1)}% growth, ${growth2 < (values1[0] > 0 ? ((values1[values1.length - 1] - values1[0]) / values1[0]) * 100 : 0) ? 'indicating strong cost control' : 'growing faster than revenue'}.`);
      }
    }
    
    return insights.join(" ");
  }

  // For single metric queries
  const singleValueCol = valueColumns[0];
  const values = data.map(row => typeof row[singleValueCol] === 'number' ? row[singleValueCol] : 0);
  
  if (values.every(v => v === 0)) {
    return "No meaningful data available for analysis.";
  }
  
  // Find best and worst with proper numeric handling
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values.filter(v => v > 0));
  const maxIndex = values.indexOf(maxValue);
  const minIndex = values.indexOf(minValue);
  
  if (data.length > 1 && maxValue > 0) {
    const bestPeriod = data[maxIndex][groupCol];
    insights.push(`${bestPeriod} is the best performing period with ${currency}${maxValue.toLocaleString()}.`);
    
    if (queryType.includes("compare") || queryType.includes("analyze") || queryType.includes("worst")) {
      if (minValue > 0 && minValue !== maxValue) {
        const worstPeriod = data[minIndex][groupCol];
        insights.push(`${worstPeriod} is the weakest period with ${currency}${minValue.toLocaleString()}.`);
      }
    }
  }
  
  // Detect trend with growth details
  if (values.length > 1) {
    const trendInfo = detectTrendWithDetails(values);
    const firstPeriod = data[0][groupCol];
    const lastPeriod = data[data.length - 1][groupCol];
    
    if (values[0] > 0) {
      const totalGrowth = ((values[values.length - 1] - values[0]) / values[0]) * 100;
      insights.push(`${singleValueCol} ${trendInfo.description} from ${firstPeriod} to ${lastPeriod} with ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(1)}% total growth.`);
    } else {
      insights.push(`${singleValueCol} ${trendInfo.description} across the period.`);
    }
  }
  
  // Calculate and report average growth if growth data exists
  if (data[0].growth !== undefined) {
    const growthValues = data
      .filter(row => typeof row.growth === 'number' && !isNaN(row.growth) && row.growth !== 0)
      .map(row => row.growth);
    
    if (growthValues.length > 0) {
      const avgGrowth = growthValues.reduce((sum, g) => sum + g, 0) / growthValues.length;
      const maxGrowthIndex = data.findIndex(row => row.growth === Math.max(...data.map(r => r.growth || 0)));
      
      if (maxGrowthIndex >= 0 && data[maxGrowthIndex].growth) {
        insights.push(`Peak growth of ${data[maxGrowthIndex].growth.toFixed(1)}% occurred in ${data[maxGrowthIndex][groupCol]}, with average YoY growth of ${avgGrowth.toFixed(1)}%.`);
      }
    }
  }
  
  // Detect anomalies
  const anomalies = detectAnomalies(data, groupCol, singleValueCol, values);
  if (anomalies.length > 0 && anomalies.length <= 2) {
    insights.push(`Anomalies detected in ${anomalies.join(", ")}.`);
  }
  
  const finalInsight = insights.join(" ");
  console.log("✅ Returning insight:", {
    insightsArray: insights,
    finalInsight,
    length: finalInsight.length
  });
  
  return finalInsight;
}

// NEW: Enhanced Trend Detection with details
function detectTrendWithDetails(values: number[]): { trend: string; description: string } {
  if (values.length < 2) return { trend: "insufficient", description: "shows insufficient data" };
  
  let increases = 0;
  let decreases = 0;
  let stable = 0;
  
  for (let i = 1; i < values.length; i++) {
    const change = ((values[i] - values[i - 1]) / (values[i - 1] || 1)) * 100;
    if (Math.abs(change) < 2) stable++;
    else if (values[i] > values[i - 1]) increases++;
    else if (values[i] < values[i - 1]) decreases++;
  }
  
  const threshold = values.length * 0.6;
  
  if (increases >= threshold) return { trend: "upward", description: "shows consistent upward growth" };
  if (decreases >= threshold) return { trend: "downward", description: "shows a declining trend" };
  if (stable >= threshold) return { trend: "stable", description: "remains relatively stable" };
  
  // Mixed trend
  const overallChange = values[values.length - 1] - values[0];
  if (overallChange > 0) return { trend: "mixed-positive", description: "shows overall growth with some fluctuations" };
  if (overallChange < 0) return { trend: "mixed-negative", description: "shows overall decline with fluctuations" };
  return { trend: "stable", description: "remains stable" };
}

// NEW: Anomaly Detection
function detectAnomalies(
  data: Array<Record<string, any>>,
  groupCol: string,
  valueCol: string,
  values: number[]
): string[] {
  if (values.length < 3) return [];
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
  );
  
  const anomalies: string[] = [];
  const threshold = 1.5; // Standard deviations
  
  values.forEach((value, index) => {
    const zScore = Math.abs((value - mean) / stdDev);
    if (zScore > threshold) {
      anomalies.push(`${data[index][groupCol]} (${zScore.toFixed(1)}σ)`);
    }
  });
  
  return anomalies;
}

// NEW: Fallback Insight Generator
function generateFallbackInsight(
  data: DataRow[],
  columns: string[],
  valueColumn: string | null,
  currency: string
): string {
  if (data.length === 0) {
    return "No data available for analysis.";
  }

  const insights: string[] = [];

  // Check if valueColumn is set and numeric
  if (valueColumn && isNumericColumn(data, valueColumn)) {
    const values = data.map(row => Number(row[valueColumn]) || 0);
    
    if (values.every(v => v === 0)) {
      return "No meaningful data available for analysis.";
    }
    
    // Find best and worst with proper numeric handling
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values.filter(v => v > 0));
    const maxIndex = values.indexOf(maxValue);
    const minIndex = values.indexOf(minValue);
    
    if (data.length > 1 && maxValue > 0) {
      const bestPeriod = data[maxIndex][columns[0]];
      insights.push(`${bestPeriod} is the best performing period with ${currency}${maxValue.toLocaleString()}.`);
      
      if (minValue > 0 && minValue !== maxValue) {
        const worstPeriod = data[minIndex][columns[0]];
        insights.push(`${worstPeriod} is the weakest period with ${currency}${minValue.toLocaleString()}.`);
      }
    }
    
    // Detect trend with growth details
    if (values.length > 1) {
      const trendInfo = detectTrendWithDetails(values);
      const firstPeriod = data[0][columns[0]];
      const lastPeriod = data[data.length - 1][columns[0]];
      
      if (values[0] > 0) {
        const totalGrowth = ((values[values.length - 1] - values[0]) / values[0]) * 100;
        insights.push(`${valueColumn} ${trendInfo.description} from ${firstPeriod} to ${lastPeriod} with ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(1)}% total growth.`);
      } else {
        insights.push(`${valueColumn} ${trendInfo.description} across the period.`);
      }
    }
  }

  const finalInsight = insights.join(" ");
  console.log("✅ Returning fallback insight:", {
    insightsArray: insights,
    finalInsight,
    length: finalInsight.length
  });
  
  return finalInsight;
}