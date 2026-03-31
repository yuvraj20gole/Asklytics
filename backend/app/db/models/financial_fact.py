from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FinancialFact(Base):
    __tablename__ = "financial_facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    statement_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    metric: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    period: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="INR_CRORE")
    level: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="segment")
    currency: Mapped[str] = mapped_column(String(16), nullable=False, default="USD")
    source_file: Mapped[str] = mapped_column(String(255), nullable=False)
    source_page: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    extraction_method: Mapped[str] = mapped_column(String(32), nullable=False, default="rule")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.6)
