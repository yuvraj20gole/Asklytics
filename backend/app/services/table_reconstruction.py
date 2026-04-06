"""
Convert OCR line items into structured financial rows (year, metric, value).
Does not call OCR or preprocessing — consumes OCR output only.
"""

from __future__ import annotations

import logging
import re
import sys

from app.ml.financial_classifier import classify_text, classify_texts

logger = logging.getLogger(__name__)

ML_CONFIDENCE_FLOOR = 0.6
# If FinBERT confidently predicts a non-"other" label, do not override with numeric revenue inference.
ML_HIGH_CONFIDENCE_NON_OTHER = 0.75


def detect_currency(text: str) -> str | None:
    t = (text or "").lower()
    if "₹" in text or "inr" in t or re.search(r"\brs\b", t) or "rupee" in t:
        return "INR"
    if "$" in text or "usd" in t:
        return "USD"
    if "€" in text or "eur" in t:
        return "EUR"
    return None


def detect_unit_multiplier(text: str) -> float:
    t = (text or "").lower()
    if "crore" in t or re.search(r"\bcr\b", t):
        return 1e7
    if "lakh" in t or "lac" in t:
        return 1e5
    if "million" in t:
        return 1e6
    if "billion" in t:
        return 1e9
    return 1.0


def resolve_currency(rows: list[dict]) -> tuple[list[dict], str | None]:
    currencies = [r.get("currency") for r in rows if r.get("currency")]
    if not currencies:
        return rows, None
    dominant = max(set(currencies), key=currencies.count)
    for r in rows:
        if not r.get("currency"):
            r["currency"] = dominant
    return rows, dominant


def detect_metric(row_text: str) -> str:
    """
    Rule-based metric when ML confidence is below the floor.
    Returns one of: revenue, expense, profit, other.
    """
    t = re.sub(r"\s+", " ", (row_text or "").strip().lower())
    if not t:
        return "other"

    if any(
        x in t
        for x in (
            "other income",
            "non-operating income",
            "exceptional",
            "extraordinary",
            "eps ",
            "earnings per share",
            "per share",
            "notes to accounts",
            "schedule ",
            "contingent",
            "share capital",
            "reserves and surplus",
        )
    ):
        return "other"

    if "interest income" in t or "dividend income" in t:
        return "revenue"

    profit_patterns = (
        "profit before tax",
        "profit after tax",
        "net profit",
        "profit for the year",
        "ebitda",
        "operating profit",
        "net income",
        "earnings after tax",
        "bottom line",
    )
    for kw in profit_patterns:
        if kw in t:
            return "profit"
    if re.search(r"\bpat\b", t) or re.search(r"\bpbt\b", t):
        return "profit"
    if re.search(r"\bebit\b", t):
        return "profit"
    if "operating income" in t and "revenue" not in t:
        return "profit"

    expense_patterns = (
        "finance cost",
        "interest expense",
        "depreciation",
        "amortisation",
        "amortization",
        "expenses",
        "expense",
        "cost of goods",
        "cost of materials",
        "cogs",
        "employee benefit",
        "administrative",
        "selling and distribution",
        "operating cost",
        "rent expense",
        "tax expense",
        "marketing expense",
        "utilities expense",
    )
    for kw in expense_patterns:
        if kw in t:
            return "expense"

    revenue_patterns = (
        "revenue",
        "total income",
        "net sales",
        "turnover",
        "gross revenue",
        "income from operations",
        "subscription revenue",
        "sales revenue",
        "service revenue",
        "license revenue",
        "rental income",
    )
    for kw in revenue_patterns:
        if kw in t:
            return "revenue"

    if re.search(r"\bsales\b", t) and "cost" not in t:
        return "revenue"

    return "other"


def clean_text(text: str) -> str:
    text = text.replace("₹", "")
    text = re.sub(r"(?i)rs\.\s*", "", text)
    text = re.sub(r"(?i)\brs\b\s*", "", text)

    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_rows(ocr_results: list[dict]) -> list[str]:
    rows: list[str] = []

    for item in ocr_results:
        if item.get("confidence", 1) < 0.5:
            logger.debug("[extract_rows] skipped low confidence=%s text=%r", item.get("confidence"), item.get("text"))
            continue
        text = item["text"].strip()
        if text:
            rows.append(text)

    return rows


def extract_year(text: str) -> int | None:
    match = re.search(r"(FY\s*)?(20\d{2})", text)
    if match:
        return int(match.group(2))
    return None


def extract_value(text: str) -> int | None:
    cleaned_text = re.sub(r"[^\d,]", " ", text)

    numbers = re.findall(r"\d[\d,]*", cleaned_text)

    parsed_numbers: list[int] = []
    for num in numbers:
        try:
            value = int(num.replace(",", ""))
            parsed_numbers.append(value)
        except ValueError:
            continue

    multiplier = detect_unit_multiplier(text)
    # Prefer non-year values when possible.
    non_years = [n for n in parsed_numbers if not (1900 <= n <= 2100)]
    candidates = non_years if non_years else parsed_numbers

    if not candidates:
        return None

    # If unit multiplier implies scaled amounts (crore/lakh/million/billion), allow small bases like "5 crore".
    if multiplier != 1.0:
        base = max(candidates)
        return int(round(float(base) * float(multiplier)))

    large_numbers = [n for n in candidates if n >= 1000]
    if large_numbers:
        return max(large_numbers)

    return None


def ordered_int_tokens_excluding_year(text: str, year: int | None) -> list[int]:
    """All integers parsed left-to-right; skip the first token equal to `year` (table row start)."""
    cleaned_text = re.sub(r"[^\d,]", " ", text)
    numbers = re.findall(r"\d[\d,]*", cleaned_text)
    tokens: list[int] = []
    year_skipped = False
    for num in numbers:
        try:
            value = int(num.replace(",", ""))
        except ValueError:
            continue
        if year is not None and value == year and not year_skipped:
            year_skipped = True
            continue
        tokens.append(value)
    return tokens


def wide_pl_first_revenue_amount(tokens: list[int], *, min_large: int = 1000) -> int | None:
    """
    Wide P&L screenshot row: Year | Revenue | Other income | Total income | Expenses | ...
    After skipping the year, revenue is the *first* large number, not the max (max is often Total income).
    Require at least three large values so we do not mangle two-column snippets.
    """
    largish = [n for n in tokens if n >= min_large]
    if len(largish) >= 3:
        return largish[0]
    return None


def parse_financial_rows(rows: list[str]) -> list[dict]:
    structured: list[dict] = []
    cleaned = [clean_text(original) for original in rows]
    ml_pairs = classify_texts(cleaned) if cleaned else []

    for original, row, (ml_label, ml_confidence) in zip(rows, cleaned, ml_pairs):
        logger.info("[ROW] %s", row)

        year = extract_year(row)
        value = extract_value(row)
        # Currency must be detected from the original text (clean_text strips symbols like ₹ / rs)
        currency = detect_currency(original) or detect_currency(row)
        metric = ml_label
        fallback = False
        if ml_confidence < ML_CONFIDENCE_FLOOR:
            metric = detect_metric(row)
            fallback = True

        logger.info(
            "[ML CLASSIFY] text=%r final_metric=%s ml_label=%s ml_confidence=%.4f fallback=%s",
            row,
            metric,
            ml_label,
            ml_confidence,
            fallback,
        )

        tokens_for_wide = ordered_int_tokens_excluding_year(row, year)
        wide_rev = wide_pl_first_revenue_amount(tokens_for_wide)

        if metric == "revenue" and wide_rev is not None:
            value = wide_rev

        if metric == "other" and not (
            ml_label != "other" and ml_confidence >= ML_HIGH_CONFIDENCE_NON_OTHER
        ):
            if wide_rev is not None:
                value = wide_rev
                metric = "revenue"
                logger.info("[INFERRED REVENUE] wide P&L first column row=%r value=%s", row, value)
            else:
                big_nums: list[int] = []
                for n in re.findall(r"\d+", row):
                    try:
                        iv = int(n)
                        if iv > 1000:
                            big_nums.append(iv)
                    except ValueError:
                        continue
                if len(big_nums) >= 2:
                    inferred_value = max(big_nums)
                    logger.info("[INFERRED REVENUE] row=%r value=%s", row, inferred_value)
                    metric = "revenue"
                    value = inferred_value

        logger.info("[YEAR] %s, [VALUE] %s, [METRIC] %s", year, value, metric)

        if year is not None and value is not None:
            structured.append(
                {
                    "year": year,
                    "metric": metric,
                    "value": value,
                    "currency": currency,
                    "raw": row,
                }
            )
        else:
            logger.warning("[PARSE FAILED] row=%r year=%s value=%s", row, year, value)

    structured, _dominant_currency = resolve_currency(structured)
    return structured


def _run_self_tests() -> None:
    """Step-by-step and integration checks (run with: python -m app.services.table_reconstruction)."""
    # Value: must not pick calendar year as amount
    assert extract_value("FY 2023 Revenue 578,910") == 578910
    print("TEST value FY 2023 Revenue 578,910 ->", extract_value("FY 2023 Revenue 578,910"))
    assert detect_currency("FY 2023 Revenue ₹578,910") == "INR"
    assert detect_unit_multiplier("in crore") == 1e7
    assert extract_value("Revenue 5 crore") == 50000000

    # ML classifier (FinBERT head)
    m1, c1 = classify_text("Finance Cost")
    assert m1 == "expense" and c1 >= 0.6
    m2, c2 = classify_text("Revenue from Operations")
    assert m2 == "revenue" and c2 >= 0.6
    m3, c3 = classify_text("Net Profit")
    assert m3 == "profit" and c3 >= 0.6
    print("TEST classify_text Finance Cost / Revenue / Net Profit OK")

    samples = ["Finance Cost", "Revenue from Operations", "Net Profit"]
    bat = classify_texts(samples)
    singles = [classify_text(s) for s in samples]
    assert bat == singles
    print("TEST classify_texts matches classify_text OK")

    from unittest.mock import patch

    def _low_conf(_texts: list[str]) -> list[tuple[str, float]]:
        return [("other", 0.2) for _ in _texts]

    _mod = sys.modules[parse_financial_rows.__module__]
    with patch.object(_mod, "classify_texts", side_effect=_low_conf):
        fb = parse_financial_rows(["FY 2023 Finance Cost 355,000"])
    assert fb[0]["metric"] == "expense" and fb[0]["value"] == 355000
    print("TEST low-confidence ML fallback to detect_metric OK")

    num_soup = parse_financial_rows(["2020 412345 6155 418500 369000"])
    assert len(num_soup) == 1
    # Wide P&L: first money column is Revenue, not max (Total income).
    assert num_soup[0]["metric"] == "revenue" and num_soup[0]["value"] == 412345
    print("TEST numeric inference [INFERRED REVENUE] wide first column OK")

    apex_like = parse_financial_rows(["2019 385672 5328 391000 347000 32500 49"])
    assert len(apex_like) == 1 and apex_like[0]["value"] == 385672
    print("TEST apex_financials-style row uses Revenue not Total income OK")

    def _exp_high(texts: list[str]) -> list[tuple[str, float]]:
        return [("expense", 0.85) for _ in texts]

    _mod = sys.modules[parse_financial_rows.__module__]
    with patch.object(_mod, "classify_texts", side_effect=_exp_high):
        exp_soup = parse_financial_rows(["2020 412345 6155 418500 369000"])
    assert exp_soup[0]["metric"] == "expense"
    print("TEST high-confidence FinBERT non-other not overridden by inference OK")

    # Full pipeline (clean_text + parse)
    pipeline_rows = [
        "FY 2023 Revenue ₹578,910",
        "FY 2022 Total Income 510,000",
        "FY 2023 Finance Cost 355,000",
    ]
    parsed = parse_financial_rows(pipeline_rows)
    print("TEST full pipeline:", parsed)
    assert len(parsed) == 3
    assert parsed[0] == {"year": 2023, "metric": "revenue", "value": 578910, "currency": "INR", "raw": "FY 2023 Revenue 578,910"}
    assert parsed[1] == {"year": 2022, "metric": "revenue", "value": 510000, "currency": "INR", "raw": "FY 2022 Total Income 510,000"}
    assert parsed[2] == {"year": 2023, "metric": "expense", "value": 355000, "currency": "INR", "raw": "FY 2023 Finance Cost 355,000"}

    # extract_rows confidence filter
    mixed_ocr = [
        {"text": "keep me", "confidence": 0.9},
        {"text": "drop me", "confidence": 0.2},
    ]
    assert extract_rows(mixed_ocr) == ["keep me"]
    print("TEST extract_rows confidence filter OK")

    # Legacy sample OCR
    sample_ocr = [
        {"text": "FY 2023 Revenue 578,910", "bbox": [], "confidence": 0.9},
        {"text": "FY 2022 Revenue 510,000", "bbox": [], "confidence": 0.9},
        {"text": "FY 2023 Expenses 355,000", "bbox": [], "confidence": 0.9},
    ]
    rows = extract_rows(sample_ocr)
    assert rows == [
        "FY 2023 Revenue 578,910",
        "FY 2022 Revenue 510,000",
        "FY 2023 Expenses 355,000",
    ]
    structured = parse_financial_rows(rows)
    assert len(structured) >= 2
    rev_2023 = next((x for x in structured if x["year"] == 2023 and x["metric"] == "revenue"), None)
    assert rev_2023 is not None and rev_2023["value"] == 578910
    print("TEST legacy three-row parse OK")

    assert extract_year("FY 2023 Revenue") == 2023
    assert extract_value("578,910") == 578910

    one = parse_financial_rows(["FY 2023 Revenue 578,910"])
    assert len(one) == 1 and one[0]["value"] == 578910 and one[0]["metric"] == "revenue"
    print("TEST single-row parse OK")

    # Integration: OCR → rows → structured
    import cv2
    from pathlib import Path

    from app.services.image_preprocessing import preprocess_image
    from app.services.ocr_service import extract_text_with_boxes

    repo_root = Path(__file__).resolve().parents[3]
    debug_dir = repo_root / "debug_output"
    debug_dir.mkdir(parents=True, exist_ok=True)
    processed_path = debug_dir / "processed.png"
    raw_path = debug_dir / "test_financial.png"

    img = cv2.imread(str(processed_path))
    if img is None:
        print("INTEGRATION: generating", raw_path, "and", processed_path)
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError as exc:
            raise RuntimeError("Pillow required for integration fixture generation") from exc

        w, h = 1200, 500
        pil_img = Image.new("RGB", (w, h), "white")
        draw = ImageDraw.Draw(pil_img)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 42)
        except OSError:
            font = ImageFont.load_default()
        y = 40
        for line in (
            "FY 2023 Revenue ₹578,910",
            "FY 2022 Revenue ₹510,000",
            "FY 2023 Expenses ₹355,000",
        ):
            draw.text((40, y), line, fill="black", font=font)
            y += 80
        pil_img.save(raw_path)

        pre = preprocess_image(str(raw_path))
        if pre is None:
            raise RuntimeError("preprocess_image returned None for integration fixture")
        cv2.imwrite(str(processed_path), pre)
        img = cv2.imread(str(processed_path))
        if img is None:
            raise RuntimeError("failed to read generated processed.png")

    print("INTEGRATION: using", processed_path)
    ocr_results = extract_text_with_boxes(img)
    irows = extract_rows(ocr_results)
    istructured = parse_financial_rows(irows)
    print("INTEGRATION ocr row count:", len(irows))
    print("INTEGRATION structured:", istructured)
    assert len(irows) >= 2, f"expected multiple OCR lines, got {len(irows)}"
    assert len(istructured) >= 2, f"expected multiple parsed rows, got {len(istructured)}"
    rev_2023_i = next((x for x in istructured if x["year"] == 2023 and x["metric"] == "revenue"), None)
    assert rev_2023_i is not None and rev_2023_i["value"] == 578910, rev_2023_i


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    _run_self_tests()
    print("All table_reconstruction self-tests passed.")
