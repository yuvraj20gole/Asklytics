from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def migrate_financial_facts_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "financial_facts" not in tables:
        return

    existing = {c["name"] for c in inspector.get_columns("financial_facts")}
    ddl_statements: list[str] = []

    if "unit" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN unit TEXT")
    if "level" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN level TEXT")
    if "statement_type" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN statement_type TEXT")
    if "is_valid" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN is_valid BOOLEAN DEFAULT 1")
    if "source_page" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN source_page INTEGER")
    if "extraction_method" not in existing:
        ddl_statements.append("ALTER TABLE financial_facts ADD COLUMN extraction_method TEXT")

    with engine.begin() as conn:
        for ddl in ddl_statements:
            conn.execute(text(ddl))

        # Backward compatibility defaults for old rows.
        conn.execute(
            text(
                "UPDATE financial_facts SET unit = COALESCE(unit, 'INR_CRORE'), "
                "level = COALESCE(level, 'segment'), "
                "statement_type = COALESCE(statement_type, 'income_statement'), "
                "is_valid = COALESCE(is_valid, 1), "
                "source_page = COALESCE(source_page, 1), "
                "extraction_method = COALESCE(extraction_method, 'rule')"
            )
        )


def migrate_financial_tables_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "financial_tables" in tables:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE financial_tables (
                    id INTEGER PRIMARY KEY,
                    company TEXT NOT NULL,
                    source_file TEXT NOT NULL,
                    page_number INTEGER NOT NULL,
                    table_index INTEGER NOT NULL,
                    raw_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
                """
            )
        )
