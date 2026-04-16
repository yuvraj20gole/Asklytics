"""
Generate a large balanced CSV for FinBERT line classification (revenue / expense / profit / other).

Mimics phrasing and amount styles from financial_dataset_extended.csv.
Run from repo root:
  PYTHONPATH=backend python -m app.ml.generate_financial_bulk_csv --rows 5000
"""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
OUT_PATH = ML_DIR / "data" / "financial_dataset_bulk.csv"

YEARS = list(range(2018, 2025))

REV_PHRASES = [
    "Revenue from operations",
    "Net Sales",
    "Total Income",
    "Turnover",
    "Gross Revenue",
    "Sales Revenue",
    "Operating revenue",
    "Top line",
    "Topline revenue",
    "Income from operations",
    "Consolidated revenue",
    "Segment revenue",
    "Product sales",
    "Merchandise sales",
    "Service income",
    "Subscription Revenue",
    "License fees",
    "Rental income",
    "Sales of goods",
]

EXP_PHRASES = [
    "Finance Cost",
    "Other Expenses",
    "Employee benefits",
    "Cost of materials",
    "Administrative expenses",
    "Selling expenses",
    "Marketing expense",
    "Rent expense",
    "Power and Fuel",
    "Depreciation Expense",
    "Interest expense",
    "Tax expense",
    "R&D expense",
    "Professional fees",
    "Insurance expense",
    "Cost of Goods Sold",
    "Operating Cost",
]

PROFIT_PHRASES = [
    "Net Profit",
    "Profit after tax (PAT)",
    "Earnings after tax",
    "Gross Profit",
    "Operating profit",
    "EBITDA",
    "EBIT",
    "Profit Before Tax",
    "PBT",
    "Net income",
    "Profit for the year",
    "Earnings from operations",
    "Bottom line",
    "Operating Income",
]

OTHER_PHRASES = [
    "Other income",
    "Exceptional items",
    "Prior period items",
    "Extraordinary items",
    "Notes to accounts",
    "Schedule 1",
    "Contingent liability",
    "EPS basic",
    "Deferred tax",
    "OCI adjustment",
    "Share capital",
    "Reserves and surplus",
    "Foreign exchange gain",
    "Related party note",
    "Accounting policy change",
]


def _digits_plain(rng: random.Random) -> str:
    n = rng.randint(5, 8)
    return str(rng.randint(10 ** (n - 1), 10**n - 1))


def _digits_indian_commas(rng: random.Random) -> str:
    """Western grouping with commas (matches extended CSV style)."""
    val = rng.randint(50_000, 99_999_999)
    return f"{val:,}"


def _amount(rng: random.Random) -> str:
    style = rng.choice(["plain", "comma", "rupee_plain", "rupee_comma"])
    if style == "plain":
        return _digits_plain(rng)
    if style == "comma":
        return _digits_indian_commas(rng)
    if style == "rupee_plain":
        return f"₹{_digits_plain(rng)}"
    return f"₹{_digits_indian_commas(rng)}"


def _line_for_label(label: str, rng: random.Random) -> str:
    if label == "revenue":
        phrases = REV_PHRASES
    elif label == "expense":
        phrases = EXP_PHRASES
    elif label == "profit":
        phrases = PROFIT_PHRASES
    else:
        phrases = OTHER_PHRASES

    base = rng.choice(phrases)
    if rng.random() < 0.45:
        base = base.lower() if rng.random() < 0.5 else base.upper()
    year = rng.choice(YEARS)
    amt = _amount(rng)
    fy = rng.choice(["FY ", "fy ", ""])

    patterns = [
        f"{fy}{year} {base} {amt}",
        f"{base} FY {year} {amt}",
        f"{base} {year} {amt}",
        f"{base} {amt}",
    ]
    text = rng.choice(patterns).strip()
    if rng.random() < 0.08:
        text = f"{text} (Note {rng.randint(1, 25)})"
    return text


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", type=int, default=5000, help="Total rows (divisible by 4 recommended)")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--output",
        type=Path,
        default=OUT_PATH,
        help="Output CSV path",
    )
    args = p.parse_args()
    rng = random.Random(args.seed)
    labels = ["revenue", "expense", "profit", "other"]
    n_each = max(1, args.rows // 4)
    total = n_each * 4

    args.output.parent.mkdir(parents=True, exist_ok=True)
    seen: set[tuple[str, str]] = set()
    rows: list[tuple[str, str]] = []

    for lab in labels:
        added = 0
        attempts = 0
        while added < n_each and attempts < n_each * 50:
            attempts += 1
            text = _line_for_label(lab, rng)
            key = (text.strip(), lab)
            if key in seen:
                continue
            seen.add(key)
            rows.append((text, lab))
            added += 1

    rng.shuffle(rows)

    with args.output.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["text", "label"])
        for text, lab in rows:
            w.writerow([text, lab])

    print(f"Wrote {len(rows)} rows to {args.output} ({n_each} per label, seed={args.seed})")


if __name__ == "__main__":
    main()
