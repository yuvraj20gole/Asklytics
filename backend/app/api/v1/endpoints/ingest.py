"""
Ingest endpoints (PDF + image) for building `financial_facts` and `financial_tables`.

SEARCH TAGS (for repo-wide grep):
- @flow:upload_pdf            → `ingest_pdf` FastAPI route
- @flow:upload_image          → `ingest_image` FastAPI route
- @flow:pdf_table_extract     → `PDFFinancialIngestService.extract_all_tables`
- @flow:pdf_to_facts          → `PDFFinancialIngestService.process_tables_to_facts`
- @flow:pdf_image_fallback    → `_facts_from_pdf_image_fallback` OCR fallback
- @flow:db_insert_financials  → SQLAlchemy inserts into `FinancialFact` / `FinancialTable`

This file is the API entrypoint for uploading CSV/PDF/image-derived financials.
The heavy lifting lives in `app/services/pdf_financial_ingest.py` and
`app/services/image_financial_ingest.py`.
"""

import re
import logging
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models import FinancialFact, FinancialTable
from app.db.session import get_db
from app.schemas.ingest import (
    ImageConfidenceSummary,
    ImageStructuredRow,
    IngestImageResponse,
    IngestPDFResponse,
)
from app.services.pdf_financial_ingest import PDFFinancialIngestService

router = APIRouter()
ingest_service = PDFFinancialIngestService()
logger = logging.getLogger(__name__)

def _clean_period_facts(filename: str, parsed_facts):
    """
    @flow:ingest_sanity_gate

    Period cleanup / sanity filter:
    - Reject obviously wrong years (OCR/table misreads).
    - If the PDF filename contains a report year, tighten acceptable years,
      while still allowing OCR fallback methods through (they can be noisier).
    """
    year_match = re.search(r"(19|20)\d{2}", filename)
    report_year = int(year_match.group(0)) if year_match else None
    cleaned = []
    for f in parsed_facts:
        try:
            p = int(str(f.period))
        except ValueError:
            continue
        # Global sanity gate.
        if p < 1990 or p > 2030:
            continue
        # Tighten around report year when available (table extraction only).
        if report_year and not (report_year - 3 <= p <= report_year + 1):
            if getattr(f, "extraction_method", None) in ("pdf_image_fallback", "pdf_row_parser"):
                cleaned.append(f)
            continue
        cleaned.append(f)
    return cleaned


@router.post("/ingest/pdf", response_model=IngestPDFResponse)
async def ingest_pdf(
    company: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user),
) -> IngestPDFResponse:
    """
    @flow:upload_pdf

    Upload a PDF statement and persist extracted facts.

    Pipeline overview:
    - Read bytes from multipart upload.
    - Try structured table extraction first (fast, higher precision).
    - If no facts: fallback to image/OCR pipeline.
    - Clean/validate periods.
    - Replace prior facts for the same `(company, source_file)` to avoid duplicates.
    - Insert `FinancialTable` + `FinancialFact` and return a preview.
    """
    filename = file.filename or "uploaded.pdf"
    logger.info("[PDF UPLOAD] filename=%s content_type=%s", filename, (file.content_type or ""))
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    # @flow:pdf_table_extract
    logger.info("[PDF PROCESS START] bytes=%d", len(payload))
    raw_tables, detected_currency, full_text = ingest_service.extract_all_tables(payload)
    logger.info("[PDF TABLES FOUND] tables=%d currency=%s", len(raw_tables), detected_currency)
    # @flow:pdf_to_facts
    parsed_facts = ingest_service.process_tables_to_facts(
        raw_tables, detected_currency, full_text=full_text
    )

    if not parsed_facts:
        logger.warning("[PDF FALLBACK TRIGGERED] No structured tables found")
        # @flow:pdf_image_fallback
        fallback_facts = ingest_service._facts_from_pdf_image_fallback(payload, detected_currency)
        if fallback_facts:
            logger.info(
                "[PDF FALLBACK SUCCESS] Extracted %d facts from images",
                len(fallback_facts),
            )
            parsed_facts = fallback_facts
            curs = [f.currency for f in parsed_facts if f.currency]
            if curs:
                detected_currency = max(set(curs), key=curs.count)
        else:
            logger.error("[PDF FALLBACK FAILED] No data from image pipeline")

    parsed_facts = _clean_period_facts(filename, parsed_facts)
    logger.info("[PDF PARSE COMPLETE] facts=%d", len(parsed_facts))

    if not raw_tables and not parsed_facts:
        raise HTTPException(
            status_code=422,
            detail="No tables detected in PDF and image extraction found no facts.",
        )
    if not parsed_facts:
        raise HTTPException(
            status_code=422,
            detail="No structured financial facts extracted from tables OR images.",
        )

    # @flow:db_insert_financials
    # Re-uploading the same file should replace prior facts instead of duplicating.
    db.query(FinancialTable).filter(
        FinancialTable.company == company.strip(),
        FinancialTable.source_file == filename,
    ).delete(synchronize_session=False)
    db.query(FinancialFact).filter(
        FinancialFact.company == company.strip(),
        FinancialFact.source_file == filename,
    ).delete(synchronize_session=False)

    table_models = ingest_service.to_table_models(
        company=company.strip(),
        source_file=filename,
        tables=raw_tables,
    )
    models = ingest_service.to_models(
        company=company.strip(),
        source_file=filename,
        parsed_facts=parsed_facts,
    )
    db.add_all(table_models)
    for m in models:
        if m.metric == "revenue":
            logger.info(
                "Final inserted row: metric=%s period=%s value=%s level=%s is_valid=%s",
                m.metric,
                m.period,
                m.value,
                m.level,
                m.is_valid,
            )
    db.add_all(models)
    db.commit()

    preview_rows = [
        ImageStructuredRow(
            year=int(getattr(f, "period", 0) or 0),
            metric=str(getattr(f, "metric", "")),
            value=int(getattr(f, "value", 0) or 0),
            raw=str(getattr(f, "raw", "") or ""),
            currency=str(getattr(f, "currency", "") or detected_currency) if (getattr(f, "currency", None) or detected_currency) else None,
        )
        for f in parsed_facts[:200]
        if getattr(f, "period", None) is not None and getattr(f, "value", None) is not None
    ]

    return IngestPDFResponse(
        inserted_rows=len(models),
        tables_extracted=len(table_models),
        detected_currency=detected_currency,
        company=company.strip(),
        source_file=filename,
        rows=preview_rows,
    )


@router.post("/ingest/image", response_model=IngestImageResponse)
async def ingest_image(
    company: str = Form(...),
    file: UploadFile = File(...),
    _current_user: str = Depends(get_current_user),
) -> IngestImageResponse:
    """
    @flow:upload_image

    Upload a single statement image and return extracted rows.

    Notes:
    - This endpoint currently returns extracted rows (preview) and does not insert into DB.
    - The OCR/vision pipeline is lazily imported to keep API startup fast on hosts like Render.
    """
    filename = file.filename or "uploaded"
    content_type = (file.content_type or "").lower()
    logger.info("[IMAGE INGEST] upload filename=%s content_type=%s", filename, content_type)

    ext = os.path.splitext(filename.lower())[1]
    allowed_ext = {".jpg", ".jpeg", ".png"}
    allowed_ct = {"image/jpeg", "image/png"}

    if ext not in allowed_ext and content_type not in allowed_ct:
        raise HTTPException(
            status_code=400,
            detail="Only image files (.jpg, .jpeg, .png) are supported for image ingest.",
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    # Persist to a temp file so OCR pipelines can work by path.
    import tempfile

    suffix = ext if ext in allowed_ext else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        tmp_path = tmp.name

    try:
        # Lazy import: avoids loading EasyOCR/torch/transformers at API startup.
        from app.services.image_financial_ingest import process_image_financials

        # @flow:image_to_rows
        result = process_image_financials(tmp_path)
        rows_raw = result.get("rows") or []
        rows = [
            ImageStructuredRow(
                year=int(r["year"]),
                metric=str(r["metric"]),
                value=int(r["value"]),
                raw=str(r.get("raw", "")),
                currency=(str(r.get("currency")) if r.get("currency") else None),
            )
            for r in rows_raw
            if r.get("year") is not None and r.get("value") is not None
        ]
        cs = result.get("confidence_summary") or {}
        return IngestImageResponse(
            file_type=content_type or ext.lstrip("."),
            company=company.strip(),
            source_file=filename,
            extracted_items=len(rows),
            rows=rows,
            source=result.get("source", "ocr_fallback"),
            confidence_summary=ImageConfidenceSummary(
                avg_confidence=float(cs.get("avg_confidence", 0.0)),
                high_confidence_rows=int(cs.get("high_confidence_rows", 0)),
            ),
            currency=(str(result.get("currency")) if result.get("currency") else None),
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            logger.warning("[IMAGE INGEST] Failed to delete temp file: %s", tmp_path)
