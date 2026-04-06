from typing import Literal

from pydantic import BaseModel, Field


class ImageStructuredRow(BaseModel):
    year: int
    metric: str
    value: int
    raw: str = ""
    currency: str | None = None


class ImageConfidenceSummary(BaseModel):
    avg_confidence: float = 0.0
    high_confidence_rows: int = 0


class IngestPDFResponse(BaseModel):
    inserted_rows: int
    tables_extracted: int = 0
    detected_currency: str
    company: str
    source_file: str
    rows: list[ImageStructuredRow] = Field(default_factory=list)


class IngestImageResponse(BaseModel):
    file_type: str
    company: str
    source_file: str
    extracted_items: int = Field(description="Same as len(rows)")
    rows: list[ImageStructuredRow] = Field(default_factory=list)
    source: Literal["layoutlm", "ocr_fallback"] = "ocr_fallback"
    confidence_summary: ImageConfidenceSummary | None = None
    currency: str | None = None
