# LayoutLM fine-tuned assets (small files only)

Weight files (`*.safetensors`, training `checkpoints/`) are **not** in git (GitHub size limits). After cloning, run from the repo root:

```bash
cd backend && PYTHONPATH=. python -m app.ml.train_layoutlm
```

Or copy your local `model.safetensors` into this folder next to `config.json`.
