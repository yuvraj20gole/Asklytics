import json
import logging
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class AITableExtractor:
    def __init__(self) -> None:
        settings = get_settings()
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
        self.model = settings.openai_model

    def _extract_json_array(self, text: str) -> list[dict[str, Any]]:
        raw = (text or "").strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            pass

        m = re.search(r"\[[\s\S]*\]", raw)
        if not m:
            return []
        try:
            parsed = json.loads(m.group(0))
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    def extract_revenue_by_year(self, table_text: str) -> list[dict[str, Any]]:
        if not self.client:
            return []

        prompt = (
            "Extract total revenue for each year from this financial table.\n\n"
            "Return JSON in format:\n"
            "[\n"
            '  {"year": 2023, "revenue": 123456},\n'
            '  {"year": 2022, "revenue": 110000}\n'
            "]\n\n"
            "Only include revenue values.\n"
            "Ignore percentages, ratios, EPS, margins, and non-revenue rows.\n"
            "Do not include any extra keys.\n\n"
            f"TABLE:\n{table_text}"
        )

        resp = self.client.responses.create(
            model=self.model,
            input=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        data = self._extract_json_array(resp.output_text)
        logger.info("[AI RESULT] Raw extracted revenue JSON items=%s", len(data))
        return data
