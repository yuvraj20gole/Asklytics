"""Validate and deduplicate structured rows from image ingest before persistence."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_MIN_YEAR = 2000


def validate_and_deduplicate_rows(rows: list[dict]) -> list[dict]:
    """
    Drop invalid years/values and exact duplicates (year, metric, value).
    Logs [DATA CLEANED] with before/after counts.
    """
    if not rows:
        return []

    before = len(rows)
    seen: set[tuple] = set()
    cleaned: list[dict] = []

    for r in rows:
        year = r.get("year")
        value = r.get("value")
        metric = r.get("metric")
        if year is None or value is None:
            continue
        try:
            yi = int(year)
            vi = int(value)
        except (TypeError, ValueError):
            continue
        if yi < _MIN_YEAR or vi < 0:
            continue
        key = (yi, str(metric), vi)
        if key in seen:
            continue
        seen.add(key)
        out = dict(r)
        out["year"] = yi
        out["value"] = vi
        cleaned.append(out)

    removed = before - len(cleaned)
    if removed:
        logger.info("[DATA CLEANED] removed=%d kept=%d (invalid or duplicate)", removed, len(cleaned))
    else:
        logger.debug("[DATA CLEANED] no rows removed (n=%d)", len(cleaned))
    return cleaned
