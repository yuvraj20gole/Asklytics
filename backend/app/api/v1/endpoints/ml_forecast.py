from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models import FinancialFact
from app.db.session import get_db
from app.ml.revenue_mlp import train_and_forecast
from app.schemas.ml_forecast import RevenueForecastResponse

router = APIRouter()


@router.get("/ml/revenue-forecast", response_model=RevenueForecastResponse)
def revenue_forecast(
    db: Session = Depends(get_db),
    _current_user: str = Depends(get_current_user),
    company: str | None = None,
    window: int = 4,
    epochs: int = 400,
) -> RevenueForecastResponse:
    """
    Train a small PyTorch MLP on consolidated revenue series and forecast the next value.
    Requires enough historical points (default window=4 → at least 5 periods).
    """
    q = (
        db.query(FinancialFact)
        .filter(
            FinancialFact.metric == "revenue",
            FinancialFact.level == "consolidated",
            FinancialFact.is_valid.is_(True),
        )
    )
    if company:
        q = q.filter(FinancialFact.company == company)

    rows = q.all()
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No consolidated revenue facts in database. Ingest financials first.",
        )

    # One value per period (max if duplicates)
    by_period: dict[str, float] = {}
    for r in rows:
        p = str(r.period).strip()
        v = float(r.value)
        if p not in by_period or v > by_period[p]:
            by_period[p] = v

    pairs = list(by_period.items())
    try:
        out = train_and_forecast(pairs, window=window, epochs=epochs)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RevenueForecastResponse(
        periods_used=out.periods,
        values_used=out.values,
        predicted_value=out.predicted_value,
        predicted_period_hint=out.predicted_period_hint,
        training_loss_mse=out.train_loss,
        epochs=out.epochs_ran,
        window=out.window,
    )
