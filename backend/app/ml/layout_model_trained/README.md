# LayoutLM fine-tuned assets (small files only)

Weight files (`*.safetensors`, training `checkpoints/`) are **not** in git (GitHub size limits). After cloning, run from the repo root:

```bash
cd backend && PYTHONPATH=. python -m app.ml.train_layoutlm
```

Or copy your local `model.safetensors` into this folder next to `config.json`.

Training also writes (FinBERT-style, under `backend/app/ml/training_reports/`):

- `layoutlm_latest.json` — latest snapshot (same role as `finbert_latest.json`)
- `layoutlm_latest_validation_report.txt` — token report (same role as `finbert_latest_validation_report.txt`)
- `layoutlm/training_metrics.json` — same JSON as beside weights, stable path in git
- `layoutlm/validation_report.txt` — same text as beside weights

Next to weights this folder also has `training_metrics.json` and `validation_report.txt` (same content as under `training_reports/layoutlm/`).

Smoke / debug (subsample; **overwrites local weights**):

```bash
cd backend && PYTHONPATH=. python -m app.ml.train_layoutlm --epochs 1 --max-samples 64 --no-early-stopping
```
