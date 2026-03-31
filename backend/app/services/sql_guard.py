import re


class SQLGuard:
    BLOCKED = re.compile(
        r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b",
        re.IGNORECASE,
    )

    def validate(self, sql: str) -> str:
        clean = sql.strip().rstrip(";")
        if not clean.lower().startswith("select"):
            raise ValueError("Only SELECT queries are allowed.")
        if self.BLOCKED.search(clean):
            raise ValueError("Detected unsafe SQL operation.")
        clean = self._enforce_financial_fact_filters(clean)
        return clean

    def _enforce_financial_fact_filters(self, sql: str) -> str:
        lower = sql.lower()
        if "from financial_facts" not in lower:
            return sql

        if "level = 'consolidated'" in lower and "is_valid = 1" in lower:
            return sql

        clause = "level = 'consolidated' AND is_valid = 1"
        if " where " in lower:
            return re.sub(r"\bwhere\b", f"WHERE {clause} AND ", sql, count=1, flags=re.IGNORECASE)

        insertion = re.search(r"\b(group\s+by|order\s+by|limit)\b", sql, flags=re.IGNORECASE)
        if not insertion:
            return f"{sql} WHERE {clause}"
        idx = insertion.start()
        return f"{sql[:idx]} WHERE {clause} {sql[idx:]}"
