"""
Fine-tune FinBERT (ProsusAI/finbert) for 4-way financial line classification.
Run from repo root: PYTHONPATH=backend python -m app.ml.train_classifier
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

logger = logging.getLogger(__name__)

MODEL_NAME = "ProsusAI/finbert"
LABEL_MAP = {"revenue": 0, "expense": 1, "profit": 2, "other": 3}
ID2LABEL = {v: k for k, v in LABEL_MAP.items()}

ML_DIR = Path(__file__).resolve().parent
DATA_FILES = [
    ML_DIR / "data" / "financial_dataset.csv",
    ML_DIR / "data" / "financial_dataset_extended.csv",
]
OUTPUT_DIR = ML_DIR / "model"


class FinancialLineDataset(torch.utils.data.Dataset):
    def __init__(self, encodings: dict, labels: list[int]):
        self.encodings = encodings
        self.labels = labels

    def __getitem__(self, idx: int):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

    def __len__(self) -> int:
        return len(self.labels)


def load_training_frame() -> pd.DataFrame:
    dfs: list[pd.DataFrame] = []
    for path in DATA_FILES:
        if path.is_file():
            dfs.append(pd.read_csv(path))
            logger.info("Loaded shard %s (%d rows)", path.name, len(dfs[-1]))
    if not dfs:
        raise FileNotFoundError(
            "No dataset CSV found. Expected one of: " + ", ".join(str(p) for p in DATA_FILES)
        )
    df = pd.concat(dfs, ignore_index=True)
    df = df.drop_duplicates(subset=["text", "label"], keep="last")
    return df


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    df = load_training_frame()
    df = df.dropna(subset=["text", "label"])
    df["label"] = df["label"].str.strip().str.lower()
    df["text"] = df["text"].astype(str).str.strip()
    invalid = df[~df["label"].isin(LABEL_MAP)]
    if not invalid.empty:
        raise ValueError(f"Invalid labels: {invalid['label'].unique()}")

    df["label_id"] = df["label"].map(LABEL_MAP)

    profit_mask = df["label_id"] == LABEL_MAP["profit"]
    profit_df = df[profit_mask]
    if not profit_df.empty:
        df = pd.concat([df, profit_df], ignore_index=True)

    logger.info("Training frame: %d rows (after profit oversample)", len(df))
    print("Dataset preview:\n", df.head(), flush=True)

    train_texts, val_texts, train_labels, val_labels = train_test_split(
        df["text"].tolist(),
        df["label_id"].tolist(),
        test_size=0.2,
        random_state=42,
        stratify=df["label_id"],
    )

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize(texts: list[str]) -> dict:
        return tokenizer(
            texts,
            truncation=True,
            padding=True,
            max_length=128,
            return_tensors=None,
        )

    train_enc = tokenize(train_texts)
    val_enc = tokenize(val_texts)

    train_dataset = FinancialLineDataset(train_enc, train_labels)
    val_dataset = FinancialLineDataset(val_enc, val_labels)

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(LABEL_MAP),
        id2label=ID2LABEL,
        label2id=LABEL_MAP,
        ignore_mismatched_sizes=True,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = accuracy_score(labels, preds)
        p_w, r_w, f_w, _ = precision_recall_fscore_support(
            labels, preds, average="weighted", zero_division=0
        )
        p_m, r_m, f_m, _ = precision_recall_fscore_support(
            labels, preds, average="macro", zero_division=0
        )
        return {
            "accuracy": float(acc),
            "precision_weighted": float(p_w),
            "recall_weighted": float(r_w),
            "f1_weighted": float(f_w),
            "precision_macro": float(p_m),
            "recall_macro": float(r_m),
            "f1_macro": float(f_m),
        }

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_train_epochs=10,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_dir=str(OUTPUT_DIR / "logs"),
        logging_steps=10,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        save_total_limit=2,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    logger.info("Starting training (max 10 epochs, early stopping on eval loss)…")
    train_out = trainer.train()
    logger.info("Training finished; saving to %s", OUTPUT_DIR)

    metrics = train_out.metrics if train_out else {}
    print("\n=== Train summary metrics ===")
    for k in sorted(metrics):
        print(f"  {k}: {metrics[k]}")

    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    (OUTPUT_DIR / "label_map.json").write_text(
        json.dumps({"id2label": {str(v): k for k, v in LABEL_MAP.items()}}, indent=2),
        encoding="utf-8",
    )

    val_pred = trainer.predict(val_dataset)
    pred_ids = np.argmax(val_pred.predictions, axis=-1)
    names = [ID2LABEL[i] for i in range(len(LABEL_MAP))]
    print("\n=== Validation classification report ===")
    print(
        classification_report(
            val_pred.label_ids,
            pred_ids,
            labels=list(range(len(LABEL_MAP))),
            target_names=names,
            digits=4,
            zero_division=0,
        )
    )
    acc = accuracy_score(val_pred.label_ids, pred_ids)
    p_w, r_w, f_w, _ = precision_recall_fscore_support(
        val_pred.label_ids, pred_ids, average="weighted", zero_division=0
    )
    print(
        f"Accuracy: {acc:.4f} | Precision (weighted): {p_w:.4f} | "
        f"Recall (weighted): {r_w:.4f} | F1 (weighted): {f_w:.4f}"
    )
    print("Saved model, tokenizer, and label_map.json to", OUTPUT_DIR)


if __name__ == "__main__":
    main()
