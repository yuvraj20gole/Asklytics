class ExplainService:
    def explain(self, sql: str) -> str:
        return (
            "This query retrieves data from your business tables using safe read-only SQL. "
            f"Generated SQL: {sql}"
        )
