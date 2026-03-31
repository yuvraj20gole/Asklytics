from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import engine, get_db
from app.schemas.ask import AskRequest, AskResponse
from app.services.explain_service import ExplainService
from app.services.financial_validation import FinancialSeriesValidator
from app.services.llm_service import LLMService
from app.services.rag_service import SchemaRAGService
from app.services.sql_executor import SQLExecutor
from app.services.sql_guard import SQLGuard

router = APIRouter()

llm_service = LLMService()
rag_service = SchemaRAGService()
sql_guard = SQLGuard()
sql_executor = SQLExecutor()
explain_service = ExplainService()
financial_validator = FinancialSeriesValidator()


def _build_visualization_data(rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    if "period" in rows[0]:
        return sorted(rows, key=lambda r: str(r.get("period", "")))
    return rows


@router.post("/ask", response_model=AskResponse)
def ask(
    payload: AskRequest,
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> AskResponse:
    try:
        schema_context = rag_service.get_schema_context(engine)
        raw_sql = llm_service.question_to_sql(payload.question, schema_context)
        safe_sql = sql_guard.validate(raw_sql)
        rows = sql_executor.execute(db, safe_sql)
        rows = financial_validator.clean_output_rows(rows)
        financial_validator.validate_financial_series(rows)
        explanation = explain_service.explain(safe_sql)
        return AskResponse(
            question=payload.question,
            sql=safe_sql,
            explanation=explanation,
            rows=rows,
            visualization_data=_build_visualization_data(rows),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ask query failed: {exc}") from exc
