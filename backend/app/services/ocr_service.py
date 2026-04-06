import logging
import ssl

import certifi
import easyocr

logger = logging.getLogger(__name__)


def _configure_ssl_for_https_downloads() -> None:
    """EasyOCR downloads model weights on first use; macOS Python can lack system CA bundle."""
    try:
        ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
    except Exception as exc:  # pragma: no cover
        logger.warning("[OCR] Could not set SSL cert bundle from certifi: %s", exc)


_configure_ssl_for_https_downloads()

# Initialize once (important for performance)
reader = easyocr.Reader(["en"], gpu=False)

# Default minimum confidence to keep a detection (ignore weaker boxes)
MIN_CONFIDENCE = 0.5


def extract_text_with_boxes(image, min_confidence: float | None = None):
    """
    Run EasyOCR. If min_confidence is None, uses MIN_CONFIDENCE (0.5).
    """
    floor = MIN_CONFIDENCE if min_confidence is None else float(min_confidence)
    logger.info("[OCR START] Running EasyOCR (min_confidence=%.2f)", floor)

    results = reader.readtext(image)

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
