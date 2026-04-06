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
    SQL_OPERATING_MARGIN,
    SQL_PAYABLE_DAYS,
    SQL_PE_RATIO,
    SQL_QUICK_RATIO,
    SQL_RECEIVABLE_DAYS,
    SQL_ROA,
    SQL_ROCE,
    SQL_ROE,
    SQL_YOY_GROWTH,
)

_LEVEL = "level IN ('consolidated', 'standalone', 'line') "


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
        return SQL_ALL_FINANCIAL_FORMULAS

    if "gross profit" in q and "margin" not in q:
        return SQL_GROSS_PROFIT
    if "gross margin" in q or ("gross" in q and "margin" in q):
        return SQL_GROSS_MARGIN
    if "operating margin" in q:
        return SQL_OPERATING_MARGIN
    if "ebitda margin" in q or ("ebitda" in q and "margin" in q):
        return SQL_EBITDA_MARGIN

    if (
        "yoy" in q
        or "year over year" in q
        or "year-over-year" in q
        or ("growth" in q and any(x in q for x in ("revenue", "income", "profit", "sales")))
    ):
        return SQL_YOY_GROWTH

    if "return on equity" in q or re.search(r"\broe\b", q):
        return SQL_ROE
    if "return on asset" in q or re.search(r"\broa\b", q):
        return SQL_ROA
    if "return on capital" in q or re.search(r"\broce\b", q):
        return SQL_ROCE

    if "current ratio" in q:
        return SQL_CURRENT_RATIO
    if "quick ratio" in q or "acid test" in q:
        return SQL_QUICK_RATIO
    if "debt to equity" in q or "debt/equity" in q or "debt-equity" in q:
        return SQL_DEBT_TO_EQUITY
    if "interest coverage" in q:
        return SQL_INTEREST_COVERAGE
    if "asset turnover" in q:
        return SQL_ASSET_TURNOVER
    if "inventory days" in q:
        return SQL_INVENTORY_DAYS
    if "receivable days" in q or "days sales outstanding" in q or re.search(r"\bdso\b", q):
        return SQL_RECEIVABLE_DAYS
    if "payable days" in q or "days payable" in q:
        return SQL_PAYABLE_DAYS

    if "earnings per share" in q or re.search(r"\beps\b", q):
        return SQL_EPS
    if "p/e" in q or "pe ratio" in q or "price to earnings" in q or "price/earnings" in q:
        return SQL_PE_RATIO

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
