from sqlalchemy import inspect
from sqlalchemy.engine import Engine


class SchemaRAGService:
    def get_schema_context(self, engine: Engine) -> str:
        inspector = inspect(engine)
        lines: list[str] = []
        for table in inspector.get_table_names():
            cols = inspector.get_columns(table)
            col_parts = [f"{c['name']}:{c['type']}" for c in cols]
            lines.append(f"{table}({', '.join(col_parts)})")
        return "\n".join(lines)
