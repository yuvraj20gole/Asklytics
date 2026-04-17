"""
Image ingest pipeline: statement image → OCR/layout parsing → structured financial rows.

SEARCH TAGS:
- @svc:image_ingest              → `process_image_financials`
- @step:image_preprocess         → `preprocess_image`
- @step:image_ocr                → `extract_text_with_boxes` (EasyOCR wrapper)
- @step:image_layoutlm_branch    → `extract_with_layoutlm_branch`
- @step:image_row_reconstruction → `parse_financial_rows` / `table_reconstruction.py`
- @step:image_validate_rows      → `validate_and_deduplicate_rows`
- @ml:layoutlm                   → `app/ml/layout_model.py`
- @ml:finbert_classifier         → classification used inside `parse_financial_rows`

This file is called by:
`backend/app/api/v1/endpoints/ingest.py` → `ingest_image`
and by the PDF fallback path in `pdf_financial_ingest.py`.
"""

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


def _layout_mode() -> str:
    """
    Shadow/gated rollout switch for LayoutLM.

    Modes (case-insensitive):
    - off:    never use LayoutLM (preserve legacy output)
    - shadow: run LayoutLM + baseline, but ALWAYS return baseline (logs comparison)
    - on:     return the better candidate using a quality gate (never return worse than baseline)
    """
    return (os.getenv("LAYOUT_PIPELINE_MODE") or "off").strip().lower()


def _row_quality_score(rows: list[dict]) -> float:
    """
    Heuristic score to decide if one extraction is "better" without changing output format.

    Higher is better. Penalizes duplicates and low parse coverage.
    This is intentionally conservative; baseline should win ties.
    """
    if not rows:
        return 0.0

    valid_year = 0
    valid_value = 0
    nonempty_metric = 0
    pairs: list[tuple[str, str]] = []
    for r in rows:
        y = r.get("year")
        m = (r.get("metric") or "").strip().lower()
        v = r.get("value")
        if isinstance(y, int) and 1990 <= y <= 2035:
            valid_year += 1
        if isinstance(v, (int, float)) and v != 0:
            valid_value += 1
        if m:
            nonempty_metric += 1
        if isinstance(y, int) and m:
            pairs.append((str(y), m))

    uniq_pairs = len(set(pairs)) if pairs else 0
    dup_penalty = max(0, len(pairs) - uniq_pairs)
    parse_bonus = (valid_year + valid_value + nonempty_metric) / max(1, 3 * len(rows))

    # Base points: row count matters, but not enough to swamp validity.
    return (2.0 * len(rows)) + (20.0 * parse_bonus) + (1.0 * uniq_pairs) - (2.0 * dup_penalty)


def _pick_best_rows(
    baseline_rows: list[dict],
    layout_rows: list[dict],
) -> tuple[list[dict], str, dict]:
    """
    Decide between baseline and layout candidate. Returns chosen rows, chosen source label,
    and a debug dict (safe to log/return).
    """
    b = _row_quality_score(baseline_rows)
    l = _row_quality_score(layout_rows)
    debug = {
        "baseline_rows": len(baseline_rows),
        "layout_rows": len(layout_rows),
        "baseline_score": round(b, 3),
        "layout_score": round(l, 3),
    }

    # Never pick layout if it yields nothing.
    if not layout_rows:
        return baseline_rows, "ocr_fallback", debug

    # Strictly require layout to beat baseline by a margin OR baseline empty.
    if not baseline_rows:
        return layout_rows, "layoutlm", debug | {"winner": "layoutlm"}
    if l >= b + 3.0:
        return layout_rows, "layoutlm", debug | {"winner": "layoutlm"}
    return baseline_rows, "ocr_fallback", debug | {"winner": "baseline"}


def process_image_financials(image_path: str) -> dict:
    """
    @svc:image_ingest

    Image pipeline:
    - @step:image_preprocess: preprocess the bitmap (denoise/threshold/crop)
    - @step:image_ocr: run OCR to get tokens + bounding boxes (+ retry at lower threshold)
    - @step:image_layoutlm_branch: optionally run LayoutLMv3-based extraction if available
    - @step:image_row_reconstruction: merge tokens into line-items and parse (year, metric, value)
    - @step:image_validate_rows: deduplicate and sanity-check extracted rows

    LayoutLM is optional and designed to improve table-like statements; if unavailable
    the fallback uses OCR line merging + existing parsing/classification.

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

    # @step:image_preprocess
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

    # @step:image_ocr
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

    mode = _layout_mode()
    layout_used = False
    layout_rows: list[dict] = []

    try:
        # @step:image_layoutlm_branch
        from app.ml.layout_model import LAYOUTLM_IMPORT_OK, extract_with_layoutlm_branch

        if mode != "off" and LAYOUTLM_IMPORT_OK:
            layout_rows, layout_used = extract_with_layoutlm_branch(
                pil_image,
                ocr_results,
                w,
                h,
                parse_financial_rows,
                min_structured_rows=_MIN_LAYOUT_ROWS,
            )
        elif mode != "off":
            logger.info("[LAYOUTLM] disabled or unavailable mode=%s import_ok=%s", mode, LAYOUTLM_IMPORT_OK)
    except Exception as exc:
        logger.warning(
            "[LAYOUTLM FALLBACK] layout branch error: %s",
            exc,
            exc_info=True,
        )

    # @step:image_row_reconstruction
    # Baseline pipeline is always computed so LayoutLM can never degrade output.
    line_strings = merge_ocr_into_lines(ocr_results, h)
    logger.debug("[ROW GROUPING] baseline merge lines=%s", line_strings)
    baseline_rows = parse_financial_rows(line_strings)

    # @step:image_validate_rows
    baseline_rows = validate_and_deduplicate_rows(baseline_rows)
    layout_rows = validate_and_deduplicate_rows(layout_rows) if layout_rows else []
    conf_summary = ocr_confidence_summary(ocr_results, h)
    chosen_rows, chosen_source, debug = _pick_best_rows(baseline_rows, layout_rows)

    if mode == "shadow":
        # Always return baseline, but log whether LayoutLM would have won.
        logger.info(
            "[LAYOUTLM SHADOW] %s",
            {**debug, "returned": "baseline"},
        )
        chosen_rows = baseline_rows
        chosen_source = "ocr_fallback"
    elif mode == "on":
        logger.info("[LAYOUTLM GATED] %s", debug)
    else:
        # mode == off: preserve old default (baseline only)
        pass

    currencies = [r.get("currency") for r in chosen_rows if r.get("currency")]
    currency = max(set(currencies), key=currencies.count) if currencies else None

    logger.info(
        "[IMAGE INGEST] done rows=%d source=%s avg_ocr_conf=%.3f",
        len(chosen_rows),
        chosen_source,
        conf_summary.get("avg_confidence", 0.0),
    )

    return {
        "rows": chosen_rows,
        "source": chosen_source if chosen_source in ("layoutlm", "ocr_fallback") else "ocr_fallback",
        "confidence_summary": conf_summary,
        "currency": currency,
        # Debug is safe to ignore by API clients; useful for ops/log inspection.
        "layout_debug": debug,
        "layout_mode": mode,
    }
