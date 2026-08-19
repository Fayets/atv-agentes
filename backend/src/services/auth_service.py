from datetime import datetime, timedelta

from decouple import config
from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from passlib.context import CryptContext
from pony.orm import db_session

from src.models import User

_SECRET = config("JWT_SECRET", default="change-me-in-production-please")
_ALGORITHM = "HS256"
_EXPIRE_DAYS = 30

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── helpers ──────────────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return pwd_ctx.hash(password)


def _verify(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def _create_token(user_id: int, username: str, role: str, client_id: str | None) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "client_id": client_id or "",
        "exp": datetime.utcnow() + timedelta(days=_EXPIRE_DAYS),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="atv_token",
        value=token,
        httponly=True,
        secure=False,          # True en producción con HTTPS
        samesite="lax",
        max_age=_EXPIRE_DAYS * 86400,
        path="/",
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie("atv_token", path="/")


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


# ── public API ────────────────────────────────────────────────────────────────

def login(username: str, password: str, response: Response) -> dict:
    with db_session:
        user = User.get(username=username.strip().lower())
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
        if not _verify(password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
        token = _create_token(user.id, user.username, user.role, user.client_id)
        _set_cookie(response, token)
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "client_id": user.client_id or None,
        }


def get_me(request: Request) -> dict:
    token = request.cookies.get("atv_token")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = _decode_token(token)
    with db_session:
        user = User.get(id=int(payload["sub"]))
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "client_id": user.client_id or None,
        }


def logout(response: Response) -> dict:
    _clear_cookie(response)
    return {"ok": True}


def create_user(username: str, password: str, role: str = "client_admin", client_id: str | None = None) -> dict:
    now = datetime.utcnow()
    with db_session:
        if User.get(username=username.strip().lower()):
            raise HTTPException(status_code=409, detail="El usuario ya está registrado")
        user = User(
            username=username.strip().lower(),
            hashed_password=_hash(password),
            role=role,
            client_id=client_id or "",
            is_active=True,
            created_at=now,
        )
        return {"id": user.id, "username": user.username, "role": user.role}
