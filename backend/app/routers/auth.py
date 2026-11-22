import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from supabase import Client
from supabase_auth.errors import AuthApiError, AuthRetryableError

from app.database import get_authenticated_client, get_authenticated_user, get_supabase_client
from app.schemas import LoginRequest, LoginResponse, PublicUser


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest) -> LoginResponse:
    client = get_supabase_client()
    try:
        response = client.auth.sign_in_with_password(
            {
                "email": credentials.email,
                "password": credentials.password.get_secret_value(),
            }
        )
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo electrónico o contraseña incorrectos.",
        ) from exc
    except AuthRetryableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servicio de autenticación no está disponible temporalmente.",
        ) from exc

    if response.session is None or response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo iniciar la sesión.",
        )

    return LoginResponse(
        access_token=response.session.access_token,
        refresh_token=response.session.refresh_token,
        expires_in=response.session.expires_in,
        user=PublicUser(id=UUID(response.user.id), email=response.user.email),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    client: Annotated[Client, Depends(get_authenticated_client)],
) -> Response:
    token = request.state.access_token
    try:
        client.auth.admin.sign_out(token, scope="local")
    except AuthApiError as exc:
        if exc.status not in {401, 403, 404}:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="No fue posible cerrar la sesión en Supabase.",
            ) from exc
    except AuthRetryableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El servicio de autenticación no está disponible temporalmente.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=PublicUser)
def get_me(
    request: Request,
    _: Annotated[Client, Depends(get_authenticated_client)],
) -> PublicUser:
    user = get_authenticated_user(request)
    return PublicUser(id=UUID(user.id), email=user.email)
