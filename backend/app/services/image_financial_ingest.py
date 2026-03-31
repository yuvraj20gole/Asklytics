import logging
import mimetypes
import os

logger = logging.getLogger(__name__)


def process_image_financials(image_path: str) -> list[dict]:
    """
    TODO 1: Only validates routing + basic file detection.
    Full pipeline (preprocess -> OCR -> table reconstruction -> classifier -> value extraction)
    will be implemented in subsequent TODOs.
    """
    if not image_path or not os.path.exists(image_path):
        logger.error("[IMAGE INGEST] Invalid image_path=%r (not found)", image_path)
        return []

    guessed_mime, _ = mimetypes.guess_type(image_path)
    logger.info(
        "[IMAGE INGEST] process_image_financials called path=%s mime=%s",
        image_path,
        guessed_mime,
    )
    return []

