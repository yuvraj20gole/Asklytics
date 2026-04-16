"""Helpers for templated financial_facts SQL (period filters + aggregates)."""

from app.services.financial_formulas_sql import (
    SQL_ROE,
    apply_period_filter_to_formula_sql,
    period_year_filter_sql,
)


def test_period_year_filter_sql_range():
    pred = period_year_filter_sql("show roe between 2020 and 2022")
    assert pred is not None
    assert "2020" in pred and "2022" in pred


def test_apply_period_filter_inserts_where():
    out = apply_period_filter_to_formula_sql(SQL_ROE, "1=1")
    assert "WHERE (1=1)" in out.replace("\n", " ")
    assert "ORDER BY period" in out


def test_period_year_filter_sql_none():
    assert period_year_filter_sql("average roe") is None
