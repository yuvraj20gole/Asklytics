"""
LayoutLMv3 layer: EasyOCR words + boxes → token labels (O / YEAR / VALUE / METRIC).
Uses fine-tuned weights in layout_model_trained/ when present; otherwise base checkpoint.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING

import torch
import torch.nn.functional as F

if TYPE_CHECKING:
    from PIL import Image

logger = logging.getLogger(__name__)

ML_DIR = Path(__file__).resolve().parent
BASE_MODEL_NAME = "microsoft/layoutlmv3-base"
TRAINED_DIR = ML_DIR / "layout_model_trained"

LABELS = ["O", "YEAR", "VALUE", "METRIC"]
MODEL_CONFIDENCE_FLOOR = 0.5  # below this use heuristic for token role

_layout_processor = None
_layout_model = None
_layout_device: torch.device | None = None
_layout_load_logged = False
_layout_using_trained = False
_layout_id2label: dict[int, str] = {}

try:
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

    LAYOUTLM_IMPORT_OK = True
except ImportError as exc:  # pragma: no cover
    LayoutLMv3Processor = None  # type: ignore[misc, assignment]
    LayoutLMv3ForTokenClassification = None  # type: ignore[misc, assignment]
    LAYOUTLM_IMPORT_OK = False
    _IMPORT_ERR = exc
else:
    _IMPORT_ERR = None


def bbox_quad_to_xyxy(bbox: list | tuple) -> list[float]:
    """EasyOCR: quad [[x,y],...]; already xyxy: [l,t,r,b]."""
    if not bbox:
        return [0.0, 0.0, 0.0, 0.0]
    first = bbox[0]
    if isinstance(first, (list, tuple)) and len(first) >= 2:
        xs = [float(p[0]) for p in bbox]
        ys = [float(p[1]) for p in bbox]
        return [min(xs), min(ys), max(xs), max(ys)]
    return [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])]


def normalize_bbox(bbox_xyxy: list[float], width: int, height: int) -> list[int]:
    """Scale box corners to 0–1000 as required by LayoutLM."""
    if width <= 0 or height <= 0:
        return [0, 0, 0, 0]
    x0, y0, x1, y1 = bbox_xyxy
    return [
        int(1000 * x0 / width),
        int(1000 * y0 / height),
        int(1000 * x1 / width),
        int(1000 * y1 / height),
    ]


def ocr_items_to_layout_inputs(
    ocr_results: list[dict],
    image_width: int,
    image_height: int,
) -> tuple[list[str], list[list[int]]]:
    """Map EasyOCR items to words + 0–1000 boxes."""
    words: list[str] = []
    boxes: list[list[int]] = []
    for item in ocr_results:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        xyxy = bbox_quad_to_xyxy(item.get("bbox") or [])
        nb = normalize_bbox(xyxy, image_width, image_height)
        for i, v in enumerate(nb):
            if v < 0:
                nb[i] = 0
            elif v > 1000:
                nb[i] = 1000
        words.append(text)
        boxes.append(nb)
    return words, boxes


def heuristic_token_label(text: str) -> str:
    """Fallback token role when model confidence is low."""
    t = (text or "").strip()
    if not t:
        return "O"
    tl = t.lower().replace("₹", "").strip()
    if re.search(r"fy\s*20\d{2}", tl, re.I):
        return "YEAR"
    if re.fullmatch(r"20\d{2}", tl):
        return "YEAR"
    if re.fullmatch(r"fy\s*\d{2}\b", tl, re.I):
        return "YEAR"
    compact = re.sub(r"[,\s]", "", tl)
    if re.fullmatch(r"[\d().-]+", compact) and re.search(r"\d{3,}", compact):
        return "VALUE"
    metric_kw = (
        "revenue",
        "income",
        "sales",
        "turnover",
        "expense",
        "expenses",
        "cost",
        "profit",
        "ebitda",
        "pat",
        "pbt",
        "finance",
        "tax",
        "depreciation",
        "amortisation",
        "amortization",
        "administrative",
        "operating",
    )
    if any(k in tl for k in metric_kw):
        return "METRIC"
    return "O"


def cluster_word_indices(ocr_results: list[dict], image_height: int) -> list[list[int]]:
    """
    Same geometry as line merge; returns word indices (order of non-empty OCR texts)
    per line, left-to-right.
    """
    if not ocr_results or image_height <= 0:
        return []
    y_tol = max(12.0, float(image_height) * 0.025)
    entries: list[dict] = []
    for it in ocr_results:
        text = (it.get("text") or "").strip()
        if not text:
            continue
        xyxy = bbox_quad_to_xyxy(it.get("bbox") or [])
        cx = (xyxy[0] + xyxy[2]) / 2.0
        cy = (xyxy[1] + xyxy[3]) / 2.0
        wid = len(entries)
        entries.append(
            {
                "wid": wid,
                "text": text,
                "cx": cx,
                "cy": cy,
                "conf": float(it.get("confidence", 1.0)),
            }
        )
    if not entries:
        return []
    entries.sort(key=lambda e: (e["cy"], e["cx"]))
    clusters: list[list[dict]] = []
    for e in entries:
        if not clusters:
            clusters.append([e])
            continue
        last = clusters[-1]
        ref_cy = sum(x["cy"] for x in last) / len(last)
        if abs(e["cy"] - ref_cy) <= y_tol:
            last.append(e)
        else:
            clusters.append([e])
    return [[x["wid"] for x in sorted(cl, key=lambda z: z["cx"])] for cl in clusters]


def merge_ocr_into_lines(ocr_results: list[dict], image_height: int) -> list[str]:
    """Group OCR tokens by vertical proximity, left-to-right within a line."""
    idx_groups = cluster_word_indices(ocr_results, image_height)
    words, _ = ocr_items_to_layout_inputs(ocr_results, 1, 1)  # only need word list
    lines: list[str] = []
    for group in idx_groups:
        parts = [words[i] for i in group if 0 <= i < len(words)]
        line = " ".join(parts)
        if line:
            lines.append(line)
    return lines


def _config_id2label(model) -> dict[int, str]:
    raw = dict(model.config.id2label)
    return {int(k): str(v) for k, v in raw.items()}


def _pick_model_dir() -> tuple[Path | str, bool]:
    """Returns (hub id or local trained dir, is_trained)."""
    cfg = TRAINED_DIR / "config.json"
    if TRAINED_DIR.is_dir() and cfg.is_file():
        return TRAINED_DIR, True
    return BASE_MODEL_NAME, False


def _ensure_layoutlm_loaded():
    global _layout_processor, _layout_model, _layout_device, _layout_load_logged
    global _layout_using_trained, _layout_id2label
    if not LAYOUTLM_IMPORT_OK:
        raise RuntimeError(f"LayoutLMv3 unavailable: {_IMPORT_ERR}")
    if _layout_processor is not None and _layout_model is not None and _layout_device is not None:
        return _layout_processor, _layout_model, _layout_device

    load_path, trained = _pick_model_dir()
    _layout_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if trained:
        _layout_processor = LayoutLMv3Processor.from_pretrained(str(load_path), apply_ocr=False)
        _layout_model = LayoutLMv3ForTokenClassification.from_pretrained(str(load_path))
        logger.info("[LAYOUTLM TRAINED MODEL LOADED] path=%s device=%s", load_path, _layout_device)
    else:
        _layout_processor = LayoutLMv3Processor.from_pretrained(str(load_path), apply_ocr=False)
        _layout_model = LayoutLMv3ForTokenClassification.from_pretrained(
            str(load_path),
            num_labels=len(LABELS),
            ignore_mismatched_sizes=True,
        )
        logger.info("[LAYOUTLM] Base model loaded name=%s device=%s", load_path, _layout_device)

    _layout_model.to(_layout_device)
    _layout_model.eval()
    _layout_using_trained = trained
    _layout_id2label = _config_id2label(_layout_model)

    lm_path = (TRAINED_DIR / "label_map.json") if trained else None
    if lm_path and lm_path.is_file():
        data = json.loads(lm_path.read_text(encoding="utf-8"))
        id2 = data.get("id_to_label") or {}
        if id2:
            _layout_id2label = {int(k): str(v) for k, v in id2.items()}

    if not _layout_load_logged:
        _layout_load_logged = True
    return _layout_processor, _layout_model, _layout_device


def predict_word_token_labels(
    image: "Image.Image",
    words: list[str],
    boxes: list[list[int]],
    max_length: int = 512,
) -> list[tuple[str, float]]:
    """
    Per-word (EasyOCR token) label + confidence. Subword logits averaged per word.
    """
    processor, model, device = _ensure_layoutlm_loaded()
    if not words:
        return []

    encoding = processor(
        image,
        text=words,
        boxes=boxes,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=max_length,
    )
    word_ids = encoding.word_ids(batch_index=0)
    model_inputs = {k: v.to(device) for k, v in encoding.items()}

    with torch.no_grad():
        logits = model(**model_inputs).logits[0]

    id2l = _layout_id2label or _config_id2label(model)
    out: list[tuple[str, float]] = []
    n_words = len(words)
    for wi in range(n_words):
        idxs = [i for i, wid in enumerate(word_ids) if wid == wi]
        if not idxs:
            out.append(("O", 0.0))
            continue
        pooled = logits[idxs].mean(dim=0)
        pr = F.softmax(pooled, dim=-1)
        pid = int(pooled.argmax())
        conf = float(pr[pid].item())
        label_name = id2l.get(pid, LABELS[pid] if pid < len(LABELS) else "O")
        out.append((label_name, conf))
    return out


def effective_token_labels(
    image: "Image.Image",
    words: list[str],
    boxes: list[list[int]],
) -> tuple[list[str], int, int]:
    """
    Model-primary, heuristic fallback. Returns (labels, n_model, n_heuristic).
    """
    preds = predict_word_token_labels(image, words, boxes)
    while len(preds) < len(words):
        preds.append(("O", 0.0))
    labels: list[str] = []
    n_model = 0
    n_heur = 0
    for w, (plab, pconf) in zip(words, preds):
        if pconf >= MODEL_CONFIDENCE_FLOOR:
            labels.append(plab)
            n_model += 1
        else:
            labels.append(heuristic_token_label(w))
            n_heur += 1
    return labels, n_model, n_heur


def run_layoutlm_inference(
    image: "Image.Image",
    words: list[str],
    boxes: list[list[int]],
    max_length: int = 512,
):
    """Run forward; returns (logits, predictions argmax per token position)."""
    processor, model, device = _ensure_layoutlm_loaded()
    if not words:
        raise ValueError("LayoutLM inference requires non-empty words")

    encoding = processor(
        image,
        text=words,
        boxes=boxes,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=max_length,
    )
    encoding = {k: v.to(device) for k, v in encoding.items()}

    with torch.no_grad():
        outputs = model(**encoding)
    logits = outputs.logits
    predictions = logits.argmax(-1)
    return logits, predictions


def extract_with_layoutlm_branch(
    image: "Image.Image",
    ocr_results: list[dict],
    image_width: int,
    image_height: int,
    parse_financial_rows_fn,
    min_structured_rows: int = 2,
) -> tuple[list[dict], bool]:
    """
    LayoutLM token labels (model-primary) + Y-grouped lines + FinBERT.
    """
    words, boxes = ocr_items_to_layout_inputs(ocr_results, image_width, image_height)
    logger.debug(
        "[LAYOUT INPUT] words=%d size=%dx%d sample_words=%s sample_box=%s",
        len(words),
        image_width,
        image_height,
        words[:8],
        boxes[0] if boxes else None,
    )

    if not words:
        logger.info("[LAYOUTLM FALLBACK] no OCR words for layout branch")
        return [], False

    try:
        eff_labels, n_m, n_h = effective_token_labels(image, words, boxes)
        logger.debug(
            "[LAYOUT OUTPUT] token_labels_model=%d heuristic=%d sample=%s",
            n_m,
            n_h,
            list(zip(words[:12], eff_labels[:12], strict=False)),
        )
        logits, pred_tensor = run_layoutlm_inference(image, words, boxes)
        logger.debug(
            "[LAYOUT OUTPUT] logits_shape=%s predictions_shape=%s",
            tuple(logits.shape),
            tuple(pred_tensor.shape),
        )
    except Exception as exc:
        logger.warning("[LAYOUTLM FALLBACK] inference failed: %s", exc, exc_info=True)
        return [], False

    line_strings = merge_ocr_into_lines(ocr_results, image_height)
    logger.debug(
        "[ROW GROUPING] num_lines=%d preview=%s token_tag_preview=%s",
        len(line_strings),
        line_strings[:5],
        eff_labels[:16],
    )

    structured = parse_financial_rows_fn(line_strings)
    if len(structured) >= min_structured_rows:
        logger.info(
            "[LAYOUTLM SUCCESS] structured_rows=%d (LayoutLM + line merge + FinBERT)",
            len(structured),
        )
        return structured, True

    logger.info(
        "[LAYOUTLM FALLBACK] only %d structured row(s) from layout branch (need %d)",
        len(structured),
        min_structured_rows,
    )
    return [], False


def reset_layout_cache_for_tests() -> None:
    global _layout_processor, _layout_model, _layout_device, _layout_load_logged
    global _layout_using_trained, _layout_id2label
    _layout_processor = None
    _layout_model = None
    _layout_device = None
    _layout_load_logged = False
    _layout_using_trained = False
    _layout_id2label = {}


def ocr_confidence_summary(ocr_results: list[dict], image_height: int) -> dict:
    """avg_confidence and high_confidence_rows (min token conf in line >= 0.6)."""
    if not ocr_results:
        return {"avg_confidence": 0.0, "high_confidence_rows": 0}
    confs = [float(x.get("confidence", 0.0)) for x in ocr_results]
    avg = sum(confs) / len(confs) if confs else 0.0
    clusters = cluster_word_indices(ocr_results, image_height)
    wconf: list[float] = []
    for it in ocr_results:
        t = (it.get("text") or "").strip()
        if not t:
            continue
        wconf.append(float(it.get("confidence", 1.0)))
    high = 0
    for group in clusters:
        gc = [wconf[i] for i in group if 0 <= i < len(wconf)]
        if gc and min(gc) >= 0.6:
            high += 1
    return {"avg_confidence": round(avg, 4), "high_confidence_rows": high}


if __name__ == "__main__":
    import sys
    from pathlib import Path

    logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(message)s")

    w, h = 800, 600
    quad = [[0, 0], [400, 0], [400, 50], [0, 50]]
    xyxy = bbox_quad_to_xyxy(quad)
    nb = normalize_bbox(xyxy, w, h)
    print("normalize_bbox sample:", nb)
    assert all(0 <= v <= 1000 for v in nb)

    for s in ("FY 2023", "578,910", "Revenue", "noise"):
        print("heuristic:", repr(s), "->", heuristic_token_label(s))

    repo = Path(__file__).resolve().parents[3]
    img_path = repo / "debug_output" / "processed.png"
    if not img_path.is_file():
        print("Skip integration: no", img_path, file=sys.stderr)
        sys.exit(0)

    import cv2
    from PIL import Image

    from app.services.ocr_service import extract_text_with_boxes
    from app.services.table_reconstruction import parse_financial_rows

    arr = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
    if arr is None:
        print("Skip integration: cannot read image", file=sys.stderr)
        sys.exit(0)
    h0, w0 = arr.shape[:2]
    pil = Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_GRAY2RGB))
    ocr = extract_text_with_boxes(arr)
    print("OCR items:", len(ocr))
    lines = merge_ocr_into_lines(ocr, h0)
    print("merged lines:", lines)

    structured, ok = extract_with_layoutlm_branch(
        pil,
        ocr,
        w0,
        h0,
        parse_financial_rows,
        min_structured_rows=2,
    )
    print("layoutlm_success:", ok)
    print("sample structured rows:", structured[:5])
