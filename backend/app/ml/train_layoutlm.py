"""
Fine-tune LayoutLMv3 for financial token tagging (O / YEAR / VALUE / METRIC).
Run: PYTHONPATH=backend python -m app.ml.train_layoutlm
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from transformers import (
    EarlyStoppingCallback,
    LayoutLMv3ForTokenClassification,
    LayoutLMv3Processor,
    Trainer,
    TrainingArguments,
)

logger = logging.getLogger(__name__)

ML_DIR = Path(__file__).resolve().parent
DATA_JSON = ML_DIR / "data" / "layoutlm_dataset.json"
OUTPUT_DIR = ML_DIR / "layout_model_trained"
BASE_MODEL = "microsoft/layoutlmv3-base"

LABELS = ["O", "YEAR", "VALUE", "METRIC"]
LABEL_TO_ID = {l: i for i, l in enumerate(LABELS)}
ID_TO_LABEL = {i: l for i, l in enumerate(LABELS)}


class LayoutFinDataset(torch.utils.data.Dataset):
    def __init__(self, items: list[dict], processor: LayoutLMv3Processor):
        self.items = items
        self.processor = processor

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int) -> dict:
        s = self.items[idx]
        image = Image.new("RGB", (1000, 1000), color=(255, 255, 255))
        word_labels = [LABEL_TO_ID[x] for x in s["labels"]]
        encoded = self.processor(
            image,
            text=s["words"],
            boxes=s["bboxes"],
            word_labels=word_labels,
            padding="max_length",
            truncation=True,
            max_length=256,
            return_tensors="pt",
        )
        return {k: v.squeeze(0) for k, v in encoded.items()}


def compute_metrics_factory(label_list: list[str]):
    def compute_metrics(eval_pred):
        predictions, labels = eval_pred
        pred_ids = np.argmax(predictions, axis=-1)
        true_ids = labels
        mask = true_ids != -100
        p = pred_ids[mask]
        t = true_ids[mask]
        if len(t) == 0:
            return {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}
        acc = (p == t).mean()
        # macro P/R/F1
        precisions, recalls, f1s = [], [], []
        for i in range(len(label_list)):
            tp = np.sum((p == i) & (t == i))
            fp = np.sum((p == i) & (t != i))
            fn = np.sum((p != i) & (t == i))
            pr = tp / (tp + fp) if (tp + fp) else 0.0
            rc = tp / (tp + fn) if (tp + fn) else 0.0
            f1 = 2 * pr * rc / (pr + rc) if (pr + rc) else 0.0
            precisions.append(pr)
            recalls.append(rc)
            f1s.append(f1)
        return {
            "accuracy": float(acc),
            "precision": float(np.mean(precisions)),
            "recall": float(np.mean(recalls)),
            "f1": float(np.mean(f1s)),
        }

    return compute_metrics


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not DATA_JSON.is_file():
        raise FileNotFoundError(f"Dataset not found: {DATA_JSON}")

    raw = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    for i, row in enumerate(raw):
        if len(row["words"]) != len(row["labels"]) or len(row["words"]) != len(row["bboxes"]):
            raise ValueError(f"Sample {i}: mismatched lengths")
        for lab in row["labels"]:
            if lab not in LABEL_TO_ID:
                raise ValueError(f"Invalid label {lab!r} in sample {i}")

    train_items, val_items = train_test_split(raw, test_size=0.15, random_state=42)

    processor = LayoutLMv3Processor.from_pretrained(BASE_MODEL, apply_ocr=False)
    model = LayoutLMv3ForTokenClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(LABELS),
        id2label=ID_TO_LABEL,
        label2id=LABEL_TO_ID,
        ignore_mismatched_sizes=True,
    )

    train_ds = LayoutFinDataset(train_items, processor)
    val_ds = LayoutFinDataset(val_items, processor)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_train_epochs=8,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        learning_rate=5e-5,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=10,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        save_total_limit=2,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics_factory(LABELS),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    logger.info("Training LayoutLMv3 on %d samples (%d train / %d val)", len(raw), len(train_items), len(val_items))
    train_out = trainer.train()
    logger.info("Training complete: %s", train_out)

    eval_metrics = trainer.evaluate()
    print("\n=== Validation metrics ===")
    for k, v in sorted(eval_metrics.items()):
        if not k.startswith("eval_"):
            continue
        print(f"  {k}: {v}")

    # Token-level evaluation report (masked -100 labels removed)
    pred_out = trainer.predict(val_ds)
    pred_ids = np.argmax(pred_out.predictions, axis=-1)
    true_ids = pred_out.label_ids
    mask = true_ids != -100
    y_true = true_ids[mask].astype(int)
    y_pred = pred_ids[mask].astype(int)

    if y_true.size:
        acc = float(accuracy_score(y_true, y_pred))
        p, r, f1, _ = precision_recall_fscore_support(
            y_true,
            y_pred,
            average="macro",
            labels=list(range(len(LABELS))),
            zero_division=0,
        )
        p_w, r_w, f1_w, _ = precision_recall_fscore_support(
            y_true,
            y_pred,
            average="weighted",
            labels=list(range(len(LABELS))),
            zero_division=0,
        )

        print("\n=== Token classification report (validation) ===")
        print(
            classification_report(
                y_true,
                y_pred,
                labels=list(range(len(LABELS))),
                target_names=LABELS,
                digits=4,
                zero_division=0,
            )
        )

        print("Confusion matrix (rows=true, cols=pred):")
        print(confusion_matrix(y_true, y_pred, labels=list(range(len(LABELS)))))

        metrics_payload = {
            "accuracy": acc,
            "precision": float(p),
            "recall": float(r),
            "f1": float(f1),
            "precision_weighted": float(p_w),
            "recall_weighted": float(r_w),
            "f1_weighted": float(f1_w),
        }
    else:
        metrics_payload = {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}

    model.save_pretrained(OUTPUT_DIR)
    processor.save_pretrained(OUTPUT_DIR)

    map_path = OUTPUT_DIR / "label_map.json"
    map_path.write_text(
        json.dumps(
            {
                "label_to_id": LABEL_TO_ID,
                "id_to_label": {str(i): l for i, l in enumerate(LABELS)},
                "labels": LABELS,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (OUTPUT_DIR / "metrics.json").write_text(
        json.dumps(metrics_payload, indent=2),
        encoding="utf-8",
    )
    print("Saved model, processor, label_map.json to", OUTPUT_DIR)


if __name__ == "__main__":
    main()
