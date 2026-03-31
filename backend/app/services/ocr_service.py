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

# Minimum confidence to keep a detection (ignore weaker boxes)
MIN_CONFIDENCE = 0.5


def extract_text_with_boxes(image):
    logger.info("[OCR START] Running EasyOCR")

    results = reader.readtext(image)

    extracted = []

    for (bbox, text, confidence) in results:
        if confidence < MIN_CONFIDENCE:
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

    logger.info("[OCR DONE] Extracted %d items (after confidence >= %.2f filter)", len(extracted), MIN_CONFIDENCE)

    if not extracted:
        raw_texts = [t for (_, t, _) in results]
        logger.warning(
            "[OCR] No items passed confidence filter; raw EasyOCR count was %d. Raw texts: %s",
            len(results),
            raw_texts,
        )

    return extracted
