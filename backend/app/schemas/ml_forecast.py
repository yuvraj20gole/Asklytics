from pydantic import BaseModel, Field


class RevenueForecastResponse(BaseModel):
    metric: str = "revenue"
    periods_used: list[str]
    values_used: list[float] = Field(description="Historical revenue (same unit as DB, e.g. INR_CRORE)")
    predicted_value: float
    predicted_period_hint: str | None = Field(None, description="Suggested next period label (e.g. next year)")
    training_loss_mse: float
    epochs: int
    window: int
    model: str = "pytorch_mlp_3layer"
    note: str = "Trained on-device; no external LLM/API."
