import logging
import ssl

import certifi

logger = logging.getLogger(__name__)


def _configure_ssl_for_https_downloads() -> None:
    """EasyOCR downloads model weights on first use; macOS Python can lack system CA bundle."""
    try:
        ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
    except Exception as exc:  # pragma: no cover
        logger.warning("[OCR] Could not set SSL cert bundle from certifi: %s", exc)


_configure_ssl_for_https_downloads()

_reader = None


def _ensure_easyocr_bidi_compat() -> None:
    """
    EasyOCR imports `get_display` from the top-level `bidi` module.
    Some python-bidi versions only expose it at `bidi.algorithm.get_display`.
    Patch the module so EasyOCR can import it.
    """
    try:
        import bidi as bidi_pkg  # python-bidi package
        from bidi.algorithm import get_display

        if not hasattr(bidi_pkg, "get_display"):
            setattr(bidi_pkg, "get_display", get_display)
    except Exception as exc:  # pragma: no cover
        logger.warning("[OCR] bidi compatibility patch failed: %s", exc)


def _get_reader():
    global _reader
    if _reader is None:
        _ensure_easyocr_bidi_compat()
        import easyocr

        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader

# Default minimum confidence to keep a detection (ignore weaker boxes)
MIN_CONFIDENCE = 0.5


def extract_text_with_boxes(image, min_confidence: float | None = None):
    """
    Run EasyOCR. If min_confidence is None, uses MIN_CONFIDENCE (0.5).
    """
    floor = MIN_CONFIDENCE if min_confidence is None else float(min_confidence)
    logger.info("[OCR START] Running EasyOCR (min_confidence=%.2f)", floor)

    results = _get_reader().readtext(image)

    extracted = []

    for (bbox, text, confidence) in results:
        if confidence < floor:
            logger.info(
                "[OCR SKIP] Low confidence=%.4f text=%r bbox=%s",
                confidence,
                text,
                bbox,
            )
            continue

        extracted.append(
            {
                "text": text,
                "bbox": bbox,
                "confidence": float(confidence),
            }
        )

    logger.info("[OCR DONE] Extracted %d items (after confidence >= %.2f filter)", len(extracted), floor)

    if not extracted:
        raw_texts = [t for (_, t, _) in results]
        logger.warning(
            "[OCR] No items passed confidence filter; raw EasyOCR count was %d. Raw texts: %s",
            len(results),
            raw_texts,
        )

    return extracted
