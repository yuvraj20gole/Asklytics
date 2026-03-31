"""Local ML modules (PyTorch). No external inference APIs."""

from app.ml.revenue_mlp import ForecastResult, train_and_forecast

__all__ = ["ForecastResult", "train_and_forecast"]
