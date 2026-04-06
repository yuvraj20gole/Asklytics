from __future__ import annotations

from typing import Any


class FinancialSeriesValidator:
    ERROR_MESSAGE = "Data inconsistency detected. Please reprocess the document."

    def _to_float(self, value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _period_key(self, row: dict[str, Any]) -> str | None:
        period = row.get("period")
        if period is None:
            return None
        return str(period)

    def validate_financial_series(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return

        if "period" not in rows[0]:
            return

        # Ratio / margin / formula queries — skip magnitude & YoY heuristics (values can be %, days, small ratios).
        row_keys_lower = [str(k).lower() for k in rows[0].keys()]
        _formula_key = frozenset(
            {
                "gross_profit",
                "roe_pct",
                "roa_pct",
                "roce_pct",
                "current_ratio",
                "quick_ratio",
                "debt_to_equity",
                "interest_coverage",
                "asset_turnover",
                "eps",
                "pe_ratio",
                "operating_margin_pct",
                "ebitda_margin_pct",
                "gross_margin_pct",
                "net_profit_margin_pct",
            }
        )
        if any(
            "margin" in k
            or "_pct" in k
            or k.endswith("_days")
            or k.startswith("yoy_")
            or k in _formula_key
            or k.endswith("_ratio")
            for k in row_keys_lower
        ):
            return

        metric_keys = [k for k in rows[0].keys() if k != "period"]
        if not metric_keys:
            return

        periods_seen: set[str] = set()
        values: list[float] = []
        for row in rows:
            period = self._period_key(row)
            if not period:
                raise ValueError(self.ERROR_MESSAGE)
            if period in periods_seen:
                raise ValueError(self.ERROR_MESSAGE)
            periods_seen.add(period)

            numeric = None
            for key in metric_keys:
                candidate = self._to_float(row.get(key))
                if candidate is not None:
                    numeric = candidate
                    break
            if numeric is None:
                continue
            values.append(numeric)
            if numeric < 1000:
                raise ValueError(self.ERROR_MESSAGE)

        for i in range(1, len(values)):
            prev = values[i - 1]
            cur = values[i]
            if prev > 0 and cur < prev * 0.1:
                raise ValueError(self.ERROR_MESSAGE)

    def clean_output_rows(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not rows or "period" not in rows[0]:
            return rows

        dedup: dict[str, dict[str, Any]] = {}
        for row in rows:
            period = self._period_key(row)
            if period is None:
                continue
            dedup[period] = row

        def _sort_key(item: dict[str, Any]) -> tuple[int, str]:
            p = self._period_key(item) or ""
            try:
                return (0, f"{int(p):08d}")
            except ValueError:
                return (1, p)

        return sorted(dedup.values(), key=_sort_key)
