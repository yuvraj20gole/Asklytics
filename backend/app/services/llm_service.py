from openai import OpenAI

from app.core.config import get_settings


class LLMService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    def question_to_sql(self, question: str, schema_context: str) -> str:
        if not self.client:
            # Local deterministic SQL agent over processed financial_facts only.
            q = question.lower()
            asks_expense = (
                "expense" in q
                or "expenses" in q
                or "spend" in q
                or "spending" in q
                or "expen" in q
            )
            has_financial_facts = "financial_facts(" in schema_context.lower()

            if has_financial_facts:
                asks_revenue = "revenue" in q or "sales" in q
                asks_highest = any(
                    kw in q
                    for kw in ["highest", "max", "maximum", "top", "peak", "most"]
                )
                asks_lowest = any(
                    kw in q
                    for kw in ["lowest", "min", "minimum", "least", "bottom"]
                )

                if asks_revenue and asks_highest and ("year" in q or "period" in q):
                    return (
                        "SELECT period, MAX(value) AS revenue "
                        "FROM financial_facts "
                        "WHERE metric = 'revenue' "
                        "AND level = 'consolidated' "
                        "AND is_valid = 1 "
                        "GROUP BY period "
                        "ORDER BY revenue DESC LIMIT 1"
                    )
                if asks_revenue and asks_lowest and ("year" in q or "period" in q):
                    return (
                        "SELECT period, MAX(value) AS revenue "
                        "FROM financial_facts "
                        "WHERE metric = 'revenue' "
                        "AND level = 'consolidated' "
                        "AND is_valid = 1 "
                        "GROUP BY period "
                        "ORDER BY revenue ASC LIMIT 1"
                    )
                if "trend" in q and ("revenue" in q or "sales" in q):
                    return (
                        "SELECT period, value AS revenue "
                        "FROM financial_facts "
                        "WHERE metric = 'revenue' "
                        "AND level = 'consolidated' "
                        "AND is_valid = 1 "
                        "ORDER BY period"
                    )
                if "compare" in q and ("revenue" in q and asks_expense):
                    return (
                        "SELECT period, "
                        "MAX(CASE WHEN metric = 'revenue' THEN value END) AS revenue, "
                        "MAX(CASE WHEN metric IN ('expenses', 'cogs') THEN value END) AS expenses "
                        "FROM financial_facts "
                        "WHERE level = 'consolidated' AND is_valid = 1 "
                        "GROUP BY period "
                        "ORDER BY period"
                    )
                if asks_expense:
                    return (
                        "SELECT period, value AS expenses "
                        "FROM financial_facts "
                        "WHERE metric IN ('expenses', 'cogs') "
                        "AND level = 'consolidated' "
                        "AND is_valid = 1 "
                        "ORDER BY period"
                    )
                if "net income" in q or "profit" in q:
                    return (
                        "SELECT period, value AS net_income "
                        "FROM financial_facts "
                        "WHERE metric IN ('net_income', 'operating_income', 'ebitda') "
                        "AND level = 'consolidated' "
                        "AND is_valid = 1 "
                        "ORDER BY period"
                    )
                return (
                    "SELECT period, metric, value, currency, company "
                    "FROM financial_facts "
                    "WHERE level = 'consolidated' AND is_valid = 1 "
                    "ORDER BY period DESC "
                    "LIMIT 100"
                )
            return "SELECT period, metric, value FROM financial_facts WHERE is_valid = 1 ORDER BY period"

        system_prompt = (
            "You are a senior SQL analyst. Return one safe SQL SELECT query only. "
            "Never include markdown fences. Use only tables and columns from schema context. "
            "If the question asks for a metric not present in schema (e.g. expenses), "
            "use the closest available proxy and alias it clearly (e.g. spend). "
            "For financial_facts queries, use consolidated annual values only: "
            "WHERE level = 'consolidated' AND is_valid = 1. "
            "Do not aggregate value unless explicitly requested. "
            "Always query financial_facts for financial questions; never use transactional tables."
        )
        user_prompt = f"Schema:\n{schema_context}\n\nQuestion:\n{question}"
        response = self.client.responses.create(
            model=self.settings.openai_model,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
        )
        return response.output_text.strip()
