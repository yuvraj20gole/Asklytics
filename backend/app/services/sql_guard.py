import re


class SQLGuard:
    BLOCKED = re.compile(
        r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b",
        re.IGNORECASE,
    )

    @staticmethod
    def _strip_leading_sql_comments(sql: str) -> str:
        """Strip leading `--` and `/* */` comments before validating the statement head."""
        s = sql.strip()
        while True:
            if s.startswith("--"):
                nl = s.find("\n")
                if nl == -1:
                    return ""
                s = s[nl + 1 :].lstrip()
                continue
            if s.startswith("/*"):
                end = s.find("*/", 2)
                if end == -1:
                    return s
                s = s[end + 2 :].lstrip()
                continue
            break
        return s.strip()

    def validate(self, sql: str) -> str:
        clean = sql.strip().rstrip(";")
        head = self._strip_leading_sql_comments(clean)
        if not head:
            raise ValueError("Only SELECT queries are allowed.")
        lower = head.lower()
        if not (lower.startswith("select") or lower.startswith("with")):
            raise ValueError("Only SELECT queries are allowed.")
        if self.BLOCKED.search(clean):
            raise ValueError("Detected unsafe SQL operation.")
        if re.search(r"\buploaded_data\b", clean, re.IGNORECASE):
            raise ValueError(
                "SQL referenced uploaded_data, which is not in this database. "
                "Use financial_facts with columns period, metric, and value."
            )
        clean = self._enforce_financial_fact_filters(clean)
        return clean

    # PDF/image/row-parser ingest often stores level as standalone or line, not consolidated.
    _LEVEL_FILTER = "(level IN ('consolidated', 'standalone', 'line'))"

    def _enforce_financial_fact_filters(self, sql: str) -> str:
        lower = sql.lower()
        if "from financial_facts" not in lower:
            return sql

        s = sql.strip().rstrip(";")
        # Broaden legacy consolidated-only filters so ingested facts still match.
        s = re.sub(
            r"\blevel\s*=\s*'consolidated'",
            self._LEVEL_FILTER,
            s,
            flags=re.IGNORECASE,
        )
        lower2 = s.lower()
        if "is_valid = 1" in lower2:
            return s

        clause = f"{self._LEVEL_FILTER} AND is_valid = 1"
        if " where " in lower2:
            return re.sub(r"\bwhere\b", f"WHERE {clause} AND ", s, count=1, flags=re.IGNORECASE)

        insertion = re.search(r"\b(group\s+by|order\s+by|limit)\b", s, flags=re.IGNORECASE)
        if not insertion:
            return f"{s} WHERE {clause}"
        idx = insertion.start()
        return f"{s[:idx]} WHERE {clause} {s[idx:]}"
