/**
 * Financial formula engine for CSV / local sheets:
 * - **Long** format: `year`, `metric`, `value` (same as server `financial_facts`).
 * - **Wide** format: one row per period, column headers are line items (e.g. Apex P&L CSV).
 * Mirrors backend `financial_formulas_sql.py` logic where possible.
 */

import type { DataRow, QueryResult } from "../types/data";
import { isFinancialFactsLayout } from "./analytics-infer";

export type PivotMetrics = {
  revenue?: number;
  /** Top-line total income (distinct from operating revenue when both are present). */
  total_income?: number;
  cogs?: number;
  expenses?: number;
  net_income?: number;
  operating_income?: number;
  ebitda?: number;
  /** P&L line: Profit Before Tax (add back finance cost + depreciation → EBITDA). */
  pbt?: number;
  /** Income-statement depreciation (not accumulated depreciation on B/S). */
  depreciation_charge?: number;
  /** When the sheet has EPS column but not share count. */
  reported_eps?: number;
  /** Long-format / PDF ingest line item when COGS is missing (snake_case `gross_profit`). */
  reported_gross_profit?: number;
  equity?: number;
  total_assets?: number;
  current_assets?: number;
  current_liabilities?: number;
  inventory?: number;
  receivables?: number;
  payables?: number;
  total_debt?: number;
  interest_expense?: number;
  shares?: number;
  share_price?: number;
};

export type FormulaKind =
  | "all"
  | "gross_profit"
  | "gross_margin"
  | "operating_margin"
  | "ebitda_margin"
  | "ebitda_absolute"
  | "net_margin"
  | "yoy"
  | "roe"
  | "roa"
  | "roce"
  | "current_ratio"
  | "quick_ratio"
  | "debt_to_equity"
  | "interest_coverage"
  | "asset_turnover"
  | "inventory_days"
  | "receivable_days"
  | "payable_days"
  | "eps"
  | "pe";

/** Headers that are EBITDA in practice but rarely contain the substring "ebitda" (incl. India / IFRS wording). */
function headerMapsToEbitdaLine(raw: string): boolean {
  const t = raw.trim().replace(/^\ufeff/, "");
  const lc = t.toLowerCase();
  const letters = lc.replace(/[^a-z]/g, "");

  if (lc.includes("ebitda") || letters.includes("ebitda")) return true;
  if (lc.includes("ebita") && !lc.includes("ebitda")) return true;
  if (letters.includes("ebidta") || letters.includes("ebdita")) return true;
  if (letters.includes("pbidt") || letters.includes("pbitda") || letters.includes("pbdt")) return true;
  if (letters.includes("oibda")) return true;
  if (
    lc.includes("depreciation") &&
    (lc.includes("amortization") || lc.includes("amortisation")) &&
    (lc.includes("interest") || lc.includes("tax") || lc.includes("finance cost")) &&
    (lc.includes("before") || lc.includes("earnings"))
  )
    return true;
  return false;
}

/** Normalize metric labels from PDF/DB long facts (trim, quotes, trailing FY tokens). */
function normalizeFactMetric(raw: unknown): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\s*\(?\s*FY\s*(19|20)\d{2}\s*\)?$/i, "").trim();
  return s;
}

function classifyMetric(raw: string): keyof PivotMetrics | null {
  const m = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const u = m.replace(/\s+/g, "_");

  // PDF/image `/ingest/*` uses snake_case ids (see FINANCIAL_METRICS in pdf_financial_ingest.py).
  if (u === "net_profit") return "net_income";
  if (u === "operating_profit") return "operating_income";
  if (u === "gross_profit") return "reported_gross_profit";
  if (u === "profit_before_tax" || u === "profit_before_tax_pbt") return "pbt";
  if (u === "finance_cost" || u === "finance_costs" || u === "interest_expense")
    return "interest_expense";
  if (u === "depreciation" || u === "depreciation_amortization") return "depreciation_charge";
  if (u === "cost_of_materials" || u === "cogs_line") return "cogs";
  if (u === "total_income" || (m.includes("total income") && !m.includes("other income"))) return "total_income";

  if (u === "revenue" || u === "sales" || u === "turnover" || u === "net_sales") return "revenue";
  if (m.includes("revenue") && !m.includes("other") && !m.includes("non-operating") && !m.includes("total income"))
    return "revenue";

  if (
    u === "cogs" ||
    m.includes("cost of goods") ||
    m.includes("cost_of_goods") ||
    m.includes("cost of material")
  )
    return "cogs";

  if (u === "expenses" || u === "expense" || m === "total expenses" || m === "operating expenses")
    return "expenses";
  if (m.includes("total expense") && !m.includes("tax")) return "expenses";

  if (
    (m.includes("profit before tax") || /\bpbt\b/.test(m)) &&
    !m.includes("after tax") &&
    !m.includes("net profit")
  )
    return "pbt";

  if (
    u === "net_income" ||
    m.includes("net income") ||
    m.includes("net profit") ||
    m.includes("profit after tax") ||
    /\bpat\b/.test(m)
  )
    return "net_income";

  // Image/OCR sometimes emits a bare "profit" for PAT.
  if (u === "profit" && !m.includes("before") && !m.includes("gross") && !m.includes("operating"))
    return "net_income";

  if (m.includes("ebitda") || m.includes("ebita")) return "ebitda";
  if (headerMapsToEbitdaLine(raw)) return "ebitda";

  if (u === "operating_income" || m.includes("operating income") || u === "ebit") return "operating_income";

  if (u === "equity" || m.includes("shareholders equity") || u === "shareholders_equity" || u === "total_equity")
    return "equity";

  if (u === "total_assets" || u === "assets") return "total_assets";

  if (u === "current_assets") return "current_assets";
  if (u === "current_liabilities") return "current_liabilities";

  if (u === "inventory" || u === "inventories") return "inventory";

  if (
    u === "receivables" ||
    u === "trade_receivables" ||
    m.includes("accounts receivable")
  )
    return "receivables";

  if (u === "payables" || u === "trade_payables" || m.includes("accounts payable")) return "payables";

  if (u === "total_debt" || u === "debt") return "total_debt";

  if (u === "interest_expense" || m.includes("finance cost")) return "interest_expense";

  if (
    (m.includes("depreciation") || m.includes("amortisation") || m.includes("amortization")) &&
    !m.includes("accumulated") &&
    !m.includes("less:")
  )
    return "depreciation_charge";

  if (/\beps\b/.test(m) || m.includes("earnings per share")) return "reported_eps";

  if (u === "shares" || u === "shares_outstanding" || u === "weighted_avg_shares") return "shares";

  if (u === "share_price") return "share_price";

  return null;
}

function numberFromCell(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    let s = v.trim().replace(/\u00a0/g, " ");
    if (s === "" || s === "—" || s === "-" || /^n\/?a$/i.test(s)) return NaN;
    let neg = false;
    if (s.startsWith("(") && s.endsWith(")")) {
      neg = true;
      s = s.slice(1, -1).trim();
    }
    s = s.replace(/[₹$€£¥\s]/g, "").replace(/^rs\.?/i, "");
    s = s.replace(/,/g, "");
    if (s.endsWith("%")) s = s.slice(0, -1).trim();
    const n = parseFloat(s);
    if (Number.isFinite(n)) return neg ? -n : n;
    const digits = s.replace(/[^\d.-]/g, "");
    const n2 = parseFloat(digits);
    if (Number.isFinite(n2)) return neg ? -n2 : n2;
    return NaN;
  }
  return NaN;
}

/** FY 2023 / 2023 style periods (same idea as query-executor). */
function findYearColumnForFormulas(rows: DataRow[], columns: string[]): string | null {
  const yearNamed = columns.filter(
    (c) => /^year$/i.test(c.trim()) || /year$/i.test(c.trim()) || /^fy$/i.test(c.trim()),
  );
  const isYearLikeValue = (v: unknown): boolean => {
    const s = String(v ?? "").trim();
    return /^(19|20)\d{2}$/.test(s) || /^FY\s*(19|20)\d{2}$/i.test(s);
  };
  for (const col of yearNamed) {
    const values = rows.map((row) => row[col]).filter((v) => v != null && v !== "");
    if (values.length === 0) continue;
    const ok = values.filter(isYearLikeValue).length;
    if (ok / values.length >= 0.5) return col;
  }
  for (const col of columns) {
    const values = rows.map((row) => row[col]).filter((v) => v != null && v !== "");
    if (values.length === 0) continue;
    const ok = values.filter(isYearLikeValue).length;
    if (ok / values.length >= 0.5) return col;
  }
  return null;
}

/** Match query-executor: pick the single best EBITDA-like header when labels are non-standard. */
function ebitdaHeaderStrength(raw: string): number {
  const lc = raw.toLowerCase().trim().replace(/^\ufeff/, "");
  const letters = lc.replace(/[^a-z]/g, "");
  if (lc.includes("ebitda") || letters.includes("ebitda")) return 4;
  if (
    lc.includes("ebita") ||
    letters.includes("ebita") ||
    letters.includes("ebidta") ||
    letters.includes("ebdita") ||
    letters === "editda"
  )
    return 3;
  if (/\bebit\b/.test(lc) || /(^|[^a-z])ebit([^a-z]|$)/.test(lc)) return 2;
  if (letters.includes("pbidt") || letters.includes("oibda") || letters.includes("pbitda") || letters.includes("pbdt"))
    return 2;
  if (
    lc.includes("depreciation") &&
    (lc.includes("amortization") || lc.includes("amortisation")) &&
    (lc.includes("interest") || lc.includes("tax") || lc.includes("finance cost")) &&
    (lc.includes("before") || lc.includes("earnings"))
  )
    return 2;
  return 0;
}

function bestEbitdaLikeColumn(columns: string[], yearCol: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const col of columns) {
    if (col === yearCol) continue;
    const s = ebitdaHeaderStrength(col);
    if (s > bestScore) {
      bestScore = s;
      best = col;
    }
  }
  return bestScore >= 2 ? best : null;
}

function pivotFromWideSheet(
  rows: DataRow[],
  columns: string[],
  yearCol: string,
): Map<string, PivotMetrics> {
  const map = new Map<string, PivotMetrics>();
  for (const row of rows) {
    const period = String(row[yearCol] ?? "").trim();
    if (!period) continue;
    const agg: PivotMetrics = { ...(map.get(period) || {}) };
    for (const col of columns) {
      if (col === yearCol) continue;
      const keyMetric = classifyMetric(col);
      if (!keyMetric) continue;
      const v = numberFromCell(row[col]);
      if (!Number.isFinite(v)) continue;
      agg[keyMetric] = (agg[keyMetric] || 0) + v;
    }
    map.set(period, agg);
  }

  let anyEbitda = false;
  for (const agg of map.values()) {
    if (agg.ebitda != null && Number.isFinite(agg.ebitda)) {
      anyEbitda = true;
      break;
    }
  }
  const fallbackCol = !anyEbitda ? bestEbitdaLikeColumn(columns, yearCol) : null;
  if (fallbackCol) {
    for (const row of rows) {
      const period = String(row[yearCol] ?? "").trim();
      if (!period) continue;
      const v = numberFromCell(row[fallbackCol]);
      if (!Number.isFinite(v)) continue;
      const agg: PivotMetrics = { ...(map.get(period) || {}) };
      agg.ebitda = (agg.ebitda || 0) + v;
      map.set(period, agg);
    }
  }

  return map;
}

/**
 * When headers/values did not map into pivot.ebitda, pick the best numeric column by name
 * (handles "Cash Accrual EBITDA", "Reported EBITDA", odd spacing, etc.).
 */
function rescueEbitdaSourceColumn(
  columns: string[],
  yearCol: string,
  rows: DataRow[],
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  const nRows = rows.length || 1;
  for (const col of columns) {
    if (col === yearCol) continue;
    const lc = col.toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
    let score = 0;
    if (/ebitda|ebita|ebidta|ebdita|editda/i.test(lc)) score += 100;
    if (/\b(pbdt|pbidt|pbitda|oibda)\b/i.test(lc)) score += 85;
    if (/cash\s+accrual|reported\s+ebitda|normalized\s+ebitda|adjusted\s+ebitda/i.test(lc)) score += 88;
    if (/operating\s+ebitda/i.test(lc)) score += 92;
    if (/profit\s+before.*depreciation|before.*depreciation.*amort/i.test(lc)) score += 75;
    if (/\bebit\b/i.test(lc) && !/debit/i.test(lc)) score += 55;
    const numericRows = rows.filter((r) => Number.isFinite(numberFromCell(r[col]))).length;
    if (numericRows === 0) continue;
    if (numericRows < Math.max(1, Math.floor(nRows * 0.4))) continue;
    score += Math.min(15, numericRows);
    if (score > bestScore) {
      bestScore = score;
      best = col;
    }
  }
  return bestScore >= 50 ? best : null;
}

function patchEbitdaAbsoluteFromColumn(
  computed: ComputedRow[],
  data: DataRow[],
  yearCol: string,
  sourceCol: string,
): void {
  for (const row of computed) {
    const target = String(row.period ?? "").trim();
    const dr =
      data.find((d) => String(d[yearCol] ?? "").trim() === target) ??
      data.find((d) => String(d[yearCol] ?? "").trim().toLowerCase() === target.toLowerCase());
    if (!dr) continue;
    const v = numberFromCell(dr[sourceCol]);
    if (Number.isFinite(v)) row.ebitda_amount = v;
  }
}

function countClassifiedMetricColumns(columns: string[], yearCol: string): number {
  let n = 0;
  for (const c of columns) {
    if (c === yearCol) continue;
    if (classifyMetric(c) != null) n++;
  }
  return n;
}

function isWideFinancialFactsSheet(columns: string[], rows: DataRow[]): boolean {
  if (isFinancialFactsLayout(columns) || rows.length === 0) return false;
  const y = findYearColumnForFormulas(rows, columns);
  if (!y) return false;
  return countClassifiedMetricColumns(columns, y) >= 2;
}

/** Long `year`/`metric`/`value` **or** wide P&L-style sheet → formula engine may apply. */
export function canUseCsvFormulaEngine(columns: string[], rows: DataRow[]): boolean {
  return isFinancialFactsLayout(columns) || isWideFinancialFactsSheet(columns, rows);
}

function pivotFacts(
  rows: DataRow[],
  yearCol: string,
  metricCol: string,
  valueCol: string,
): Map<string, PivotMetrics> {
  const map = new Map<string, PivotMetrics>();

  for (const row of rows) {
    const p = String(row[yearCol] ?? "").trim();
    if (!p) continue;
    const keyMetric = classifyMetric(normalizeFactMetric(row[metricCol]));
    if (!keyMetric) continue;
    const v = numberFromCell(row[valueCol]);
    if (!Number.isFinite(v)) continue;

    const agg: PivotMetrics = { ...(map.get(p) || {}) };
    agg[keyMetric] = (agg[keyMetric] || 0) + v;
    map.set(p, agg);
  }

  return map;
}

function fiscalYearSortKey(p: string): number {
  const t = p.trim();
  const fy = t.match(/FY\s*((?:19|20)\d{2})/i);
  if (fy) return parseInt(fy[1], 10);
  const y = t.match(/\b((?:19|20)\d{2})\b/);
  if (y) return parseInt(y[1], 10);
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? NaN : n;
}

function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const ka = fiscalYearSortKey(a);
    const kb = fiscalYearSortKey(b);
    if (Number.isFinite(ka) && Number.isFinite(kb)) return ka - kb;
    return a.localeCompare(b);
  });
}

function r2(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.round(x * 100) / 100;
}

function r3(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.round(x * 1000) / 1000;
}

function r4(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  return Math.round(x * 10000) / 10000;
}

type ComputedRow = Record<string, string | number | null>;

function computeRow(
  period: string,
  p: PivotMetrics,
  prev: PivotMetrics | null,
): ComputedRow {
  const revenue = p.revenue;
  const total_income_line = p.total_income;
  const cogs = p.cogs;
  const expenses = p.expenses;
  const net_income = p.net_income;
  /** Net margin denominator: prefer explicit total income when present (matches common P&L wording). */
  const netMarginDenom = total_income_line ?? revenue;
  const operating_income = p.operating_income;
  const grossProfitBase =
    revenue != null && cogs != null
      ? revenue - cogs
      : p.reported_gross_profit != null && Number.isFinite(p.reported_gross_profit)
        ? p.reported_gross_profit
        : null;
  const ebitdaFromPbt =
    p.ebitda == null &&
    p.pbt != null &&
    p.interest_expense != null &&
    p.depreciation_charge != null &&
    Number.isFinite(p.pbt) &&
    Number.isFinite(p.interest_expense) &&
    Number.isFinite(p.depreciation_charge)
      ? p.pbt + p.interest_expense + p.depreciation_charge
      : null;
  const ebitda =
    p.ebitda ??
    (ebitdaFromPbt != null && Number.isFinite(ebitdaFromPbt) ? ebitdaFromPbt : null);

  const op_for_margin =
    operating_income != null
      ? operating_income
      : expenses != null && revenue != null
        ? revenue - expenses
        : null;

  const ebit_for = ebitda != null ? ebitda : operating_income != null ? operating_income : null;

  const ce =
    p.total_assets != null && p.current_liabilities != null
      ? p.total_assets - p.current_liabilities
      : null;

  let yoy_rev: number | null = null;
  let yoy_ni: number | null = null;
  if (prev && prev.revenue != null && revenue != null && prev.revenue !== 0) {
    yoy_rev = r2((100 * (revenue - prev.revenue)) / prev.revenue);
  }
  if (prev && prev.net_income != null && net_income != null && Math.abs(prev.net_income) > 1e-9) {
    yoy_ni = r2((100 * (net_income - prev.net_income)) / Math.abs(prev.net_income));
  }

  return {
    period,
    revenue: revenue ?? null,
    net_income: net_income ?? null,
    ebitda_amount: ebitda ?? null,
    gross_margin_pct:
      grossProfitBase != null && revenue != null && revenue !== 0
        ? r2((100 * grossProfitBase) / revenue)
        : null,
    operating_margin_pct:
      op_for_margin != null && revenue != null && revenue !== 0
        ? r2((100 * op_for_margin) / revenue)
        : null,
    ebitda_margin_pct:
      ebitda != null && revenue != null && revenue !== 0 ? r2((100 * ebitda) / revenue) : null,
    net_profit_margin_pct:
      net_income != null && netMarginDenom != null && netMarginDenom !== 0
        ? r2((100 * net_income) / netMarginDenom)
        : null,
    roe_pct: net_income != null && p.equity != null && p.equity !== 0 ? r2((100 * net_income) / p.equity) : null,
    roa_pct:
      net_income != null && p.total_assets != null && p.total_assets !== 0
        ? r2((100 * net_income) / p.total_assets)
        : null,
    roce_pct:
      ebit_for != null && ce != null && ce !== 0 ? r2((100 * ebit_for) / ce) : null,
    current_ratio:
      p.current_assets != null && p.current_liabilities != null && p.current_liabilities !== 0
        ? r3(p.current_assets / p.current_liabilities)
        : null,
    quick_ratio:
      p.current_assets != null && p.current_liabilities != null && p.current_liabilities !== 0
        ? r3((p.current_assets - (p.inventory ?? 0)) / p.current_liabilities)
        : null,
    debt_to_equity:
      p.total_debt != null && p.equity != null && p.equity !== 0 ? r3(p.total_debt / p.equity) : null,
    interest_coverage:
      ebit_for != null && p.interest_expense != null && p.interest_expense !== 0
        ? r3(ebit_for / p.interest_expense)
        : null,
    asset_turnover:
      revenue != null && p.total_assets != null && p.total_assets !== 0
        ? r3(revenue / p.total_assets)
        : null,
    inventory_days:
      p.inventory != null && cogs != null && cogs !== 0
        ? r2((365 * p.inventory) / cogs)
        : null,
    receivable_days:
      p.receivables != null && revenue != null && revenue !== 0 ? r2((365 * p.receivables) / revenue) : null,
    payable_days: p.payables != null && cogs != null && cogs !== 0 ? r2((365 * p.payables) / cogs) : null,
    eps:
      p.reported_eps != null && Number.isFinite(p.reported_eps)
        ? r4(p.reported_eps)
        : net_income != null && p.shares != null && p.shares !== 0
          ? r4(net_income / p.shares)
          : null,
    pe_ratio:
      p.share_price != null && net_income != null && p.shares != null && net_income !== 0
        ? r2((p.share_price * p.shares) / net_income)
        : p.share_price != null && p.reported_eps != null && p.reported_eps !== 0
          ? r2(p.share_price / p.reported_eps)
          : null,
    yoy_revenue_growth_pct: yoy_rev,
    yoy_net_income_growth_pct: yoy_ni,
  };
}

/**
 * Detect one or more formula kinds. Multiple kinds merge columns (e.g. gross profit + gross margin).
 */
export function detectCsvFormulaKinds(lowerInput: string): FormulaKind[] | null {
  if (
    lowerInput.includes("all ratio") ||
    lowerInput.includes("all formulas") ||
    lowerInput.includes("every ratio") ||
    lowerInput.includes("financial ratios") ||
    lowerInput.includes("all financial metrics") ||
    lowerInput.includes("ratio dashboard") ||
    lowerInput.includes("key metrics") ||
    lowerInput.includes("kpi dashboard") ||
    lowerInput.includes("full metrics") ||
    lowerInput.includes("complete metrics") ||
    (/\ball metrics\b/.test(lowerInput) &&
      /\b(financial|ratio|ratios|kpi|formula|margin|profitability)\b/.test(lowerInput)) ||
    (/\bevery metric\b/.test(lowerInput) &&
      /\b(financial|ratio|ratios|kpi|formula|margin|profitability)\b/.test(lowerInput))
  ) {
    return ["all"];
  }

  const asksGrossProfit = lowerInput.includes("gross profit");
  const asksGrossMargin =
    lowerInput.includes("gross margin") ||
    (lowerInput.includes("gross") && lowerInput.includes("margin"));
  if (asksGrossProfit && asksGrossMargin) return ["gross_profit", "gross_margin"];

  const asksEbitdaMargin =
    /\bebitda\s+margin|\bebita\s+margin/i.test(lowerInput) ||
    (/\bebitda\b|\bebita\b/i.test(lowerInput) && /\bmargin\b/i.test(lowerInput));
  const asksEbitdaAmount =
    /\bebitda\s+amount|\bebita\s+amount/i.test(lowerInput) ||
    (/\bebitda\b|\bebita\b/i.test(lowerInput) &&
      /\b(amount|amounts|level|levels|value|values|figure|figures)\b/i.test(lowerInput));
  const asksEbitdaAmountAndMargin =
    /\bebitda\b[^.]{0,120}(\band\b|&|,)[^.]{0,120}(\bebitda\s+margin|\bebita\s+margin|\bmargin\b)/i.test(
      lowerInput,
    ) ||
    /(\bebitda\s+margin|\bebita\s+margin)[^.]{0,120}(\band\b|&|,)[^.]{0,120}\bebitda\b/i.test(
      lowerInput,
    );
  if (asksEbitdaMargin && (asksEbitdaAmount || asksEbitdaAmountAndMargin))
    return ["ebitda_absolute", "ebitda_margin"];

  if (asksGrossProfit && !lowerInput.includes("margin")) return ["gross_profit"];
  if (asksGrossMargin) return ["gross_margin"];
  if (lowerInput.includes("operating margin")) return ["operating_margin"];
  if (asksEbitdaMargin) return ["ebitda_margin"];
  if (/\bebitda\b|\bebita\b/.test(lowerInput)) return ["ebitda_absolute"];

  if (
    lowerInput.includes("yoy") ||
    lowerInput.includes("year over year") ||
    lowerInput.includes("year-over-year") ||
    (lowerInput.includes("growth") && /revenue|income|profit|sales/.test(lowerInput))
  ) {
    return ["yoy"];
  }

  if (/\broe\b/.test(lowerInput) || lowerInput.includes("return on equity")) return ["roe"];
  if (/\broa\b/.test(lowerInput) || lowerInput.includes("return on asset")) return ["roa"];
  if (/\broce\b/.test(lowerInput) || lowerInput.includes("return on capital")) return ["roce"];

  if (lowerInput.includes("current ratio")) return ["current_ratio"];
  if (lowerInput.includes("quick ratio") || lowerInput.includes("acid test")) return ["quick_ratio"];
  if (
    lowerInput.includes("debt to equity") ||
    lowerInput.includes("debt/equity") ||
    lowerInput.includes("debt-equity")
  ) {
    return ["debt_to_equity"];
  }
  if (lowerInput.includes("interest coverage")) return ["interest_coverage"];
  if (lowerInput.includes("asset turnover")) return ["asset_turnover"];
  if (lowerInput.includes("inventory days")) return ["inventory_days"];
  if (
    lowerInput.includes("receivable days") ||
    lowerInput.includes("days sales outstanding") ||
    /\bdso\b/.test(lowerInput)
  ) {
    return ["receivable_days"];
  }
  if (lowerInput.includes("payable days") || lowerInput.includes("days payable")) return ["payable_days"];

  if (lowerInput.includes("earnings per share") || /\beps\b/.test(lowerInput)) return ["eps"];
  if (
    lowerInput.includes("p/e") ||
    lowerInput.includes("pe ratio") ||
    lowerInput.includes("price to earnings") ||
    lowerInput.includes("price/earnings")
  ) {
    return ["pe"];
  }

  if (lowerInput.includes("margin") || lowerInput.includes("profit margin")) return ["net_margin"];

  return null;
}

/** @deprecated Prefer detectCsvFormulaKinds; returns first kind only. */
export function detectCsvFormulaIntent(lowerInput: string): FormulaKind | null {
  const k = detectCsvFormulaKinds(lowerInput);
  return k?.[0] ?? null;
}

const KIND_COLUMNS: Record<FormulaKind, string[]> = {
  all: [],
  gross_profit: ["period", "gross_profit"],
  gross_margin: ["period", "gross_margin_pct"],
  operating_margin: ["period", "operating_margin_pct"],
  ebitda_margin: ["period", "ebitda_margin_pct"],
  ebitda_absolute: ["period", "ebitda_amount"],
  net_margin: ["period", "net_profit_margin_pct"],
  yoy: ["period", "revenue", "net_income", "yoy_revenue_growth_pct", "yoy_net_income_growth_pct"],
  roe: ["period", "roe_pct"],
  roa: ["period", "roa_pct"],
  roce: ["period", "roce_pct"],
  current_ratio: ["period", "current_ratio"],
  quick_ratio: ["period", "quick_ratio"],
  debt_to_equity: ["period", "debt_to_equity"],
  interest_coverage: ["period", "interest_coverage"],
  asset_turnover: ["period", "asset_turnover"],
  inventory_days: ["period", "inventory_days"],
  receivable_days: ["period", "receivable_days"],
  payable_days: ["period", "payable_days"],
  eps: ["period", "eps"],
  pe: ["period", "pe_ratio"],
};

function mergeKindColumns(kinds: FormulaKind[]): string[] {
  if (kinds.includes("all")) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kind of kinds) {
    for (const col of KIND_COLUMNS[kind]) {
      if (seen.has(col)) continue;
      seen.add(col);
      out.push(col);
    }
  }
  return out;
}

/** Keys emitted in the full “all ratios” table (order matches client output). */
const ALL_RESULT_SQL_KEYS: string[] = [
  "period",
  "revenue",
  "net_income",
  "ebitda_amount",
  "gross_margin_pct",
  "operating_margin_pct",
  "ebitda_margin_pct",
  "net_profit_margin_pct",
  "roe_pct",
  "roa_pct",
  "roce_pct",
  "current_ratio",
  "quick_ratio",
  "debt_to_equity",
  "interest_coverage",
  "asset_turnover",
  "inventory_days",
  "receivable_days",
  "payable_days",
  "eps",
  "pe_ratio",
  "yoy_revenue_growth_pct",
  "yoy_net_income_growth_pct",
  "gross_profit",
];

function sqlQuoteId(name: string): string {
  const s = String(name).trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function wideMetricColumnMap(
  columns: string[],
  yearCol: string,
): Partial<Record<keyof PivotMetrics, string>> {
  const map: Partial<Record<keyof PivotMetrics, string>> = {};
  for (const c of columns) {
    if (c === yearCol) continue;
    const k = classifyMetric(c);
    if (!k) continue;
    if (map[k] !== undefined) continue;
    map[k] = c;
  }
  return map;
}

function cmCol(cm: Partial<Record<keyof PivotMetrics, string>>, k: keyof PivotMetrics): string | null {
  const v = cm[k];
  return v != null ? sqlQuoteId(v) : null;
}

function ebitdaExprSql(cm: Partial<Record<keyof PivotMetrics, string>>): string | null {
  const e = cmCol(cm, "ebitda");
  const pbt = cmCol(cm, "pbt");
  const fin = cmCol(cm, "interest_expense");
  const dep = cmCol(cm, "depreciation_charge");
  const derived = pbt && fin && dep ? `(${pbt} + ${fin} + ${dep})` : null;
  if (e && derived) return `COALESCE(${e}, ${derived})`;
  if (e) return e;
  if (derived) return derived;
  return null;
}

function opForMarginSql(cm: Partial<Record<keyof PivotMetrics, string>>): string | null {
  const oi = cmCol(cm, "operating_income");
  const rev = cmCol(cm, "revenue");
  const exp = cmCol(cm, "expenses");
  if (oi) return oi;
  if (rev && exp) return `(${rev} - ${exp})`;
  return null;
}

function ebitForSql(cm: Partial<Record<keyof PivotMetrics, string>>): string | null {
  const eb = ebitdaExprSql(cm);
  const op = opForMarginSql(cm);
  if (eb && op) return `COALESCE(${eb}, ${op})`;
  return eb ?? op;
}

function sqlExprForComputedField(
  key: string,
  cm: Partial<Record<keyof PivotMetrics, string>>,
  periodRef: string,
): string | null {
  const R = cmCol(cm, "revenue");
  const C = cmCol(cm, "cogs");
  const N = cmCol(cm, "net_income");
  const E = cmCol(cm, "expenses");
  const OI = cmCol(cm, "operating_income");
  const EQ = cmCol(cm, "equity");
  const TA = cmCol(cm, "total_assets");
  const CA = cmCol(cm, "current_assets");
  const CL = cmCol(cm, "current_liabilities");
  const INV = cmCol(cm, "inventory");
  const TD = cmCol(cm, "total_debt");
  const FIN = cmCol(cm, "interest_expense");
  const REC = cmCol(cm, "receivables");
  const PAY = cmCol(cm, "payables");
  const SH = cmCol(cm, "shares");
  const SP = cmCol(cm, "share_price");
  const EPSC = cmCol(cm, "reported_eps");

  const ebitdaSql = ebitdaExprSql(cm);
  const ebitFor = ebitForSql(cm);

  switch (key) {
    case "revenue":
      return R ?? null;
    case "net_income":
      return N ?? null;
    case "gross_profit":
      return R && C ? `ROUND((${R}) - (${C}), 2)` : null;
    case "ebitda_amount":
      return ebitdaSql;
    case "gross_margin_pct":
      return R && C ? `ROUND(100.0 * ((${R}) - (${C})) / NULLIF((${R}), 0), 2)` : null;
    case "operating_margin_pct": {
      const op = OI ?? (R && E ? `(${R} - ${E})` : null);
      return op && R ? `ROUND(100.0 * (${op}) / NULLIF((${R}), 0), 2)` : null;
    }
    case "ebitda_margin_pct":
      return ebitdaSql && R ? `ROUND(100.0 * (${ebitdaSql}) / NULLIF((${R}), 0), 2)` : null;
    case "net_profit_margin_pct":
      return N && R ? `ROUND(100.0 * (${N}) / NULLIF((${R}), 0), 2)` : null;
    case "roe_pct":
      return N && EQ ? `ROUND(100.0 * (${N}) / NULLIF((${EQ}), 0), 2)` : null;
    case "roa_pct":
      return N && TA ? `ROUND(100.0 * (${N}) / NULLIF((${TA}), 0), 2)` : null;
    case "roce_pct": {
      const ce = TA && CL ? `((${TA}) - (${CL}))` : null;
      return ebitFor && ce ? `ROUND(100.0 * (${ebitFor}) / NULLIF(${ce}, 0), 2)` : null;
    }
    case "current_ratio":
      return CA && CL ? `ROUND(1.0 * (${CA}) / NULLIF((${CL}), 0), 3)` : null;
    case "quick_ratio": {
      const invPart = INV ? `COALESCE((${INV}), 0)` : "0";
      return CA && CL ? `ROUND(1.0 * ((${CA}) - ${invPart}) / NULLIF((${CL}), 0), 3)` : null;
    }
    case "debt_to_equity":
      return TD && EQ ? `ROUND(1.0 * (${TD}) / NULLIF((${EQ}), 0), 3)` : null;
    case "interest_coverage":
      return ebitFor && FIN ? `ROUND((${ebitFor}) / NULLIF((${FIN}), 0), 3)` : null;
    case "asset_turnover":
      return R && TA ? `ROUND(1.0 * (${R}) / NULLIF((${TA}), 0), 3)` : null;
    case "inventory_days":
      return INV && C ? `ROUND(365.0 * (${INV}) / NULLIF((${C}), 0), 2)` : null;
    case "receivable_days":
      return REC && R ? `ROUND(365.0 * (${REC}) / NULLIF((${R}), 0), 2)` : null;
    case "payable_days":
      return PAY && C ? `ROUND(365.0 * (${PAY}) / NULLIF((${C}), 0), 2)` : null;
    case "eps":
      if (EPSC) return EPSC;
      return N && SH ? `ROUND(1.0 * (${N}) / NULLIF((${SH}), 0), 4)` : null;
    case "pe_ratio":
      if (SP && N && SH) return `ROUND((${SP}) * (${SH}) / NULLIF((${N}), 0), 2)`;
      if (SP && EPSC) return `ROUND((${SP}) / NULLIF((${EPSC}), 0), 2)`;
      return null;
    case "yoy_revenue_growth_pct":
      return R
        ? `ROUND(100.0 * ((${R}) - LAG(${R}) OVER (ORDER BY ${periodRef})) / NULLIF(LAG(${R}) OVER (ORDER BY ${periodRef}), 0), 2)`
        : null;
    case "yoy_net_income_growth_pct":
      return N
        ? `ROUND(100.0 * ((${N}) - LAG(${N}) OVER (ORDER BY ${periodRef})) / NULLIF(ABS(LAG(${N}) OVER (ORDER BY ${periodRef})), 0), 2)`
        : null;
    default:
      return null;
  }
}

function buildFinancialFormulaDisplaySql(
  kinds: FormulaKind[],
  periodColumn: string,
  columns: string[],
  layout: "wide" | "long",
  longCols?: { year: string; metric: string; value: string },
): string {
  const y = sqlQuoteId(periodColumn);
  const kindNote = kinds.join(", ");

  if (layout === "long" && longCols) {
    const yr = sqlQuoteId(longCols.year);
    const mc = sqlQuoteId(longCols.metric);
    const vc = sqlQuoteId(longCols.value);
    return (
      `-- Ratios from long-format facts (${longCols.year}, ${longCols.metric}, ${longCols.value}); kinds: ${kindNote}\n` +
      `-- Pivot metrics in app (same header rules as wide sheet), then apply formulas below on the pivoted row.\n` +
      `SELECT\n` +
      `  ${yr} AS period,\n` +
      `  ${mc} AS metric,\n` +
      `  ${vc} AS value\n` +
      `FROM uploaded_data\n` +
      `ORDER BY ${yr}, ${mc};`
    );
  }

  const cm = wideMetricColumnMap(columns, periodColumn);
  const keys =
    kinds.length === 1 && kinds[0] === "all" ? ALL_RESULT_SQL_KEYS : mergeKindColumns(kinds);

  const lines: string[] = [`  ${y} AS period`];
  for (const key of keys) {
    if (key === "period") continue;
    const expr = sqlExprForComputedField(key, cm, y);
    if (expr) lines.push(`  ${expr} AS ${key}`);
    else lines.push(`  NULL AS ${key}  /* needs more mapped columns */`);
  }

  return (
    `-- Financial metrics from uploaded_data (${periodColumn} + classified headers); kinds: ${kindNote}\n` +
    `-- Executed in browser for CSV; SQL documents the same formulas as financial_formulas_sql.\n` +
    `SELECT\n${lines.join(",\n")}\nFROM uploaded_data\nORDER BY ${y};`
  );
}

function explicitEbitdaInPivot(pivot: Map<string, PivotMetrics>): boolean {
  for (const p of pivot.values()) {
    if (p.ebitda != null && Number.isFinite(p.ebitda)) return true;
  }
  return false;
}

function pivotUsesDerivedEbitda(pivot: Map<string, PivotMetrics>, computed: ComputedRow[]): boolean {
  for (const row of computed) {
    const p = pivot.get(String(row.period));
    if (!p) continue;
    if (p.ebitda != null && Number.isFinite(p.ebitda)) continue;
    if (
      row.ebitda_amount != null &&
      typeof row.ebitda_amount === "number" &&
      Number.isFinite(row.ebitda_amount) &&
      p.pbt != null &&
      p.interest_expense != null &&
      p.depreciation_charge != null
    )
      return true;
  }
  return false;
}

function hasEmptyCellsInTable(table: DataRow[]): boolean {
  for (const row of table) {
    for (const v of Object.values(row)) {
      if (v === "—") return true;
    }
  }
  return false;
}

type TrendMode = "percent" | "times" | "number" | "eps";

function summarizeNumericTrend(
  computed: ComputedRow[],
  key: string,
  label: string,
  mode: TrendMode,
): string | null {
  const series: { p: string; v: number }[] = [];
  for (const r of computed) {
    const v = r[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    series.push({ p: String(r.period), v });
  }
  if (series.length === 0) {
    return `${label} could not be computed — add or rename columns so this metric maps from your sheet.`;
  }

  const fmt = (v: number) => {
    if (mode === "percent") return `${v.toFixed(2)}%`;
    if (mode === "times") return `${v.toFixed(2)}×`;
    if (mode === "eps") return v.toFixed(2);
    return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const first = series[0];
  const last = series[series.length - 1];
  if (series.length === 1) return `${label} is ${fmt(first.v)} in ${first.p}.`;

  const eps = mode === "percent" ? 0.05 : mode === "times" ? 0.015 : mode === "eps" ? 0.005 : 1;
  const delta = last.v - first.v;
  const dir =
    Math.abs(delta) < eps ? "flat" : delta > 0 ? "up" : "down";
  const best = series.reduce((a, b) => (b.v > a.v ? b : a));

  let s =
    dir === "flat"
      ? `${label} is roughly flat (${fmt(first.v)} in ${first.p} → ${fmt(last.v)} in ${last.p}).`
      : `${label} trends ${dir} from ${fmt(first.v)} (${first.p}) to ${fmt(last.v)} (${last.p}).`;
  if (Math.abs(best.v - last.v) > eps && best.p !== last.p) s += ` Peak ${fmt(best.v)} in ${best.p}.`;
  return s;
}

function insightForYoY(computed: ComputedRow[]): string | null {
  const rev = summarizeNumericTrend(
    computed,
    "yoy_revenue_growth_pct",
    "YoY revenue growth",
    "percent",
  );
  const ni = summarizeNumericTrend(
    computed,
    "yoy_net_income_growth_pct",
    "YoY net income growth",
    "percent",
  );
  if (!rev && !ni) return null;
  return [rev, ni].filter(Boolean).join(" ");
}

function buildFormulaInsights(
  kinds: FormulaKind[],
  table: DataRow[],
  computed: ComputedRow[],
  pivot: Map<string, PivotMetrics>,
  layoutDescription: string,
): string {
  if (kinds.includes("all")) {
    const parts: string[] = [`Full ratio dashboard (${layoutDescription}).`];
    const npm = summarizeNumericTrend(
      computed,
      "net_profit_margin_pct",
      "Net profit margin",
      "percent",
    );
    const rev = summarizeNumericTrend(computed, "revenue", "Revenue", "number");
    if (npm) parts.push(npm);
    if (rev) parts.push(rev);
    if (hasEmptyCellsInTable(table)) {
      parts.push(
        "Blank cells usually mean this file omits balance-sheet or working-capital lines (equity, total assets, debt, current assets/liabilities, inventory, receivables, payables) or market data (share price).",
      );
    }
    if (!explicitEbitdaInPivot(pivot) && pivotUsesDerivedEbitda(pivot, computed)) {
      parts.push("EBITDA uses PBT + finance costs + depreciation when no EBITDA column is present.");
    }
    return parts.join(" ");
  }

  const sentences: string[] = [];
  for (const k of kinds) {
    let s: string | null = null;
    if (k === "yoy") s = insightForYoY(computed);
    else if (k === "gross_profit")
      s = summarizeNumericTrend(computed, "gross_profit", "Gross profit", "number");
    else if (k === "gross_margin")
      s = summarizeNumericTrend(computed, "gross_margin_pct", "Gross margin", "percent");
    else if (k === "operating_margin")
      s = summarizeNumericTrend(computed, "operating_margin_pct", "Operating margin", "percent");
    else if (k === "ebitda_margin")
      s = summarizeNumericTrend(computed, "ebitda_margin_pct", "EBITDA margin", "percent");
    else if (k === "ebitda_absolute")
      s = summarizeNumericTrend(computed, "ebitda_amount", "EBITDA", "number");
    else if (k === "net_margin")
      s = summarizeNumericTrend(computed, "net_profit_margin_pct", "Net profit margin", "percent");
    else if (k === "interest_coverage")
      s = summarizeNumericTrend(computed, "interest_coverage", "Interest coverage", "times");
    else if (k === "eps") s = summarizeNumericTrend(computed, "eps", "EPS", "eps");
    else if (k === "roe") s = summarizeNumericTrend(computed, "roe_pct", "Return on equity", "percent");
    else if (k === "roa") s = summarizeNumericTrend(computed, "roa_pct", "Return on assets", "percent");
    else if (k === "roce") s = summarizeNumericTrend(computed, "roce_pct", "ROCE", "percent");
    else if (k === "current_ratio")
      s = summarizeNumericTrend(computed, "current_ratio", "Current ratio", "times");
    else if (k === "quick_ratio")
      s = summarizeNumericTrend(computed, "quick_ratio", "Quick ratio", "times");
    else if (k === "debt_to_equity")
      s = summarizeNumericTrend(computed, "debt_to_equity", "Debt-to-equity", "times");
    else if (k === "asset_turnover")
      s = summarizeNumericTrend(computed, "asset_turnover", "Asset turnover", "times");
    else if (k === "inventory_days")
      s = summarizeNumericTrend(computed, "inventory_days", "Inventory days", "number");
    else if (k === "receivable_days")
      s = summarizeNumericTrend(computed, "receivable_days", "Receivable days", "number");
    else if (k === "payable_days")
      s = summarizeNumericTrend(computed, "payable_days", "Payable days", "number");
    else if (k === "pe") s = summarizeNumericTrend(computed, "pe_ratio", "P/E ratio", "times");

    if (s) sentences.push(s);
  }

  const touchesEbitda =
    kinds.includes("ebitda_absolute") ||
    kinds.includes("ebitda_margin") ||
    kinds.includes("interest_coverage");
  if (
    touchesEbitda &&
    !explicitEbitdaInPivot(pivot) &&
    pivotUsesDerivedEbitda(pivot, computed) &&
    !sentences.some((x) => x.includes("PBT + finance costs + depreciation"))
  ) {
    sentences.push("EBITDA is built as PBT + finance costs + depreciation (no EBITDA column in the file).");
  }

  if (hasEmptyCellsInTable(table) && kinds.length > 0 && !kinds.includes("all")) {
    sentences.push("(—) marks periods where this metric lacks inputs.");
  }

  return sentences.join(" ") || `Computed from your CSV (${layoutDescription}).`;
}

export function executeCsvFinancialFormulas(
  userInput: string,
  data: DataRow[],
  columns: string[],
): QueryResult | null {
  const lowerInput = userInput.toLowerCase();
  const wantsAverage =
    lowerInput.includes("average") ||
    /\bavg\b/.test(lowerInput) ||
    lowerInput.includes("mean");
  const wantsHighest =
    lowerInput.includes("highest") ||
    lowerInput.includes("maximum") ||
    lowerInput.includes("best") ||
    (lowerInput.includes("top") && !/\btop\s+\d+\b/.test(lowerInput));
  const wantsLowest =
    lowerInput.includes("lowest") ||
    lowerInput.includes("minimum") ||
    lowerInput.includes("worst") ||
    (lowerInput.includes("bottom") && !/\bbottom\s+\d+\b/.test(lowerInput));
  const kinds = detectCsvFormulaKinds(lowerInput);
  if (!kinds?.length) return null;

  let pivot: Map<string, PivotMetrics>;
  let layoutDescription: string;
  let periodColumn: string | null = null;

  if (isFinancialFactsLayout(columns)) {
    const yearCol = columns.find((c) => /^year$/i.test(c));
    const metricCol = columns.find((c) => /^metric$/i.test(c));
    const valueCol = columns.find((c) => /^value$/i.test(c));
    if (!yearCol || !metricCol || !valueCol) return null;
    periodColumn = yearCol;
    pivot = pivotFacts(data, yearCol, metricCol, valueCol);
    layoutDescription = `long format (${yearCol}, ${metricCol}, ${valueCol})`;
  } else if (isWideFinancialFactsSheet(columns, data)) {
    const yearCol = findYearColumnForFormulas(data, columns);
    if (!yearCol) return null;
    periodColumn = yearCol;
    pivot = pivotFromWideSheet(data, columns, yearCol);
    layoutDescription = `wide format (${yearCol} + ${countClassifiedMetricColumns(columns, yearCol)} line-item columns)`;
  } else {
    return null;
  }

  if (pivot.size === 0) return null;

  const periods = sortPeriods([...pivot.keys()]);
  const computed: ComputedRow[] = [];
  for (let i = 0; i < periods.length; i++) {
    const per = periods[i];
    const p = pivot.get(per)!;
    const prev = i > 0 ? pivot.get(periods[i - 1])! : null;
    const row = computeRow(per, p, prev);
    const gp =
      p.revenue != null && p.cogs != null
        ? r2(p.revenue - p.cogs)
        : p.reported_gross_profit != null && Number.isFinite(p.reported_gross_profit)
          ? r2(p.reported_gross_profit)
          : null;
    row.gross_profit = gp;
    computed.push(row);
  }

  if (
    kinds.includes("ebitda_absolute") &&
    periodColumn &&
    computed.every((r) => r.ebitda_amount == null)
  ) {
    const rescue = rescueEbitdaSourceColumn(columns, periodColumn, data);
    if (rescue) patchEbitdaAbsoluteFromColumn(computed, data, periodColumn, rescue);
  }

  const layout: "wide" | "long" = isFinancialFactsLayout(columns) ? "long" : "wide";
  const longCols =
    layout === "long"
      ? {
          year: columns.find((c) => /^year$/i.test(c))!,
          metric: columns.find((c) => /^metric$/i.test(c))!,
          value: columns.find((c) => /^value$/i.test(c))!,
        }
      : undefined;
  const sql = buildFinancialFormulaDisplaySql(
    kinds,
    periodColumn!,
    columns,
    layout,
    longCols,
  );

  const filterKeys = (row: ComputedRow, keys: string[]): DataRow => {
    const out: DataRow = {};
    for (const k of keys) {
      const v = row[k];
      if (v === null || v === undefined) out[k] = "—";
      else out[k] = v;
    }
    return out;
  };

  let table: DataRow[];
  if (kinds.includes("all") && kinds.length === 1) {
    table = computed.map((row) => {
      const o: DataRow = {};
      for (const [k, v] of Object.entries(row)) {
        o[k] = v === null || v === undefined ? "—" : v;
      }
      return o;
    });
  } else {
    const keys = mergeKindColumns(kinds);
    table = computed.map((row) => filterKeys(row, keys));
  }

  const chartPercentKinds: FormulaKind[] = [
    "gross_margin",
    "operating_margin",
    "ebitda_margin",
    "net_margin",
    "roe",
    "roa",
    "roce",
    "yoy",
  ];

  const pickChartKind = (): FormulaKind => {
    if (kinds.includes("all")) return "all";
    if (kinds.includes("gross_margin")) return "gross_margin";
    if (kinds.includes("ebitda_margin")) return "ebitda_margin";
    if (kinds.includes("yoy")) return "yoy";
    const pk = kinds.find((k) => chartPercentKinds.includes(k));
    if (pk) return pk;
    return kinds[0];
  };

  const chartKind = pickChartKind();
  let chartMetric: string;
  if (chartKind === "all") chartMetric = "net_profit_margin_pct";
  else if (chartKind === "yoy") chartMetric = "yoy_revenue_growth_pct";
  else if (chartKind === "ebitda_absolute") chartMetric = "ebitda_amount";
  else chartMetric = KIND_COLUMNS[chartKind].find((k) => k !== "period") || "net_profit_margin_pct";

  const chartIsPercent =
    chartPercentKinds.includes(chartKind) || chartKind === "all";

  const metricLabel = (key: string): string =>
    key.replace(/_/g, " ").replace(/\bpct\b/i, "%");

  const roundForMetric = (key: string, v: number): number => {
    // v is always finite here, so r2/r3/r4 cannot return null.
    if (key === "eps") return r4(v)!;
    if (key.endsWith("_pct") || key.includes("margin") || key.startsWith("yoy_")) return r2(v)!;
    if (key.endsWith("_ratio") || key.includes("ratio") || key.includes("turnover")) return r3(v)!;
    return r2(v)!;
  };

  // Summary queries for formula outputs (average/highest/lowest).
  // - If one kind: summarize that metric.
  // - If multiple kinds: only support average (per-metric).
  if ((wantsAverage || wantsHighest || wantsLowest) && !kinds.includes("all")) {
    const keys =
      kinds.length === 1
        ? mergeKindColumns(kinds)
        : wantsAverage
          ? mergeKindColumns(kinds)
          : [];
    const valueKeys = keys.filter((k) => k !== "period");

    if (kinds.length === 1 && valueKeys.length >= 1 && (wantsAverage || wantsHighest || wantsLowest)) {
      const k = valueKeys[0]!;
      const series = computed
        .map((r) => ({ p: String(r.period), v: r[k] }))
        .filter((x): x is { p: string; v: number } => typeof x.v === "number" && Number.isFinite(x.v));
      if (series.length) {
        if (wantsAverage) {
          const avg = series.reduce((s, x) => s + x.v, 0) / series.length;
          const rounded = roundForMetric(k, avg);
          const label = metricLabel(k);
          return {
            sql,
            table: [{ period: "Average", [label]: rounded }],
            chartData: [{ name: "Average", sales: rounded }],
            message: `Average ${label} across ${series.length} period(s).`,
            chartType: "bar",
            chartValueFormat: chartIsPercent ? "percent" : undefined,
            insight: `Computed the mean of ${series.length} values from your CSV (${layoutDescription}).`,
            metrics: [k],
          };
        }

        const pick = series.reduce((a, b) =>
          wantsLowest ? (b.v < a.v ? b : a) : (b.v > a.v ? b : a),
        );
        const label = metricLabel(k);
        const rounded = roundForMetric(k, pick.v);
        return {
          sql,
          table: [{ period: pick.p, [label]: rounded }],
          chartData: [{ name: pick.p, sales: rounded }],
          message: `${wantsLowest ? "Lowest" : "Highest"} ${label} is **${rounded}** in **${pick.p}**.`,
          chartType: "bar",
          chartValueFormat: chartIsPercent ? "percent" : undefined,
          insight: `Picked ${wantsLowest ? "minimum" : "maximum"} across ${series.length} period(s).`,
          metrics: [k],
        };
      }
    }

    if (wantsAverage && valueKeys.length >= 1) {
      const avgRow: DataRow = { period: "Average" };
      for (const k of valueKeys) {
        const nums = computed
          .map((r) => r[k])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (!nums.length) {
          avgRow[metricLabel(k)] = "—";
          continue;
        }
        const avg = nums.reduce((s, x) => s + x, 0) / nums.length;
        avgRow[metricLabel(k)] = roundForMetric(k, avg);
      }

      const chartPoint: { name: string; [key: string]: unknown } = { name: "Average" };
      for (const k of valueKeys) {
        const label = metricLabel(k);
        const v = avgRow[label];
        if (typeof v === "number") chartPoint[label] = v;
      }

      return {
        sql,
        table: [avgRow],
        chartData: [chartPoint],
        message: `Average values across ${computed.length} period(s).`,
        chartType: valueKeys.length > 1 ? "multi-bar" : "bar",
        chartValueFormat: chartIsPercent ? "percent" : undefined,
        insight: `Computed per-metric means from your CSV (${layoutDescription}).`,
        metrics: valueKeys,
      };
    }
  }

  const chartData = computed.map((row) => {
    const y = row[chartMetric];
    const num = typeof y === "number" && Number.isFinite(y) ? y : 0;
    return { name: String(row.period), sales: num };
  });

  const kindLabel =
    kinds.length === 1
      ? kinds[0] === "all"
        ? "financial ratios"
        : kinds[0].replace(/_/g, " ")
      : kinds.map((k) => k.replace(/_/g, " ")).join(" + ");

  const message =
    kinds.length === 1 && kinds[0] === "all"
      ? `Financial ratios by period from your CSV (${layoutDescription}).`
      : kinds.length === 1 && kinds[0] === "ebitda_absolute"
        ? `EBITDA amounts by period (${layoutDescription}).`
        : `Results for “${kindLabel}” (${layoutDescription}).`;

  const insight = buildFormulaInsights(kinds, table, computed, pivot, layoutDescription);

  return {
    sql,
    table,
    chartData,
    message,
    chartType: "line",
    chartValueFormat: chartIsPercent ? "percent" : undefined,
    insight,
    metrics: [chartMetric],
  };
}
