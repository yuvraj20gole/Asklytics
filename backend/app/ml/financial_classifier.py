"""
FinBERT-based financial line classifier (fine-tuned head).
Loads weights from backend/app/ml/model/ (run app.ml.train_classifier first).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "model"

_tokenizer = None
_model = None
_device: torch.device | None = None
_label_id_to_name: list[str] | None = None


def _expected_model_dir() -> Path:
    return MODEL_PATH


def _validate_model_path(path: Path) -> None:
    """Raise if fine-tuned artifacts are missing (clear operator message)."""
    if not path.is_dir():
        raise FileNotFoundError(
            "Run training script before using classifier. "
            f"Model directory missing: {path}"
        )
    if not (path / "config.json").is_file():
        raise FileNotFoundError(
            "Run training script before using classifier. "
            f"Expected config.json under {path}"
        )


def _load_label_order(path: Path, num_labels: int) -> list[str]:
    """Build label list consistent with training (label_map.json preferred)."""
    map_path = path / "label_map.json"
    if map_path.is_file():
        data = json.loads(map_path.read_text(encoding="utf-8"))
        id2label = data.get("id2label", {})
        by_id = {int(k): str(v) for k, v in id2label.items()}
        if len(by_id) == num_labels:
            return [by_id[i] for i in range(num_labels)]
        logger.warning(
            "label_map.json has %d entries but model has num_labels=%d; using config fallback",
            len(by_id),
            num_labels,
        )

    cfg = AutoConfig.from_pretrained(path)
    raw = getattr(cfg, "id2label", None) or {}
    if not raw:
        raise RuntimeError(
            "Run training script before using classifier. "
            f"No label_map.json or id2label in config at {path}"
        )
    by_id = {int(k): str(v) for k, v in raw.items()}
    return [by_id[i] for i in range(num_labels)]


def _ensure_loaded() -> tuple[AutoTokenizer, AutoModelForSequenceClassification, torch.device, list[str]]:
    global _tokenizer, _model, _device, _label_id_to_name
    if (
        _tokenizer is not None
        and _model is not None
        and _device is not None
        and _label_id_to_name is not None
    ):
        return _tokenizer, _model, _device, _label_id_to_name

    path = _expected_model_dir()
    _validate_model_path(path)

    _tokenizer = AutoTokenizer.from_pretrained(path)
    _model = AutoModelForSequenceClassification.from_pretrained(path)
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _model.to(_device)
    _model.eval()

    nlab = int(getattr(_model.config, "num_labels", 0) or 0)
    _label_id_to_name = _load_label_order(path, nlab)
    if len(_label_id_to_name) != nlab:
        raise RuntimeError(
            f"Label count mismatch: resolved {len(_label_id_to_name)} labels vs num_labels={nlab}"
        )

    logger.info("[ML] Loaded financial classifier from %s", path)
    logger.info("[ML] Using device %s", _device)
    logger.info("[ML] Label order: %s", _label_id_to_name)
    return _tokenizer, _model, _device, _label_id_to_name


def classify_texts(texts: list[str], batch_size: int = 16) -> list[tuple[str, float]]:
    """
    Batch inference. Returns one (label, confidence) per input string (same order).
    """
    if not texts:
        return []

    tokenizer, model, device, label_names = _ensure_loaded()
    out: list[tuple[str, float]] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        inputs = tokenizer(
            batch,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=128,
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = model(**inputs).logits
        probs = F.softmax(logits, dim=-1)

        for i, text in enumerate(batch):
            p = probs[i]
            label_id = int(torch.argmax(p).item())
            confidence = float(p[label_id].item())
            label = label_names[label_id]
            prob_list = [float(x) for x in p.tolist()]
            logger.debug(
                "[ML CLASSIFY] text=%r probs=%s argmax=%s(%.4f)",
                text,
                dict(zip(label_names, prob_list)),
                label,
                confidence,
            )
            out.append((label, confidence))

    return out


def classify_text(text: str) -> tuple[str, float]:
    """Single-row inference (delegates to batch)."""
    return classify_texts([text])[0]


def reset_cache_for_tests() -> None:
    global _tokenizer, _model, _device, _label_id_to_name
    _tokenizer = None
    _model = None
    _device = None
    _label_id_to_name = None


if __name__ == "__main__":
    import tempfile

    logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(message)s")

    empty = Path(tempfile.mkdtemp())
    try:
        _validate_model_path(empty)
    except FileNotFoundError as exc:
        assert "Run training script before using classifier" in str(exc)
    else:
        raise AssertionError("expected missing config error")

    pairs = classify_texts(
        ["Finance Cost", "Revenue from Operations", "Net Profit (PAT) 93000"]
    )
    print("batch:", pairs)
    assert pairs[0][0] == "expense"
    assert pairs[1][0] == "revenue"
    assert pairs[2][0] == "profit"
