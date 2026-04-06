import logging
import mimetypes
import os

import cv2
from PIL import Image

from app.ml.layout_model import merge_ocr_into_lines, ocr_confidence_summary
from app.services.image_data_validation import validate_and_deduplicate_rows
from app.services.image_preprocessing import preprocess_image
from app.services.ocr_service import extract_text_with_boxes
from app.services.table_reconstruction import parse_financial_rows

logger = logging.getLogger(__name__)

_MIN_LAYOUT_ROWS = 2


def process_image_financials(image_path: str) -> dict:
    """
    Image pipeline: preprocess → EasyOCR (with optional low-threshold retry)
    → LayoutLMv3 + row merge + FinBERT → validation.

    Returns:
        rows: structured dicts (year, metric, value, raw)
        source: "layoutlm" | "ocr_fallback"
        confidence_summary: { avg_confidence, high_confidence_rows }
    """
    empty = {
        "rows": [],
        "source": "ocr_fallback",
        "confidence_summary": {"avg_confidence": 0.0, "high_confidence_rows": 0},
        "currency": None,
    }

    if not image_path or not os.path.exists(image_path):
        logger.error("[IMAGE INGEST] Invalid image_path=%r (not found)", image_path)
        return empty

    guessed_mime, _ = mimetypes.guess_type(image_path)
    logger.info(
        "[IMAGE INGEST] process_image_financials called path=%s mime=%s",
        image_path,
        guessed_mime,
    )

    pre = preprocess_image(image_path)
    if pre is None:
        return empty

    if pre.ndim == 2:
        h, w = pre.shape
        rgb = cv2.cvtColor(pre, cv2.COLOR_GRAY2RGB)
    else:
        h, w = pre.shape[:2]
        rgb = pre

    pil_image = Image.fromarray(rgb)

    ocr_results = extract_text_with_boxes(pre, min_confidence=0.5)
    if len(ocr_results) < 2:
        logger.info(
            "[OCR RETRY TRIGGERED] items=%d retry with min_confidence=0.4",
            len(ocr_results),
        )
        ocr_results = extract_text_with_boxes(pre, min_confidence=0.4)

    if not ocr_results:
        logger.warning("[IMAGE INGEST] OCR returned no tokens")
        return empty

    layout_used = False
    structured: list[dict] = []

    try:
        from app.ml.layout_model import LAYOUTLM_IMPORT_OK, extract_with_layoutlm_branch

        if LAYOUTLM_IMPORT_OK:
            structured, layout_used = extract_with_layoutlm_branch(
                pil_image,
                ocr_results,
                w,
                h,
                parse_financial_rows,
                min_structured_rows=_MIN_LAYOUT_ROWS,
            )
        else:
            logger.info("[LAYOUTLM FALLBACK] LayoutLMv3 import not available")
    except Exception as exc:
        logger.warning(
            "[LAYOUTLM FALLBACK] layout branch error: %s",
            exc,
            exc_info=True,
        )

    if not layout_used:
        logger.info("[LAYOUTLM FALLBACK] using OCR line merge + existing FinBERT pipeline")
        line_strings = merge_ocr_into_lines(ocr_results, h)
        logger.debug("[ROW GROUPING] fallback merge lines=%s", line_strings)
        structured = parse_financial_rows(line_strings)

    structured = validate_and_deduplicate_rows(structured)
    conf_summary = ocr_confidence_summary(ocr_results, h)
    source = "layoutlm" if layout_used else "ocr_fallback"
    currencies = [r.get("currency") for r in structured if r.get("currency")]
    currency = max(set(currencies), key=currencies.count) if currencies else None

    logger.info(
        "[IMAGE INGEST] done rows=%d source=%s avg_ocr_conf=%.3f",
        len(structured),
        source,
        conf_summary.get("avg_confidence", 0.0),
    )

    return {
        "rows": structured,
        "source": source,
        "confidence_summary": conf_summary,
        "currency": currency,
    }
