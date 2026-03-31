from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    company_email: EmailStr = Field(..., description="Company email address")
    username: str = Field(..., min_length=2, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=160)


class LoginRequest(BaseModel):
    """Login with company email or username (user id)."""

    email_or_username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    message: str
    email: str
    username: str
