from collections.abc import Sequence
import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings


class SQLExecutor:
    def execute(self, db: Session, sql: str) -> list[dict]:
        settings = get_settings()
        # Avoid appending a second LIMIT for queries that already specify one.
        if re.search(r"\blimit\s+\d+\b", sql, flags=re.IGNORECASE):
            limited_sql = sql
        else:
            limited_sql = f"{sql} LIMIT {settings.query_max_rows}"
        result = db.execute(text(limited_sql))
        rows: Sequence = result.mappings().all()
        return [dict(r) for r in rows]
