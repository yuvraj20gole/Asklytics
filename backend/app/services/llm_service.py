"""
Ask/SQL service routing.

SEARCH TAGS:
- @flow:ask_endpoint            → API handler that calls into this service
- @sql:template_financial_facts → `template_sql_financial_facts`
- @sql:template_formula_router  → `_template_formula_questions`
- @sql:period_range_filter      → `_maybe_filter_formula_period` + `period_year_filter_sql`
- @guard:sql_safety             → any guards that reject non-allowed tables (see `sql_guard.py`)

Important: despite the module name, `/ask` is designed to be *deterministic* for
common financial questions when `financial_facts` is present. These templates
avoid hallucinated tables/columns and keep behavior stable in production.
"""

import re

from app.core.config import get_settings
from app.services.financial_formulas_sql import (
    SQL_ALL_FINANCIAL_FORMULAS,
    SQL_ASSET_TURNOVER,
    SQL_CURRENT_RATIO,
    SQL_DEBT_TO_EQUITY,
    SQL_EBITDA_MARGIN,
    SQL_EPS,
    SQL_GROSS_MARGIN,
    SQL_GROSS_PROFIT,
    SQL_INTEREST_COVERAGE,
    SQL_INVENTORY_DAYS,
    SQL_NET_MARGIN_AVG,
    SQL_NET_PROFIT_MARGIN,
    SQL_OPERATING_MARGIN,
    SQL_PAYABLE_DAYS,
    SQL_PE_RATIO,
    SQL_QUICK_RATIO,
    SQL_RECEIVABLE_DAYS,
    SQL_ROA,
    SQL_ROCE,
    SQL_ROE,
    SQL_ROE_AVG,
    SQL_TOTAL_NET_INCOME,
    SQL_TOTAL_REVENUE,
    SQL_YOY_GROWTH,
    apply_period_filter_to_formula_sql,
    period_year_filter_sql,
)

_LEVEL = "level IN ('consolidated', 'standalone', 'line') "


def _maybe_filter_formula_period(q: str, sql: str) -> str:
    pred = period_year_filter_sql(q.lower())
    if pred:
        return apply_period_filter_to_formula_sql(sql, pred)
    return sql


def _template_formula_questions(q: str) -> str | None:
    """P&L / ratio questions backed by financial_formulas_sql (pivot over financial_facts)."""
    if any(
        p in q
        for p in (
            "all ratio",
            "all formulas",
            "every ratio",
            "financial ratios",
            "all financial metrics",
            "ratio dashboard",
            "key metrics",
            "kpi dashboard",
            "full metrics",
            "complete metrics",
            "all metrics",
        )
    ):
        return _maybe_filter_formula_period(q, SQL_ALL_FINANCIAL_FORMULAS)

    _fin_ctx = re.search(
        r"\b(financial|accounting|ratio|statement|balance|sheet|p&l|pnl|metric|kpi|company|fiscal|fy|earnings)\b",
        q,
    )
    asks_avg = "average" in q or "mean" in q or bool(re.search(r"\bavg\b", q))
    asks_sumish = (
        any(w in q for w in ("sum", "total", "combined", "aggregate"))
        or "add up" in q
        or "total of" in q
    )

    if "gross profit" in q and "margin" not in q:
        return _maybe_filter_formula_period(q, SQL_GROSS_PROFIT)
    if (
        "gross margin" in q
        or ("gross" in q and "margin" in q)
        or re.search(r"\b(g\.?\s*p\.?|gp)\s+margin\b", q)
        or re.search(r"gross\s+profit\s+margin", q)
    ):
        return _maybe_filter_formula_period(q, SQL_GROSS_MARGIN)
    if (
        "operating margin" in q
        or re.search(r"operating profit margin", q)
        or re.search(r"\bop margin\b", q)
    ):
        return _maybe_filter_formula_period(q, SQL_OPERATING_MARGIN)
    if "ebitda margin" in q or ("ebitda" in q and "margin" in q):
        return _maybe_filter_formula_period(q, SQL_EBITDA_MARGIN)
    if (
        re.search(r"net profit margin|net margin", q)
        or (
            re.search(r"\bnpm\b", q)
            and _fin_ctx
            and re.search(r"\b(margin|profit|net|ratio|pct|percent)\b", q)
        )
    ):
        if asks_avg:
            return SQL_NET_MARGIN_AVG
        return _maybe_filter_formula_period(q, SQL_NET_PROFIT_MARGIN)

    if (
        asks_sumish
        and ("revenue" in q or "sales" in q or "turnover" in q)
        and "yoy" not in q
        and not ("growth" in q and any(x in q for x in ("revenue", "income", "profit", "sales")))
        and not re.search(r"total\s+assets|total\s+debt", q)
    ):
        return SQL_TOTAL_REVENUE
    if (
        asks_sumish
        and ("net income" in q or "net profit" in q or re.search(r"\bp\.?a\.?t\.?\b", q))
        and "revenue" not in q
        and "sales" not in q
        and "turnover" not in q
    ):
        return SQL_TOTAL_NET_INCOME

    if (
        "yoy" in q
        or re.search(r"\by\s*o\s*y\b", q)
        or "year over year" in q
        or "year-over-year" in q
        or "year on year" in q
        or ("growth" in q and any(x in q for x in ("revenue", "income", "profit", "sales")))
    ):
        return _maybe_filter_formula_period(q, SQL_YOY_GROWTH)

    if (
        re.search(r"\broe\b", q)
        or "return on equity" in q
        or "return on shareholders" in q
        or "return on shareholder's equity" in q
        or "return on shareholders' equity" in q
    ):
        if asks_avg:
            return SQL_ROE_AVG
        return _maybe_filter_formula_period(q, SQL_ROE)
    if re.search(r"\broa\b", q) or re.search(r"return on assets?", q):
        return _maybe_filter_formula_period(q, SQL_ROA)
    if (
        re.search(r"\broce\b", q)
        or "return on capital employed" in q
        or re.search(r"return on capital\b", q)
    ):
        return _maybe_filter_formula_period(q, SQL_ROCE)

    if (
        re.search(r"current ratio", q)
        or "current liquidity" in q
        or re.search(r"working capital ratio", q)
        or (
            re.search(r"\bwc\s+ratio\b", q)
            and re.search(r"\b(working|capital|liquidity|current)\b", q)
        )
        or (
            re.search(r"liquidity ratio", q)
            and not re.search(r"\b(market|stock|crypto|token|fx|forex|volume|trading)\b", q)
            and (
                _fin_ctx
                or re.search(r"\b(current|asset|balance|sheet|covenant)\b", q)
            )
        )
    ):
        return _maybe_filter_formula_period(q, SQL_CURRENT_RATIO)
    if (
        "quick ratio" in q
        or "acid test" in q
        or re.search(r"acid[-\s]?test ratio", q)
        or (re.search(r"liquidity test", q) and re.search(r"\b(quick|acid|ratio)\b", q))
    ):
        return _maybe_filter_formula_period(q, SQL_QUICK_RATIO)
    if (
        "debt to equity" in q
        or "debt/equity" in q
        or "debt-equity" in q
        or "debt equity" in q
        or re.search(r"\bd\s*/\s*e\b", q)
        or ("gearing" in q and re.search(r"debt|borrow|leverage|equity", q))
        or (
            re.search(r"leverage ratio", q)
            and re.search(r"\b(debt|borrow|loan|gearing|equity|covenant|balance sheet)\b", q)
        )
    ):
        return _maybe_filter_formula_period(q, SQL_DEBT_TO_EQUITY)
    if (
        re.search(r"interest cover(?:age)?", q)
        or "times interest earned" in q
        or re.search(r"\btie\s+ratio\b", q)
        or (
            re.search(r"\btie\b", q)
            and re.search(r"\b(interest|ebitda|ebit|coverage|coupon|borrow|debt|loan|bond)\b", q)
        )
    ):
        return _maybe_filter_formula_period(q, SQL_INTEREST_COVERAGE)
    if re.search(r"asset turnover", q) or re.search(r"asset turns?\b", q) or "sales to total assets" in q:
        return _maybe_filter_formula_period(q, SQL_ASSET_TURNOVER)
    if re.search(r"inventory days", q) or re.search(r"days['\s]?inventory", q) or re.search(r"\bdio\b", q):
        return _maybe_filter_formula_period(q, SQL_INVENTORY_DAYS)
    if (
        "receivable days" in q
        or "days sales outstanding" in q
        or re.search(r"\bdso\b", q)
        or re.search(r"accounts? receivable days", q)
        or re.search(r"\bar days\b", q)
        or ("collection period" in q and re.search(r"receivable|\bar\b|dso|sales", q))
    ):
        return _maybe_filter_formula_period(q, SQL_RECEIVABLE_DAYS)
    if (
        "payable days" in q
        or "days payable" in q
        or re.search(r"\bdpo\b", q)
        or re.search(r"accounts? payable days", q)
        or ("payment period" in q and re.search(r"payable|supplier|dpo", q))
    ):
        return _maybe_filter_formula_period(q, SQL_PAYABLE_DAYS)

    if re.search(r"earnings? per share", q) or re.search(r"\beps\b", q):
        return _maybe_filter_formula_period(q, SQL_EPS)
    if (
        re.search(r"p\s*/\s*e\b", q)
        or re.search(r"p[\s\-]*e ratio", q)
        or "p/e" in q
        or "pe ratio" in q
        or "price to earnings" in q
        or "price/earnings" in q
        or re.search(r"price earnings ratio", q)
    ):
        return _maybe_filter_formula_period(q, SQL_PE_RATIO)

    return None


def template_sql_financial_facts(question: str, schema_context: str) -> str | None:
    """
    Deterministic SQL for common P&L questions over financial_facts.
    No LLM — avoids invented tables (e.g. uploaded_data) and wrong aggregations.
    """
    if "financial_facts(" not in schema_context.lower():
        return None

    q = question.lower()
    asks_revenue = "revenue" in q or "sales" in q
    asks_expense = (
        "expense" in q
        or "expenses" in q
        or "exoense" in q
        or "exoenses" in q
        or "spend" in q
        or "spending" in q
        or "expen" in q
        or "cogs" in q
    )
    asks_highest = any(
        kw in q for kw in ["highest", "max", "maximum", "top", "peak", "most"]
    )
    asks_lowest = any(
        kw in q for kw in ["lowest", "min", "minimum", "least", "bottom"]
    )

    formula_sql = _template_formula_questions(q)
    if formula_sql is not None:
        return formula_sql

    if asks_revenue and asks_highest and ("year" in q or "period" in q):
        return (
            "SELECT period, MAX(value) AS revenue "
            "FROM financial_facts "
            "WHERE metric = 'revenue' "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "GROUP BY period "
            "ORDER BY revenue DESC LIMIT 1"
        )
    if asks_revenue and asks_lowest and ("year" in q or "period" in q):
        return (
            "SELECT period, MAX(value) AS revenue "
            "FROM financial_facts "
            "WHERE metric = 'revenue' "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "GROUP BY period "
            "ORDER BY revenue ASC LIMIT 1"
        )
    if "trend" in q and asks_revenue:
        return (
            "SELECT period, value AS revenue "
            "FROM financial_facts "
            "WHERE metric = 'revenue' "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "ORDER BY period"
        )
    if "compare" in q and asks_revenue and asks_expense:
        return (
            "SELECT period, "
            "MAX(CASE WHEN metric = 'revenue' THEN value END) AS revenue, "
            "MAX(CASE WHEN metric IN ('expenses', 'cogs') THEN value END) AS expenses "
            "FROM financial_facts "
            f"WHERE {_LEVEL}"
            "AND is_valid = 1 "
            "GROUP BY period "
            "ORDER BY period"
        )
    if "trend" in q and asks_expense and not asks_revenue:
        return (
            "SELECT period, value AS expenses "
            "FROM financial_facts "
            "WHERE metric IN ('expenses', 'cogs') "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "ORDER BY period"
        )
    if asks_expense:
        return (
            "SELECT period, value AS expenses "
            "FROM financial_facts "
            "WHERE metric IN ('expenses', 'cogs') "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "ORDER BY period"
        )
    # Must run before the generic "profit" branch: "profit" is a substring of "profit margin".
    if "margin" in q:
        # Net profit margin only (gross/operating/ebitda handled above).
        return (
            "SELECT period, "
            "ROUND(100.0 * MAX(CASE WHEN metric IN ('net_income', 'operating_income', 'ebitda') THEN value END) "
            "/ NULLIF(MAX(CASE WHEN metric = 'revenue' THEN value END), 0), 2) AS profit_margin_pct "
            "FROM financial_facts "
            f"WHERE {_LEVEL}"
            "AND is_valid = 1 "
            "GROUP BY period "
            "HAVING MAX(CASE WHEN metric = 'revenue' THEN value END) IS NOT NULL "
            "AND MAX(CASE WHEN metric = 'revenue' THEN value END) > 0 "
            "ORDER BY period"
        )
    if "net income" in q or "profit" in q:
        return (
            "SELECT period, value AS net_income "
            "FROM financial_facts "
            "WHERE metric IN ('net_income', 'operating_income', 'ebitda') "
            f"AND {_LEVEL}"
            "AND is_valid = 1 "
            "ORDER BY period"
        )
    return None


class LLMService:
    """Rule-based SQL only (no OpenAI) for /ask."""

    def __init__(self) -> None:
        self.settings = get_settings()

    def question_to_sql(self, question: str, schema_context: str) -> str:
        templated = template_sql_financial_facts(question, schema_context)
        if templated:
            return templated

        if "financial_facts(" in schema_context.lower():
            return (
                "SELECT period, metric, value, currency, company "
                "FROM financial_facts "
                f"WHERE {_LEVEL}"
                "AND is_valid = 1 "
                "ORDER BY period DESC "
                "LIMIT 100"
            )
        return "SELECT period, metric, value FROM financial_facts WHERE is_valid = 1 ORDER BY period"
