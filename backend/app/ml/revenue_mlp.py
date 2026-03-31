"""
Tiny PyTorch MLP for next-period revenue forecast from a univariate series.
Trains in seconds on CPU; no external APIs.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ForecastResult:
    periods: list[str]
    values: list[float]
    predicted_value: float
    predicted_period_hint: str | None
    train_loss: float
    epochs_ran: int
    window: int


def _period_sort_key(period: str) -> tuple[int, str]:
    m = re.search(r"(20\d{2})", period)
    if m:
        return (int(m.group(1)), period)
    return (0, period)


def _next_period_hint(periods: list[str]) -> str | None:
    years: list[int] = []
    for p in periods:
        m = re.search(r"(20\d{2})", p)
        if m:
            years.append(int(m.group(1)))
    if not years:
        return None
    return str(max(years) + 1)


def train_and_forecast(
    period_value_pairs: list[tuple[str, float]],
    *,
    window: int = 4,
    epochs: int = 400,
    lr: float = 0.01,
) -> ForecastResult:
    import os

    # Must be set before first torch import in this process (macOS OpenMP / Rosetta).
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

    try:
        import torch
        import torch.nn as nn
    except ImportError as exc:
        raise RuntimeError(
            "PyTorch is not installed. Install with: pip install torch"
        ) from exc

    if len(period_value_pairs) < window + 1:
        raise ValueError(
            f"Need at least {window + 1} revenue periods for window={window}; "
            f"got {len(period_value_pairs)}."
        )

    class _RevenueMLP(nn.Module):
        def __init__(self, w: int) -> None:
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(w, 32),
                nn.ReLU(),
                nn.Linear(32, 16),
                nn.ReLU(),
                nn.Linear(16, 1),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.net(x)

    sorted_pairs = sorted(period_value_pairs, key=lambda x: _period_sort_key(x[0]))
    periods = [p for p, _ in sorted_pairs]
    values = [float(v) for _, v in sorted_pairs]

    raw = torch.tensor(values, dtype=torch.float32)
    mean = raw.mean()
    std = raw.std().clamp_min(1e-6)
    z = (raw - mean) / std

    xs: list[torch.Tensor] = []
    ys: list[torch.Tensor] = []
    for i in range(len(z) - window):
        xs.append(z[i : i + window])
        ys.append(z[i + window])

    X = torch.stack(xs)
    y = torch.stack(ys).unsqueeze(1)

    model = _RevenueMLP(window)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    model.train()
    last_loss = 0.0
    for _ in range(epochs):
        opt.zero_grad()
        pred = model(X)
        loss = loss_fn(pred, y)
        loss.backward()
        opt.step()
        last_loss = float(loss.detach())

    model.eval()
    with torch.no_grad():
        tail = z[-window:].unsqueeze(0)
        z_next = model(tail).squeeze().item()
    pred_raw = z_next * std.item() + mean.item()
    pred_raw = max(pred_raw, 0.0)

    hint = _next_period_hint(periods)

    logger.info(
        "MLP forecast train_loss=%s epochs=%s window=%s periods=%s",
        last_loss,
        epochs,
        window,
        len(periods),
    )

    return ForecastResult(
        periods=periods,
        values=values,
        predicted_value=float(pred_raw),
        predicted_period_hint=hint,
        train_loss=last_loss,
        epochs_ran=epochs,
        window=window,
    )
