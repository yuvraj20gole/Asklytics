"""
Fine-tune LayoutLMv3 for financial token tagging (O / YEAR / VALUE / METRIC).

Run from repo root (downloads base weights on first run):

    cd backend && PYTHONPATH=. python -m app.ml.train_layoutlm

Quick CPU smoke (1 epoch, no early-stopping requirement):

    cd backend && PYTHONPATH=. python -m app.ml.train_layoutlm --epochs 1 --no-early-stopping

SEARCH TAGS:
- @ml:layoutlm_train       → `main` training entrypoint
- @ml:layoutlm_dataset     → `DATA_JSON` + JSON schema (words, bboxes, labels)
- @ml:layoutlm_metrics     → `training_reports/layoutlm/` + `layoutlm_latest.json` (FinBERT-style)
- @ml:layoutlm_validation  → sklearn token report + confusion matrix
- @ml:layoutlm_outputs     → `OUTPUT_DIR` (weights; gitignored) vs `REPORTS_DIR` (reports; kept)
"""

from __future__ import annotations

import argparse
import json
import logging
import random
from datetime import datetime, timezone
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
REPORTS_DIR = ML_DIR / "training_reports"
BASE_MODEL = "microsoft/layoutlmv3-base"

LABELS = ["O", "YEAR", "VALUE", "METRIC"]
LABEL_TO_ID = {l: i for i, l in enumerate(LABELS)}
ID_TO_LABEL = {i: l for i, l in enumerate(LABELS)}


def _json_sanitize(obj: object) -> object:
    if isinstance(obj, dict):
        return {str(k): _json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_sanitize(v) for v in obj]
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, float | int | str | bool) or obj is None:
        return obj
    return str(obj)


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


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tune LayoutLMv3 token tagger for financial OCR tokens.")
    p.add_argument(
        "--dataset",
        type=Path,
        default=DATA_JSON,
        help=f"JSON dataset path (default: {DATA_JSON})",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help=f"Directory to save final model + processor (default: {OUTPUT_DIR})",
    )
    p.add_argument(
        "--reports-dir",
        type=Path,
        default=REPORTS_DIR,
        help=f"Directory for latest metrics snapshot (default: {REPORTS_DIR})",
    )
    p.add_argument("--base-model", type=str, default=BASE_MODEL, help="HF model id or local path")
    p.add_argument("--epochs", type=int, default=8, help="Training epochs (default: 8)")
    p.add_argument("--train-batch", type=int, default=4, help="per_device_train_batch_size")
    p.add_argument("--eval-batch", type=int, default=4, help="per_device_eval_batch_size")
    p.add_argument("--lr", type=float, default=5e-5, help="Learning rate")
    p.add_argument("--seed", type=int, default=42, help="Random seed for train/val split")
    p.add_argument(
        "--max-samples",
        type=int,
        default=0,
        help="If >0, randomly subsample the dataset to N items before split (debug/smoke)",
    )
    p.add_argument(
        "--no-early-stopping",
        action="store_true",
        help="Disable early stopping (useful for 1-epoch smoke runs)",
    )
    return p.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = _parse_args()
    data_path: Path = args.dataset
    out_dir: Path = args.output_dir
    reports_dir: Path = args.reports_dir

    if not data_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {data_path}")

    raw = json.loads(data_path.read_text(encoding="utf-8"))
    for i, row in enumerate(raw):
        if len(row["words"]) != len(row["labels"]) or len(row["words"]) != len(row["bboxes"]):
            raise ValueError(f"Sample {i}: mismatched lengths")
        for lab in row["labels"]:
            if lab not in LABEL_TO_ID:
                raise ValueError(f"Invalid label {lab!r} in sample {i}")

    if args.max_samples and args.max_samples > 0:
        if args.max_samples >= len(raw):
            logger.info("max_samples=%d >= dataset size %d; using full set", args.max_samples, len(raw))
        else:
            rng = random.Random(args.seed)
            raw = rng.sample(raw, k=args.max_samples)
            logger.info("Subsampled dataset to %d examples (--max-samples)", len(raw))

    train_items, val_items = train_test_split(raw, test_size=0.15, random_state=args.seed)

    processor = LayoutLMv3Processor.from_pretrained(args.base_model, apply_ocr=False)
    model = LayoutLMv3ForTokenClassification.from_pretrained(
        args.base_model,
        num_labels=len(LABELS),
        id2label=ID_TO_LABEL,
        label2id=LABEL_TO_ID,
        ignore_mismatched_sizes=True,
    )

    train_ds = LayoutFinDataset(train_items, processor)
    val_ds = LayoutFinDataset(val_items, processor)

    out_dir.mkdir(parents=True, exist_ok=True)

    use_early_stop = not args.no_early_stopping and args.epochs > 1
    training_args = TrainingArguments(
        output_dir=str(out_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.train_batch,
        per_device_eval_batch_size=args.eval_batch,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=10,
        load_best_model_at_end=use_early_stop,
        metric_for_best_model="eval_f1" if use_early_stop else "eval_loss",
        greater_is_better=use_early_stop,
        save_total_limit=2 if use_early_stop else 1,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics_factory(LABELS),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)] if use_early_stop else [],
    )

    logger.info(
        "Training LayoutLMv3 on %d samples (%d train / %d val); epochs=%d early_stop=%s",
        len(raw),
        len(train_items),
        len(val_items),
        args.epochs,
        use_early_stop,
    )
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

        report_str = classification_report(
            y_true,
            y_pred,
            labels=list(range(len(LABELS))),
            target_names=LABELS,
            digits=4,
            zero_division=0,
        )
        cm = confusion_matrix(y_true, y_pred, labels=list(range(len(LABELS))))

        metrics_payload = {
            "accuracy": acc,
            "precision": float(p),
            "recall": float(r),
            "f1": float(f1),
            "precision_weighted": float(p_w),
            "recall_weighted": float(r_w),
            "f1_weighted": float(f1_w),
        }
        report_dict = classification_report(
            y_true,
            y_pred,
            labels=list(range(len(LABELS))),
            target_names=LABELS,
            digits=4,
            zero_division=0,
            output_dict=True,
        )
    else:
        metrics_payload = {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}
        report_str = "(no labeled tokens in validation split)\n"
        report_dict = {}
        cm = None

    val_tokens = int(y_true.size)
    total_labeled_tokens = sum(len(row["labels"]) for row in raw)
    report_preamble = (
        "Dataset (for interpreting accuracy and scores below)\n"
        "- Task unit: each JSON item is one multi-word OCR sequence (words + boxes). "
        "The sklearn report below is token-level: each non-padding token is labeled "
        "O | YEAR | VALUE | METRIC (not one score per whole image or document).\n"
        f"- Total samples in this run: {len(raw)}; train samples: {len(train_items)}; "
        f"validation samples: {len(val_items)} (split seed {args.seed}).\n"
        f"- Labeled tokens across the full dataset: {total_labeled_tokens}; "
        f"labeled tokens evaluated below (validation, non -100): {val_tokens}.\n\n"
    )
    report_full = report_preamble + report_str

    print("\n=== Token classification report (validation) ===")
    print(report_full)
    if cm is not None:
        print("Confusion matrix (rows=true, cols=pred):")
        print(cm)

    model.save_pretrained(out_dir)
    processor.save_pretrained(out_dir)

    map_path = out_dir / "label_map.json"
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
    (out_dir / "metrics.json").write_text(
        json.dumps(metrics_payload, indent=2),
        encoding="utf-8",
    )

    label_counts: dict[str, int] = {}
    for row in raw:
        for lab in row["labels"]:
            label_counts[lab] = label_counts.get(lab, 0) + 1

    train_metrics = train_out.metrics if train_out else {}
    summary = _json_sanitize(
        {
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "base_model": args.base_model,
            "model_output_dir": str(out_dir.resolve()),
            "dataset_path": str(data_path.resolve()),
            "dataset": {
                "samples": int(len(raw)),
                "label_token_counts": label_counts,
                "train_samples": int(len(train_ds)),
                "val_samples": int(len(val_ds)),
                "val_split_seed": int(args.seed),
            },
            "train_summary_metrics": train_metrics,
            "trainer_eval_metrics": {k: v for k, v in eval_metrics.items() if k.startswith("eval_")},
            "validation": {
                **metrics_payload,
                "per_class": report_dict,
                "confusion_matrix": cm.tolist() if cm is not None else [],
            },
            "training_args": {
                "epochs": training_args.num_train_epochs,
                "per_device_train_batch_size": training_args.per_device_train_batch_size,
                "per_device_eval_batch_size": training_args.per_device_eval_batch_size,
                "learning_rate": training_args.learning_rate,
                "early_stopping": use_early_stop,
            },
        }
    )

    (out_dir / "training_metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (out_dir / "validation_report.txt").write_text(report_full, encoding="utf-8")

    reports_dir.mkdir(parents=True, exist_ok=True)
    # FinBERT parity: root-level `*_latest*` snapshots (git-friendly, same idea as finbert_latest.*).
    (reports_dir / "layoutlm_latest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (reports_dir / "layoutlm_latest_validation_report.txt").write_text(report_full, encoding="utf-8")

    # Same filenames as beside weights (`layout_model_trained/training_metrics.json`), under reports.
    layoutlm_reports = reports_dir / "layoutlm"
    layoutlm_reports.mkdir(parents=True, exist_ok=True)
    (layoutlm_reports / "training_metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (layoutlm_reports / "validation_report.txt").write_text(report_full, encoding="utf-8")

    logger.info("Wrote training_metrics.json + validation_report.txt under %s", out_dir)
    logger.info("Wrote latest snapshot to %s", reports_dir / "layoutlm_latest.json")
    logger.info("Wrote FinBERT-style report copies to %s", layoutlm_reports)
    print("Saved model, processor, label_map.json to", out_dir)


if __name__ == "__main__":
    main()
