from typing import Any

from pydantic import BaseModel


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    question: str
    sql: str
    explanation: str
    rows: list[dict[str, Any]]
    visualization_data: list[dict[str, Any]]
