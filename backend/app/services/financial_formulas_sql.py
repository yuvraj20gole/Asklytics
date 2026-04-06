"""
Computed financial ratios from `financial_facts` (one row per period after GROUP BY).

Uses metric names you can add during ingest: revenue, cogs, expenses, net_income,
operating_income, ebitda, equity, total_assets, current_assets, current_liabilities,
inventory, receivables, payables, total_debt, interest_expense, shares, share_price.
If a fact is missing, the corresponding formula column is NULL.
"""

# Pivot: one row per period with common metrics as columns.
PIVOT_SUBQUERY = """
SELECT period,
  MAX(CASE WHEN metric = 'revenue' THEN value END) AS revenue,
  MAX(CASE WHEN metric IN ('cogs', 'cost_of_goods_sold') THEN value END) AS cogs,
  MAX(CASE WHEN metric = 'expenses' THEN value END) AS expenses,
  MAX(CASE WHEN metric = 'net_income' THEN value END) AS net_income,
  MAX(CASE WHEN metric = 'operating_income' THEN value END) AS operating_income,
  MAX(CASE WHEN metric = 'ebitda' THEN value END) AS ebitda,
  MAX(CASE WHEN metric IN ('shareholders_equity', 'total_equity', 'equity') THEN value END) AS equity,
  MAX(CASE WHEN metric IN ('total_assets', 'assets') THEN value END) AS total_assets,
  MAX(CASE WHEN metric = 'current_assets' THEN value END) AS current_assets,
  MAX(CASE WHEN metric = 'current_liabilities' THEN value END) AS current_liabilities,
  MAX(CASE WHEN metric IN ('inventory', 'inventories') THEN value END) AS inventory,
  MAX(CASE WHEN metric IN ('receivables', 'trade_receivables', 'accounts_receivable') THEN value END) AS receivables,
  MAX(CASE WHEN metric IN ('payables', 'trade_payables', 'accounts_payable') THEN value END) AS payables,
  MAX(CASE WHEN metric IN ('total_debt', 'debt') THEN value END) AS total_debt,
  MAX(CASE WHEN metric IN ('interest_expense', 'finance_cost') THEN value END) AS interest_expense,
  MAX(CASE WHEN metric IN ('weighted_avg_shares', 'shares_outstanding', 'shares') THEN value END) AS shares,
  MAX(CASE WHEN metric = 'share_price' THEN value END) AS share_price
FROM financial_facts
WHERE level IN ('consolidated', 'standalone', 'line') AND is_valid = 1
GROUP BY period
""".strip()

# Operating figure for margin: operating_income, else (revenue - expenses) when expenses present.
_ENRICHED_CTE = """
enriched AS (
  SELECT p.*,
    CASE
      WHEN operating_income IS NOT NULL THEN operating_income
      WHEN expenses IS NOT NULL AND revenue IS NOT NULL THEN revenue - expenses
      ELSE NULL
    END AS op_for_margin,
    CASE
      WHEN ebitda IS NOT NULL THEN ebitda
      WHEN operating_income IS NOT NULL THEN operating_income
      ELSE NULL
    END AS ebit_for_roce_and_coverage
  FROM p
)
""".strip()

SQL_ALL_FINANCIAL_FORMULAS = f"""
WITH p AS (
{PIVOT_SUBQUERY}
),
{_ENRICHED_CTE}
SELECT
  period,
  ROUND(100.0 * (revenue - cogs) / NULLIF(revenue, 0), 2) AS gross_margin_pct,
  ROUND(100.0 * op_for_margin / NULLIF(revenue, 0), 2) AS operating_margin_pct,
  ROUND(100.0 * ebitda / NULLIF(revenue, 0), 2) AS ebitda_margin_pct,
  ROUND(100.0 * net_income / NULLIF(revenue, 0), 2) AS net_profit_margin_pct,
  ROUND(100.0 * net_income / NULLIF(equity, 0), 2) AS roe_pct,
  ROUND(100.0 * net_income / NULLIF(total_assets, 0), 2) AS roa_pct,
  ROUND(100.0 * ebit_for_roce_and_coverage / NULLIF(total_assets - COALESCE(current_liabilities, 0), 0), 2) AS roce_pct,
  ROUND(1.0 * current_assets / NULLIF(current_liabilities, 0), 3) AS current_ratio,
  ROUND(1.0 * (current_assets - COALESCE(inventory, 0)) / NULLIF(current_liabilities, 0), 3) AS quick_ratio,
  ROUND(1.0 * total_debt / NULLIF(equity, 0), 3) AS debt_to_equity,
  ROUND(1.0 * ebit_for_roce_and_coverage / NULLIF(interest_expense, 0), 3) AS interest_coverage,
  ROUND(1.0 * revenue / NULLIF(total_assets, 0), 3) AS asset_turnover,
  ROUND(365.0 * COALESCE(inventory, 0) / NULLIF(cogs, 0), 1) AS inventory_days,
  ROUND(365.0 * COALESCE(receivables, 0) / NULLIF(revenue, 0), 1) AS receivable_days,
  ROUND(365.0 * COALESCE(payables, 0) / NULLIF(cogs, 0), 1) AS payable_days,
  ROUND(1.0 * net_income / NULLIF(shares, 0), 4) AS eps,
  ROUND(1.0 * share_price * shares / NULLIF(net_income, 0), 2) AS pe_ratio,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY period))
    / NULLIF(LAG(revenue) OVER (ORDER BY period), 0), 2) AS yoy_revenue_growth_pct,
  ROUND(100.0 * (net_income - LAG(net_income) OVER (ORDER BY period))
    / NULLIF(ABS(LAG(net_income) OVER (ORDER BY period)), 0), 2) AS yoy_net_income_growth_pct
FROM enriched
ORDER BY period
""".strip()


def _with_pivot_prefix() -> str:
    return f"WITH p AS (\n{PIVOT_SUBQUERY}\n),\n{_ENRICHED_CTE}\n"


SQL_GROSS_PROFIT = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(revenue - cogs, 2) AS gross_profit FROM enriched ORDER BY period"
)

SQL_GROSS_MARGIN = (
    _with_pivot_prefix()
    + "SELECT period, "
    "ROUND(100.0 * (revenue - cogs) / NULLIF(revenue, 0), 2) AS gross_margin_pct "
    "FROM enriched ORDER BY period"
)

SQL_OPERATING_MARGIN = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(100.0 * op_for_margin / NULLIF(revenue, 0), 2) AS operating_margin_pct "
    "FROM enriched ORDER BY period"
)

SQL_EBITDA_MARGIN = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(100.0 * ebitda / NULLIF(revenue, 0), 2) AS ebitda_margin_pct "
    "FROM enriched ORDER BY period"
)

SQL_YOY_GROWTH = (
    _with_pivot_prefix()
    + "SELECT period, revenue, net_income, "
    "ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY period)) "
    "/ NULLIF(LAG(revenue) OVER (ORDER BY period), 0), 2) AS yoy_revenue_growth_pct, "
    "ROUND(100.0 * (net_income - LAG(net_income) OVER (ORDER BY period)) "
    "/ NULLIF(ABS(LAG(net_income) OVER (ORDER BY period)), 0), 2) AS yoy_net_income_growth_pct "
    "FROM enriched ORDER BY period"
)

SQL_ROE = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(100.0 * net_income / NULLIF(equity, 0), 2) AS roe_pct "
    "FROM enriched ORDER BY period"
)

SQL_ROA = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(100.0 * net_income / NULLIF(total_assets, 0), 2) AS roa_pct "
    "FROM enriched ORDER BY period"
)

SQL_ROCE = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(100.0 * ebit_for_roce_and_coverage "
    "/ NULLIF(total_assets - COALESCE(current_liabilities, 0), 0), 2) AS roce_pct "
    "FROM enriched ORDER BY period"
)

SQL_CURRENT_RATIO = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * current_assets / NULLIF(current_liabilities, 0), 3) AS current_ratio "
    "FROM enriched ORDER BY period"
)

SQL_QUICK_RATIO = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * (current_assets - COALESCE(inventory, 0)) "
    "/ NULLIF(current_liabilities, 0), 3) AS quick_ratio "
    "FROM enriched ORDER BY period"
)

SQL_DEBT_TO_EQUITY = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * total_debt / NULLIF(equity, 0), 3) AS debt_to_equity "
    "FROM enriched ORDER BY period"
)

SQL_INTEREST_COVERAGE = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * ebit_for_roce_and_coverage / NULLIF(interest_expense, 0), 3) "
    "AS interest_coverage FROM enriched ORDER BY period"
)

SQL_ASSET_TURNOVER = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * revenue / NULLIF(total_assets, 0), 3) AS asset_turnover "
    "FROM enriched ORDER BY period"
)

SQL_INVENTORY_DAYS = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(365.0 * COALESCE(inventory, 0) / NULLIF(cogs, 0), 1) AS inventory_days "
    "FROM enriched ORDER BY period"
)

SQL_RECEIVABLE_DAYS = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(365.0 * COALESCE(receivables, 0) / NULLIF(revenue, 0), 1) AS receivable_days "
    "FROM enriched ORDER BY period"
)

SQL_PAYABLE_DAYS = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(365.0 * COALESCE(payables, 0) / NULLIF(cogs, 0), 1) AS payable_days "
    "FROM enriched ORDER BY period"
)

SQL_EPS = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * net_income / NULLIF(shares, 0), 4) AS eps FROM enriched ORDER BY period"
)

SQL_PE_RATIO = (
    _with_pivot_prefix()
    + "SELECT period, ROUND(1.0 * share_price * shares / NULLIF(net_income, 0), 2) AS pe_ratio "
    "FROM enriched ORDER BY period"
)
