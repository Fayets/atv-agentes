from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from src.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, response: Response):
    return auth_service.login(payload.username, payload.password, response)


@router.get("/me")
def me(request: Request):
    return auth_service.get_me(request)


@router.post("/logout")
def logout(response: Response):
    return auth_service.logout(response)
