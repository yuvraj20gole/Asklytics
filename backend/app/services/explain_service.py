class ExplainService:
    def explain(self, sql: str) -> str:
        low = sql.lower()
        if "profit_margin_pct" in low:
            return (
                "Net profit margin by period (percent): net income ÷ revenue × 100. "
                "Uses your ingested revenue and net income (or operating income / EBITDA) rows; "
                "not showing raw revenue here so the focus stays on the margin."
            )
        if "from enriched" in low or "gross_margin_pct" in low or "yoy_revenue_growth" in low:
            return (
                "Computed financial ratios from your financial_facts table (pivot by period). "
                "Columns are NULL when the underlying metrics are not ingested (e.g. balance-sheet lines "
                "for ROE/ROA, current assets/liabilities for liquidity, shares for EPS). "
                "Ask for a single ratio or ingest more line items to populate the full dashboard."
            )
        return (
            "This query retrieves data from your business tables using safe read-only SQL. "
            f"Generated SQL: {sql}"
        )
