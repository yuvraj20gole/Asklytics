import cv2
import logging

logger = logging.getLogger(__name__)


def preprocess_image(image_path: str):
    logger.info(f"[PREPROCESS START] path={image_path}")

    img = cv2.imread(image_path)

    if img is None:
        logger.error(f"[PREPROCESS ERROR] Failed to load image: {image_path}")
        return None

    logger.info(f"[PREPROCESS] original shape={img.shape}")

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive threshold (important for real-world documents)
    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2
    )

    logger.info(f"[PREPROCESS DONE] shape={thresh.shape}")

    return thresh

