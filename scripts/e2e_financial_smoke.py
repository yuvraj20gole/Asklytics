#!/usr/bin/env python3
"""
Lightweight smoke checks: image ingest dict shape, table_reconstruction, optional CSV read.
Run from repo root: python scripts/e2e_financial_smoke.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))


def main() -> None:
    os.chdir(REPO)
    from app.services.image_financial_ingest import process_image_financials
    from app.services.table_reconstruction import parse_financial_rows

    rows = parse_financial_rows(
        ["FY 2023 Revenue 578,910", "FY 2023 Finance Cost 355,000"],
    )
    assert len(rows) == 2, rows

    img = REPO / "debug_output" / "processed.png"
    if img.is_file():
        out = process_image_financials(str(img))
        assert isinstance(out, dict)
        assert "rows" in out and "source" in out and "confidence_summary" in out
        assert out["source"] in ("layoutlm", "ocr_fallback")
        print("image ingest:", out["source"], "rows=", len(out["rows"]), out["confidence_summary"])
    else:
        print("skip image (no debug_output/processed.png)")

    print("e2e_financial_smoke: OK")


if __name__ == "__main__":
    main()
