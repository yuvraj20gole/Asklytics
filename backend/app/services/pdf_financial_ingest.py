import io
import json
import logging
import os
import re
from dataclasses import dataclass

import pdfplumber

from app.db.models import FinancialFact, FinancialTable
from app.services.ai_table_extractor import AITableExtractor

logger = logging.getLogger(__name__)

METRIC_ALIASES = {
    "revenue": "revenue",
    "total revenue": "revenue",
    "revenue from operations": "revenue",
    "total income": "revenue",
    "income": "revenue",
    "profit": "net_income",
    "profit after tax": "net_income",
    "net income": "net_income",
    "expenses": "expenses",
}


@dataclass
class ExtractedTable:
    page_number: int
    table_index: int
    rows: list[list[str]]


@dataclass
class ParsedFact:
    statement_type: str
    metric: str
    period: str
    value: float
    currency: str
    unit: str
    level: str
    is_valid: bool
    source_page: int
    extraction_method: str
    confidence: float


def find_income_statement_table(tables: list[ExtractedTable]) -> ExtractedTable | None:
    """Pick the first table whose full text looks like an income statement (CSV-style section gate)."""
    for idx, table in enumerate(tables):
        text_blob = " ".join(str(cell) for row in table.rows for cell in row if cell).lower()
        has_revenue = "revenue" in text_blob or "income" in text_blob
        has_pnl = "profit" in text_blob or "expenses" in text_blob
        if has_revenue and has_pnl:
            logger.info("[SECTION FOUND] Using table index=%s", idx)
            return table
    return None


def _parse_number(val) -> float | None:
    if val is None:
        return None

    text = str(val).strip()
    if not text:
        return None

    if text.startswith("(") and text.endswith(")"):
        text = "-" + text[1:-1]

    text = text.replace(",", "")
    text = re.sub(r"[^\d\.\-]", "", text)

    try:
        return float(text)
    except (ValueError, TypeError):
        return None


def _parse_numeric(value: str) -> float | None:
    """Backward-compatible alias; use _parse_number for new code."""
    return _parse_number(value)


def _normalize_metric(label: str) -> str | None:
    key = re.sub(r"\s+", " ", (label or "").strip().lower())
    for alias, canonical in sorted(METRIC_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        if alias in key:
            return canonical
    return None


def normalize_text(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"\(.*?\)", "", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _detect_currency(raw_text: str) -> str:
    lower = raw_text.lower()
    if "₹" in raw_text or "inr" in lower or "rupee" in lower:
        return "INR"
    if "€" in raw_text or "eur" in lower:
        return "EUR"
    if "£" in raw_text or "gbp" in lower:
        return "GBP"
    return "USD"


class PDFFinancialIngestService:
    PRIORITY_PAGES = 20
    REVENUE_ROW_HINTS = ("revenue", "revenue from operations", "total income")
    # Strict P&L table classification (full table text)
    REVENUE_ANCHORS = [
        "revenue",
        "total revenue",
        "revenue from operations",
        "income from operations",
        "net sales",
        "turnover",
        "gross revenue",
    ]
    PNL_ANCHORS = [
        "expenses",
        "total expenses",
        "profit",
        "profit before tax",
        "profit after tax",
        "ebitda",
        "tax",
    ]
    # Revenue row labels only (no loose "sales" alone)
    REVENUE_KEYS = [
        "revenue",
        "total revenue",
        "revenue from operations",
        "income from operations",
        "net sales",
        "turnover",
        "gross revenue",
    ]
    REVENUE_KEYWORDS = [
        "revenue",
        "revenue from operations",
        "total income",
        "income",
        "net sales",
        "sales",
        "turnover",
    ]
    REVENUE_NEGATIVE_FILTERS = [
        "other income",
        "non-operating income",
        "interest income",
        "dividend income",
    ]
    REVENUE_PRIORITY = [
        "revenue from operations",
        "income from operations",
        "total revenue",
        "gross revenue",
        "net sales",
        "turnover",
        "revenue",
    ]
    REJECT_TABLE_KEYWORDS = [
        "ratio",
        "%",
        "margin",
        "roe",
        "roce",
        "growth",
        "per share",
        "segment",
        "geographical",
        "cash flow",
    ]

    TEXT_REVENUE_KEYWORDS = ["revenue", "total income", "net sales", "turnover"]
    FINANCIAL_METRICS: dict[str, list[str]] = {
        "revenue": [
            "revenue",
            "revenue from operations",
            "total income",
            "net sales",
            "sales",
            "turnover",
            "gross revenue",
            "operating revenue",
        ],
        "net_profit": [
            "net profit",
            "profit after tax",
            "pat",
            "net income",
        ],
        "operating_profit": [
            "operating profit",
            "ebit",
            "operating income",
        ],
        "ebitda": [
            "ebitda",
        ],
        "expenses": [
            "total expenses",
            "expenses",
            "operating expenses",
            "costs",
        ],
        "gross_profit": [
            "gross profit",
        ],
        "eps": [
            "earnings per share",
            "eps",
        ],
    }

    def __init__(self) -> None:
        self.ai_extractor = AITableExtractor()

    def _normalize_period_token(self, token: str) -> str | None:
        t = (token or "").strip()
        if not t:
            return None
        fy_match = re.search(r"fy\s*(\d{4})\D+(\d{2,4})", t, flags=re.IGNORECASE)
        if fy_match:
            end_year = fy_match.group(2)
            if len(end_year) == 2:
                end_year = f"{fy_match.group(1)[:2]}{end_year}"
            return end_year
        year_match = re.search(r"\b((?:19|20)\d{2})\b", t)
        if year_match:
            return year_match.group(1)
        span_match = re.search(r"(\d{4})\D+(\d{2,4})", t)
        if span_match:
            end_year = span_match.group(2)
            if len(end_year) == 2:
                end_year = f"{span_match.group(1)[:2]}{end_year}"
            return end_year
        return None

    def _detect_unit(self, context: str) -> str:
        t = (context or "").lower()
        if "crore" in t:
            return "INR_CRORE"
        if "lakh" in t:
            return "INR_LAKH"
        if "million" in t:
            return "INR_MILLION"
        if "billion" in t:
            return "INR_BILLION"
        return "INR_CRORE"

    def _to_inr_crore(self, value: float, unit: str) -> float:
        u = (unit or "").lower()
        if u == "inr_crore":
            return value
        if u == "inr_lakh":
            return value * 0.01
        if u == "inr_million":
            return value * 0.1
        if u == "inr_billion":
            return value * 100.0
        return value

    def _detect_year_columns(self, rows: list[list[str]]) -> tuple[int | None, list[tuple[int, str]]]:
        YEAR_PATTERNS = [
            r"20\d{2}",  # 2023
            r"\bfy\s?\d{2}\b",  # FY23
            r"\b\d{2}-\d{2}\b",  # 22-23
            r"\b20\d{2}-\d{2}\b",  # 2022-23
        ]

        def _normalize_year(raw: str) -> str | None:
            t = (raw or "").strip().lower()
            if not t:
                return None
            # Mar 2023 / 2023
            m = re.search(r"\b(20\d{2})\b", t)
            if m:
                return m.group(1)
            # FY23 -> 2023 (assume 20xx)
            m = re.search(r"\bfy\s?(\d{2})\b", t)
            if m:
                return f"20{m.group(1)}"
            # 22-23 -> 2023
            m = re.search(r"\b(\d{2})-(\d{2})\b", t)
            if m:
                return f"20{m.group(2)}"
            # 2022-23 -> 2023
            m = re.search(r"\b20\d{2}-(\d{2})\b", t)
            if m:
                return f"20{m.group(1)}"
            return None

        def _cell_year_candidate(row: list[str], idx: int) -> str | None:
            cell = (row[idx] or "").strip()
            if not cell:
                return None
            # Try direct normalization first.
            direct = _normalize_year(cell) or self._normalize_period_token(cell)
            if direct:
                return direct
            # Try split cell join, e.g. ["202", "3"] -> "2023"
            if idx + 1 < len(row):
                joined = f"{cell}{(row[idx+1] or '').strip()}"
                direct = _normalize_year(joined) or self._normalize_period_token(joined)
                if direct:
                    return direct
            return None

        scan_limit = min(len(rows), 8)
        logger.info("Year detection scan rows (first %s): %s", scan_limit, rows[:scan_limit])

        best_header_idx: int | None = None
        best_year_cols: list[tuple[int, str]] = []
        for ridx in range(scan_limit):
            row = rows[ridx]
            year_cols: list[tuple[int, str]] = []
            for cidx in range(len(row)):
                cand = _cell_year_candidate(row, cidx)
                if cand:
                    year_cols.append((cidx, cand))
            # Deduplicate by column index and normalized year, keep first occurrence.
            seen_cols: set[int] = set()
            deduped: list[tuple[int, str]] = []
            for cidx, y in year_cols:
                if cidx in seen_cols:
                    continue
                seen_cols.add(cidx)
                deduped.append((cidx, y))
            if len(deduped) > len(best_year_cols):
                best_year_cols = deduped
                best_header_idx = ridx

        if best_year_cols:
            logger.info(
                "Detected year candidates: header_row=%s year_cols=%s",
                best_header_idx,
                best_year_cols,
            )
            # NEW: accept even 1 year column.
            return best_header_idx, best_year_cols

        # FALLBACK (do not skip table): assume first col is label, remaining are values.
        max_cols = max((len(r) for r in rows if r), default=0)
        if max_cols <= 1:
            logger.info("Fallback triggered but table has <=1 column; returning empty year columns.")
            return 0, []

        # Try to infer a base year from any text in table.
        blob = " ".join(" ".join(r) for r in rows if r)
        years = [int(y) for y in re.findall(r"\b(20\d{2})\b", blob)]
        base_year = max(years) if years else 2023
        n_value_cols = max_cols - 1
        pseudo_years = [str(base_year - i) for i in range(n_value_cols)]
        year_cols = [(1 + i, pseudo_years[i]) for i in range(n_value_cols)]
        logger.info(
            "Fallback triggered: assigning pseudo-years base_year=%s year_cols=%s",
            base_year,
            year_cols,
        )
        return 0, year_cols

    def _detect_metric_from_row_text(self, row_text: str) -> str | None:
        # Normalize: lowercase, collapse spaces.
        text = re.sub(r"\s+", " ", (row_text or "").strip().lower())
        if not text:
            return None
        if any(bad in text for bad in self.REVENUE_NEGATIVE_FILTERS):
            return None
        detected_metric = None
        for metric, keywords in self.FINANCIAL_METRICS.items():
            if any(k in text for k in keywords):
                detected_metric = metric
                break
        if detected_metric:
            return detected_metric
        return _normalize_metric(text)

    def _revenue_boost(self, row: list[str], row_text: str) -> int:
        text = re.sub(r"\s+", " ", (row_text or "").strip().lower())
        first = (row[0] if row else "").strip().lower()
        for kw in self.REVENUE_KEYS:
            if text.startswith(kw) or (kw in first):
                return 1
        return 0

    def _is_revenue_label_row(self, row_text: str) -> bool:
        text = normalize_text(row_text)
        if not text:
            return False

        negative_hints = [
            "other income",
            "comprehensive income",
            "interest income",
            "dividend income",
            "exceptional",
        ]
        if any(n in text for n in negative_hints):
            return False

        if "revenue" in text:
            return True
        if "income from operations" in text:
            return True
        if "total income" in text:
            return True
        if "net sales" in text:
            return True
        if "turnover" in text:
            return True
        return False

    def get_revenue_priority_score(self, row_text: str) -> int:
        text = (row_text or "").lower()
        for i, keyword in enumerate(self.REVENUE_PRIORITY):
            if keyword in text:
                return i
        return 999

    def is_valid_financial_value(self, cell_text: str, parsed_value: float | None, metric: str | None = None) -> bool:
        text = (cell_text or "").lower().strip()
        if "%" in text:
            return False
        if any(word in text for word in ["ratio", "margin", "per share", "eps", "growth"]):
            return False
        if parsed_value is None:
            return False
        if metric == "eps":
            # EPS is often < 1000; still keep it numeric-only and non-percent.
            if parsed_value <= 0:
                return False
        else:
            if parsed_value < 1000:
                return False
        # allow only numeric patterns and common separators/currency/parens
        cleaned = re.sub(r"[,\s₹$€£()\-+]", "", text)
        if re.search(r"[a-z]", cleaned):
            return False
        return True

    def extract_metrics_from_text(self, full_text: str) -> list[tuple[str, str, float]]:
        if not full_text:
            return []
        text = re.sub(r"\(cid:\d+\)", " ", full_text)

        results: list[tuple[str, str, float]] = []

        for line in text.splitlines():
            clean = line.strip()
            if not clean:
                continue
            low = re.sub(r"\s+", " ", clean.lower())

            # Mandatory noise filters
            if any(x in low for x in ["margin", "%", "ratio", "growth"]):
                continue
            if any(k in low for k in self.REVENUE_NEGATIVE_FILTERS):
                continue
            # Strict financial line filter: keyword + number, short line, number near keyword.
            has_keyword = any(
                k in low for k in ["revenue", "income", "sales", "profit", "ebitda", "expenses"]
            )
            has_number = bool(re.search(r"\d{3,}", low))
            if not (has_keyword and has_number):
                logger.info("[TEXT SKIP] Not a financial line: %s", clean[:80])
                continue
            if len(low.split()) > 12:
                logger.info("[TEXT SKIP] Too long (likely paragraph): %s", clean[:80])
                continue
            if not re.search(r"(revenue|income|sales|profit|ebitda|expenses).{0,20}\d", low):
                logger.info("[TEXT SKIP] No nearby numeric value: %s", clean[:80])
                continue

            detected_metric: str | None = None
            for metric, keywords in self.FINANCIAL_METRICS.items():
                if any(k in low for k in keywords):
                    detected_metric = metric
                    logger.info("[METRIC DETECTED] %s → %s", metric, clean[:260])
                    break
            if not detected_metric:
                logger.info("[TEXT SKIP] No metric detected: %s", clean[:80])
                continue

            line_years = [int(y) for y in re.findall(r"\b(20\d{2})\b", low)]
            if not line_years:
                logger.info("[TEXT SKIP] No year detected: %s", clean[:80])
                continue
            year = str(max(line_years))

            nums = re.findall(r"[0-9,]{3,}", clean)
            if not nums:
                continue
            parsed_vals: list[float] = []
            for n in nums:
                try:
                    v = float(int(n.replace(",", "")))
                except Exception:
                    continue
                if 1900 <= v <= 2100:
                    continue
                if v < 10000:
                    logger.info("[SKIP] Value too small: %s", v)
                    continue
                if not self.is_valid_financial_value(n, v, metric=detected_metric):
                    continue
                parsed_vals.append(v)
            if not parsed_vals:
                continue
            value = float(max(parsed_vals))
            logger.info("[VALUE FOUND] metric=%s year=%s value=%s", detected_metric, year, value)
            logger.info("[VALID FINANCIAL] metric=%s value=%s text=%s", detected_metric, value, clean[:80])
            results.append((detected_metric, year, value))

        # Dedup by (metric, year) keep max(value)
        best: dict[tuple[str, str], float] = {}
        for metric, year, value in results:
            k = (metric, year)
            prev = best.get(k)
            if prev is None or value > prev:
                best[k] = value

        return [(m, y, v) for (m, y), v in sorted(best.items(), key=lambda x: (x[0][0], x[0][1]))]

    def extract_all_tables(self, pdf_bytes: bytes) -> tuple[list[ExtractedTable], str, str]:
        tables: list[ExtractedTable] = []
        raw_text: list[str] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            total_pages = len(pdf.pages)
            priority = list(range(1, min(total_pages, self.PRIORITY_PAGES) + 1))
            remaining = list(range(min(total_pages, self.PRIORITY_PAGES) + 1, total_pages + 1))
            page_order = priority + remaining
            for page_idx in page_order:
                logger.info("Processing page %s/%s...", page_idx, total_pages)
                page = pdf.pages[page_idx - 1]
                page_text = page.extract_text() or ""
                raw_text.append(page_text)
                page_tables = page.extract_tables() or []
                for table_idx, table in enumerate(page_tables):
                    if not table:
                        continue
                    rows = [[str(c or "").strip() for c in row] for row in table if row]
                    if not rows:
                        continue
                    tables.append(ExtractedTable(page_number=page_idx, table_index=table_idx, rows=rows))
                    logger.info("Extracted table: page=%s table_index=%s rows=%s", page_idx, table_idx, len(rows))
                    preview = rows[:5]
                    preview_blob = " ".join(" ".join(r).lower() for r in preview)
                    if any(k in preview_blob for k in ["revenue", "income", "operations"]):
                        logger.info("Table preview on page %s table %s: %s", page_idx, table_idx, preview)
        full_text = "\n".join(raw_text)
        return tables, _detect_currency(full_text), full_text

    # Backwards compatible name for existing callers/logs.
    def extract_revenue_from_text(self, full_text: str) -> list[tuple[str, float]]:
        triples = self.extract_metrics_from_text(full_text)
        revenue = [(year, value) for metric, year, value in triples if metric == "revenue"]
        return revenue

    def process_tables_to_facts(self, tables: list[ExtractedTable], currency: str, full_text: str | None = None) -> list[ParsedFact]:
        candidates: list[ParsedFact] = []
        debug_tables: list[dict] = []
        total_tables = len(tables)
        processed_tables = 0
        skipped_no_signal = 0
        skipped_reject = 0
        skipped_no_year = 0

        main_table = find_income_statement_table(tables)
        if not main_table:
            logger.warning("[NO INCOME TABLE FOUND]")
            for t in tables:
                debug_tables.append(
                    {
                        "page": t.page_number,
                        "table_index": t.table_index,
                        "rows": t.rows[:10],
                    }
                )
            try:
                os.makedirs("debug_output", exist_ok=True)
                with open("debug_output/debug_tables.json", "w", encoding="utf-8") as f:
                    json.dump(debug_tables, f, indent=2)
                logger.info("Wrote debug tables JSON: debug_output/debug_tables.json (tables=%s)", len(debug_tables))
            except Exception as exc:
                logger.info("Failed writing debug tables JSON: %s", exc)
            logger.info("\n===== INGEST SUMMARY =====")
            logger.info("Total tables: %s", total_tables)
            logger.info("Processed tables: 0")
            logger.info("Skipped (no signal): %s", total_tables)
            logger.info("Skipped (reject): 0")
            logger.info("Skipped (no year mapping): 0")
            logger.info("")
            logger.info("Revenue insertions (final selected rows):")
            logger.info("Rule-based: 0")
            logger.info("AI fallback: 0")
            logger.info("Text fallback: 0")
            logger.info("Total revenue rows: 0")
            logger.info("==========================\n")
            return []

        for table in [main_table]:
            debug_tables.append(
                {
                    "page": table.page_number,
                    "table_index": table.table_index,
                    "rows": table.rows[:10],
                }
            )
            logger.info("[PROCESSING TABLE] rows=%s", len(table.rows))
            logger.info("[TABLE SAMPLE] %s", table.rows[:3])

            text_blob = " ".join(str(cell) for row in table.rows for cell in row if cell).lower()
            has_revenue_anchor = any(k in text_blob for k in self.REVENUE_ANCHORS)
            has_pnl_anchor = any(k in text_blob for k in self.PNL_ANCHORS)
            is_income_statement = has_revenue_anchor and has_pnl_anchor

            table_text = " ".join(" ".join(row) for row in table.rows[:5]).lower()
            logger.info(
                "\n[TABLE DEBUG] Page=%s Table=%s Rows=%s",
                table.page_number,
                table.table_index,
                len(table.rows),
            )
            for r_idx, row in enumerate(table.rows[:5]):
                logger.info("[ROW %s] %s", r_idx, row)
            logger.info("[TABLE TEXT PREVIEW] %s", table_text[:300])

            has_reject = any(k in table_text for k in self.REJECT_TABLE_KEYWORDS)
            logger.info(
                "[TABLE DECISION] reject=%s revenue_anchor=%s pnl_anchor=%s is_income_statement=%s",
                has_reject,
                has_revenue_anchor,
                has_pnl_anchor,
                is_income_statement,
            )

            # Income statement wins: reject keywords apply only to non–income-statement tables.
            if has_reject and not is_income_statement:
                logger.info(
                    "[TABLE SKIP] Reject keywords (page=%s table=%s)",
                    table.page_number,
                    table.table_index,
                )
                skipped_reject += 1
                continue

            if is_income_statement:
                logger.info("[TABLE ACCEPTED] Income statement detected")

            logger.info(
                "[TABLE ACCEPTED] revenue_anchor=%s pnl_anchor=%s page=%s table=%s",
                has_revenue_anchor,
                has_pnl_anchor,
                table.page_number,
                table.table_index,
            )

            header_idx, year_columns = self._detect_year_columns(table.rows)
            if header_idx is None:
                header_idx = 0
            if not year_columns:
                logger.info(
                    "No year columns detected even after fallback: page=%s table=%s (will still scan rows, but no year mapping possible)",
                    table.page_number,
                    table.table_index,
                )
                skipped_no_year += 1
                continue
            logger.info(
                "Detected year columns: page=%s table=%s header_row=%s years=%s",
                table.page_number,
                table.table_index,
                header_idx,
                [p for _, p in year_columns],
            )
            logger.info("[YEAR COLUMNS] %s", year_columns)

            processed_tables += 1

            context_blob = " ".join(" ".join(r) for r in table.rows[: max(3, header_idx + 1)])
            unit = self._detect_unit(context_blob)
            table_level = "consolidated" if "consolidated" in context_blob.lower() else "standalone"
            revenue_row_candidates: list[tuple[int, int, list[str], str]] = []
            other_metric_rows: list[tuple[int, list[str], str, str]] = []
            revenue_inserted_for_table = 0

            for row_idx, row in enumerate(table.rows):
                if row_idx == header_idx:
                    continue
                if not row:
                    continue
                row_text = " ".join(cell for cell in row if cell).strip()
                if not row_text:
                    continue
                normalized = normalize_text(row_text)
                logger.debug("[ROW NORMALIZED] %s", normalized)
                normalized_text = re.sub(r"\s+", " ", row_text.strip().lower())
                logger.debug("[ROW CHECK] %s", row_text[:400])

                if any(bad in normalized_text for bad in self.REVENUE_NEGATIVE_FILTERS):
                    logger.info(
                        "Rejected revenue-like row (negative filter): page=%s table=%s row=%s reason=%s",
                        table.page_number,
                        table.table_index,
                        row_idx,
                        [b for b in self.REVENUE_NEGATIVE_FILTERS if b in normalized_text][:2],
                    )
                    continue

                if self._is_revenue_label_row(row_text):
                    metric = "revenue"
                else:
                    metric = self._detect_metric_from_row_text(row_text)
                    if metric == "revenue":
                        metric = None
                if metric is None:
                    logger.debug("[ROW REJECTED] %s", row_text[:400])
                    continue
                if metric == "revenue":
                    logger.info("[REVENUE FOUND] %s", row_text[:400])
                    values: list[float] = []
                    for col_idx, _period in year_columns:
                        raw = row[col_idx] if col_idx < len(row) else None
                        parsed = _parse_number(raw)
                        logger.debug("[VALUE PARSE] raw=%s parsed=%s", raw, parsed)
                        if parsed is not None:
                            values.append(parsed)
                    score = self.get_revenue_priority_score(row_text)
                    boost = self._revenue_boost(row, row_text)
                    # Sort by (priority score asc, boost desc)
                    if "%" in normalized_text:
                        logger.info("[ROW SKIP] Percent row (page=%s table=%s row=%s)", table.page_number, table.table_index, row_idx)
                        continue
                    if "amount (k in crore)" in normalized_text:
                        logger.info("[ROW SKIP] Header-like row (page=%s table=%s row=%s)", table.page_number, table.table_index, row_idx)
                        continue
                    numeric_values_in_row = 0
                    for col_idx, _period in year_columns:
                        if col_idx >= len(row):
                            continue
                        cell_text = str(row[col_idx] or "").strip()
                        parsed = _parse_number(cell_text)
                        if self.is_valid_financial_value(cell_text, parsed, metric="revenue"):
                            numeric_values_in_row += 1
                    if numeric_values_in_row < 2:
                        logger.info("[ROW SKIP] Not enough numeric values (page=%s table=%s row=%s)", table.page_number, table.table_index, row_idx)
                        continue
                    revenue_row_candidates.append((score * 10 - boost, row_idx, row, row_text))
                    continue
                other_metric_rows.append((row_idx, row, row_text, metric))

            if not revenue_row_candidates:
                for row_idx, row in enumerate(table.rows):
                    if row_idx == header_idx:
                        continue
                    if not row:
                        continue
                    fb_text = " ".join(cell for cell in row if cell).strip()
                    if not fb_text:
                        continue
                    logger.warning("[FALLBACK CHECK ROW] %s", row)
                    fb_values: list[float] = []
                    numeric_values_in_row = 0
                    for col_idx, _period in year_columns:
                        if col_idx >= len(row):
                            continue
                        cell_text = str(row[col_idx] or "").strip()
                        parsed = _parse_number(cell_text)
                        logger.debug("[VALUE PARSE] raw=%s parsed=%s", cell_text, parsed)
                        if parsed is not None:
                            fb_values.append(parsed)
                        if self.is_valid_financial_value(cell_text, parsed, metric="revenue"):
                            numeric_values_in_row += 1
                    logger.warning("[FALLBACK VALUES] %s", fb_values)
                    if numeric_values_in_row >= 2:
                        logger.warning("[FALLBACK REVENUE] Using first numeric row")
                        revenue_row_candidates.append((100000, row_idx, row, fb_text))
                        break

            if revenue_row_candidates:
                logger.info(
                    "Revenue candidates: page=%s table=%s candidates=%s",
                    table.page_number,
                    table.table_index,
                    [{"row": ridx, "score": score, "text": text[:140]} for score, ridx, _row, text in revenue_row_candidates],
                )
                revenue_row_candidates.sort(key=lambda x: x[0])
                best_score, best_row_idx, best_row, best_row_text = revenue_row_candidates[0]
                logger.info(
                    "Selected revenue row: page=%s table=%s row=%s score=%s text=%s",
                    table.page_number,
                    table.table_index,
                    best_row_idx,
                    best_score,
                    best_row_text[:200],
                )
                logger.info("[DEBUG] Processing row: %s", best_row_text[:300])
                logger.info("[DEBUG] Year columns: %s", year_columns)

                # Require at least 2 valid values (multi-year row).
                valid_pairs: list[tuple[int, str, str, float]] = []
                for col_idx, period in year_columns:
                    raw_cell = str(best_row[col_idx] or "").strip() if col_idx < len(best_row) else ""
                    parsed_value = _parse_number(raw_cell)
                    if raw_cell == "" or parsed_value is None:
                        continue
                    if not self.is_valid_financial_value(raw_cell, parsed_value, metric="revenue"):
                        continue
                    valid_pairs.append((col_idx, period, raw_cell, float(parsed_value)))

                if len(valid_pairs) < 2:
                    logger.info(
                        "[ROW SKIP] Not enough numeric values (page=%s table=%s row=%s valid_values=%s)",
                        table.page_number,
                        table.table_index,
                        best_row_idx,
                        [(p, v) for _, p, _c, v in valid_pairs],
                    )
                    continue

                for col_idx, period, _cell, _parsed in valid_pairs:
                    if col_idx >= len(best_row):
                        logger.info(
                            "[DEBUG] Year=%s col_idx=%s raw_cell=None (index out of range)",
                            period,
                            col_idx,
                        )
                        logger.info("[SKIP] Empty cell")
                        continue
                    cell_text = str(best_row[col_idx] or "").strip()
                    logger.info(
                        "[DEBUG] Year=%s col_idx=%s raw_cell=%s",
                        period,
                        col_idx,
                        cell_text,
                    )
                    parsed = _parse_number(cell_text)
                    logger.info("[DEBUG] Parsed value: %s", parsed)
                    if cell_text == "":
                        logger.info("[SKIP] Empty cell")
                        continue
                    if not self.is_valid_financial_value(cell_text, parsed, metric="revenue"):
                        logger.info(
                            "Filtered invalid value: page=%s table=%s row=%s year=%s cell=%s",
                            table.page_number,
                            table.table_index,
                            best_row_idx,
                            period,
                            cell_text,
                        )
                        logger.info("[SKIP] Failed validation")
                        continue
                    value = self._to_inr_crore(float(parsed), unit)
                    candidates.append(
                        ParsedFact(
                            statement_type="income_statement",
                            metric="revenue",
                            period=period,
                            value=value,
                            currency=currency,
                            unit="INR_CRORE",
                            level=table_level,
                            is_valid=value >= 1000,
                            source_page=table.page_number,
                            extraction_method="rule",
                            confidence=0.95 if table_level == "consolidated" else 0.8,
                        )
                    )
                    revenue_inserted_for_table += 1
                    logger.info(
                        "Final inserted value: metric=revenue page=%s period=%s value=%s",
                        table.page_number,
                        period,
                        value,
                    )
                    logger.info("[INSERT] Revenue fact: year=%s value=%s", period, parsed)

            logger.info("[FALLBACK CHECK] revenue_inserted=%s", revenue_inserted_for_table)
            # AI fallback (ONLY if rule-based revenue extraction is insufficient for this table)
            years_inserted: list[int] = []
            if revenue_row_candidates and revenue_inserted_for_table > 0:
                try:
                    years_inserted = [int(y) for (_cidx, y, _cell, _parsed) in valid_pairs]
                except Exception:
                    years_inserted = []

            span_ok = True
            if len(years_inserted) >= 2:
                span_ok = (max(years_inserted) - min(years_inserted)) >= 2

            if revenue_inserted_for_table < 2 or not span_ok:
                table_text = "\n".join(["\t".join(r) for r in table.rows])
                logger.info(
                    "[AI FALLBACK] Triggered for table page=%s table_index=%s",
                    table.page_number,
                    table.table_index,
                )
                ai_items = self.ai_extractor.extract_revenue_by_year(table_text)
                extracted_pairs: list[tuple[str, float]] = []
                for item in ai_items:
                    try:
                        year = str(int(item.get("year")))
                        revenue = float(item.get("revenue"))
                    except Exception:
                        continue
                    if revenue <= 1000:
                        continue
                    extracted_pairs.append((year, revenue))
                logger.info("[AI RESULT] Extracted revenue: %s", extracted_pairs)
                for year, revenue in extracted_pairs:
                    candidates.append(
                        ParsedFact(
                            statement_type="income_statement",
                            metric="revenue",
                            period=year,
                            value=revenue,
                            currency=currency,
                            unit="INR_CRORE",
                            level="consolidated",
                            is_valid=True,
                            source_page=table.page_number,
                            extraction_method="ai_extracted",
                            confidence=0.6,
                        )
                    )

            for row_idx, row, row_text, metric in other_metric_rows:
                for col_idx, period in year_columns:
                    if col_idx >= len(row):
                        continue
                    cell_text = str(row[col_idx] or "").strip()
                    parsed = _parse_number(cell_text)
                    if not self.is_valid_financial_value(cell_text, parsed, metric=metric):
                        continue
                    value = self._to_inr_crore(float(parsed), unit)
                    candidates.append(
                        ParsedFact(
                            statement_type="income_statement",
                            metric=metric,
                            period=period,
                            value=value,
                            currency=currency,
                            unit="INR_CRORE",
                            level=table_level,
                            is_valid=value >= 1000,
                            source_page=table.page_number,
                            extraction_method="rule",
                            confidence=0.9 if table_level == "consolidated" else 0.7,
                        )
                    )

        grouped: dict[tuple[str, str], list[ParsedFact]] = {}
        for fact in candidates:
            if not fact.is_valid:
                continue
            grouped.setdefault((fact.metric, fact.period), []).append(fact)

        selected: list[ParsedFact] = []
        for (metric, period), options in grouped.items():
            consolidated = [o for o in options if o.level == "consolidated"]
            pool = consolidated if consolidated else options
            best = max(pool, key=lambda x: x.value)
            if metric == "revenue":
                logger.info(
                    "Selected revenue fact: period=%s chosen_value=%s candidates=%s",
                    period,
                    best.value,
                    [o.value for o in pool],
                )
                logger.info("[FINAL] Inserted revenue: period=%s value=%s", period, best.value)
            selected.append(
                ParsedFact(
                    statement_type=best.statement_type,
                    metric=metric,
                    period=period,
                    value=best.value,
                    currency=best.currency,
                    unit="INR_CRORE",
                    level="consolidated" if consolidated else best.level,
                    is_valid=True,
                    source_page=best.source_page,
                    extraction_method=best.extraction_method,
                    confidence=best.confidence,
                )
            )

        # TEXT fallback (final safety net): only if tables+AI still yield insufficient revenue.
        revenue_years = sorted({s.period for s in selected if s.metric == "revenue"})
        if full_text and len(revenue_years) < 2:
            logger.info("[TEXT FALLBACK] Triggered")
            text_pairs = self.extract_revenue_from_text(full_text)
            logger.info("[TEXT RESULTS] %s", text_pairs)
            for year, revenue in text_pairs:
                if revenue <= 1000:
                    continue
                candidates.append(
                    ParsedFact(
                        statement_type="income_statement",
                        metric="revenue",
                        period=str(year),
                        value=float(revenue),
                        currency=currency,
                        unit="INR_CRORE",
                        level="consolidated",
                        is_valid=True,
                        source_page=1,
                        extraction_method="text_fallback",
                        confidence=0.4,
                    )
                )

            # Re-select after adding text fallback candidates.
            grouped = {}
            for fact in candidates:
                if not fact.is_valid:
                    continue
                grouped.setdefault((fact.metric, fact.period), []).append(fact)
            selected = []
            for (metric, period), options in grouped.items():
                consolidated = [o for o in options if o.level == "consolidated"]
                pool = consolidated if consolidated else options
                best = max(pool, key=lambda x: x.value)
                selected.append(
                    ParsedFact(
                        statement_type=best.statement_type,
                        metric=metric,
                        period=period,
                        value=best.value,
                        currency=best.currency,
                        unit="INR_CRORE",
                        level="consolidated" if consolidated else best.level,
                        is_valid=True,
                        source_page=best.source_page,
                        extraction_method=best.extraction_method,
                        confidence=best.confidence,
                    )
                )

        # Persist debug tables JSON for inspection.
        try:
            os.makedirs("debug_output", exist_ok=True)
            with open("debug_output/debug_tables.json", "w", encoding="utf-8") as f:
                json.dump(debug_tables, f, indent=2)
            logger.info("Wrote debug tables JSON: debug_output/debug_tables.json (tables=%s)", len(debug_tables))
        except Exception as exc:
            logger.info("Failed writing debug tables JSON: %s", exc)

        revenue_inserted_rule = sum(
            1 for s in selected if s.metric == "revenue" and s.extraction_method == "rule"
        )
        revenue_inserted_ai = sum(
            1 for s in selected if s.metric == "revenue" and s.extraction_method == "ai_extracted"
        )
        revenue_inserted_text = sum(
            1 for s in selected if s.metric == "revenue" and s.extraction_method == "text_fallback"
        )
        total_revenue_rows = revenue_inserted_rule + revenue_inserted_ai + revenue_inserted_text

        logger.info("\n===== INGEST SUMMARY =====")
        logger.info("Total tables: %s", total_tables)
        logger.info("Processed tables: %s", processed_tables)
        logger.info("Skipped (no signal): %s", skipped_no_signal)
        logger.info("Skipped (reject): %s", skipped_reject)
        logger.info("Skipped (no year mapping): %s", skipped_no_year)
        logger.info("")
        logger.info("Revenue insertions (final selected rows):")
        logger.info("Rule-based: %s", revenue_inserted_rule)
        logger.info("AI fallback: %s", revenue_inserted_ai)
        logger.info("Text fallback: %s", revenue_inserted_text)
        logger.info("Total revenue rows: %s", total_revenue_rows)
        logger.info("==========================\n")

        return selected

    def parse_pdf(self, pdf_bytes: bytes) -> tuple[list[ParsedFact], str]:
        tables, currency, full_text = self.extract_all_tables(pdf_bytes)
        facts = self.process_tables_to_facts(tables, currency, full_text=full_text)
        return facts, currency

    def to_table_models(self, company: str, source_file: str, tables: list[ExtractedTable]) -> list[FinancialTable]:
        return [
            FinancialTable(
                company=company,
                source_file=source_file,
                page_number=t.page_number,
                table_index=t.table_index,
                raw_json=json.dumps(t.rows),
            )
            for t in tables
        ]

    def to_models(self, company: str, source_file: str, parsed_facts: list[ParsedFact]) -> list[FinancialFact]:
        return [
            FinancialFact(
                company=company,
                statement_type=f.statement_type,
                metric=f.metric,
                period=f.period,
                value=f.value,
                currency=f.currency,
                unit=f.unit,
                level=f.level,
                source_file=source_file,
                source_page=f.source_page,
                is_valid=f.is_valid,
                extraction_method=f.extraction_method,
                confidence=f.confidence,
            )
            for f in parsed_facts
        ]
