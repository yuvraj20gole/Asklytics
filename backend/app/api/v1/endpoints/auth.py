from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, RegisterResponse, TokenResponse

router = APIRouter()


@router.post("/auth/register", response_model=RegisterResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    email_norm = payload.company_email.lower().strip()
    username_norm = payload.username.strip()

    if db.query(User).filter(User.email == email_norm).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if db.query(User).filter(func.lower(User.username) == username_norm.lower()).first():
        raise HTTPException(status_code=409, detail="This username is already taken.")

    user = User(
        email=email_norm,
        username=username_norm,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip() if payload.full_name else None,
    )
    db.add(user)
    db.commit()

    return RegisterResponse(
        message="Registration successful. You can sign in now.",
        email=email_norm,
        username=username_norm,
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    identifier = payload.email_or_username.strip()
    if not identifier:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    ident_lower = identifier.lower()
    user = (
        db.query(User)
        .filter(
            or_(
                User.email == ident_lower,
                func.lower(User.username) == ident_lower,
            )
        )
        .first()
    )

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email/username or password.")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)
