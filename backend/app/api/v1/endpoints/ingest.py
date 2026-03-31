import re
import logging
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models import FinancialFact, FinancialTable
from app.db.session import get_db
from app.schemas.ingest import IngestImageResponse, IngestPDFResponse
from app.services.pdf_financial_ingest import PDFFinancialIngestService
from app.services.image_financial_ingest import process_image_financials

router = APIRouter()
ingest_service = PDFFinancialIngestService()
logger = logging.getLogger(__name__)

def _clean_period_facts(filename: str, parsed_facts):
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
        # Tighten around report year when available.
        if report_year and not (report_year - 3 <= p <= report_year + 1):
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
    filename = file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    raw_tables, detected_currency, full_text = ingest_service.extract_all_tables(payload)
    parsed_facts = ingest_service.process_tables_to_facts(raw_tables, detected_currency, full_text=full_text)
    parsed_facts = _clean_period_facts(filename, parsed_facts)
    if not raw_tables:
        raise HTTPException(
            status_code=422,
            detail="No tables detected in PDF.",
        )
    if not parsed_facts:
        raise HTTPException(status_code=422, detail="No structured financial facts extracted from tables.")

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

    return IngestPDFResponse(
        inserted_rows=len(models),
        tables_extracted=len(table_models),
        detected_currency=detected_currency,
        company=company.strip(),
        source_file=filename,
    )


@router.post("/ingest/image", response_model=IngestImageResponse)
async def ingest_image(
    company: str = Form(...),
    file: UploadFile = File(...),
    _current_user: str = Depends(get_current_user),
) -> IngestImageResponse:
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

    # Persist to a temp file so later TODOs (OpenCV/EasyOCR) can work by path.
    import tempfile

    suffix = ext if ext in allowed_ext else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        tmp_path = tmp.name

    try:
        structured = process_image_financials(tmp_path)
        return IngestImageResponse(
            file_type=content_type or ext.lstrip("."),
            company=company.strip(),
            source_file=filename,
            extracted_items=len(structured),
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            logger.warning("[IMAGE INGEST] Failed to delete temp file: %s", tmp_path)
