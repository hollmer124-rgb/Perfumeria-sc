import logging
from typing import Annotated, Protocol, TypeVar

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from supabase import Client, create_client
from supabase_auth.errors import AuthApiError, AuthRetryableError
from supabase_auth.types import User

from app.config import settings


logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


def get_supabase_client() -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase no está configurado. Completa SUPABASE_URL y SUPABASE_KEY.",
        )
    return create_client(settings.supabase_url, settings.supabase_key)


def get_authenticated_client(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> Client:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere un token Bearer válido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    client = get_supabase_client()
    token = credentials.credentials
    try:
        response = client.auth.get_user(token)
    except AuthApiError as exc:
        logger.info("Supabase rechazó un token de acceso (código %s).", exc.code)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token es inválido o expiró.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except AuthRetryableError as exc:
        logger.warning("Supabase Auth no está disponible temporalmente.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No fue posible validar la sesión con Supabase.",
        ) from exc

    if response is None or response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token es inválido o expiró.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    client.postgrest.auth(token)
    request.state.current_user = response.user
    request.state.access_token = token
    return client


Response_co = TypeVar("Response_co", covariant=True)


class ExecutableQuery(Protocol[Response_co]):
    def execute(self) -> Response_co: ...


def execute_query(query: ExecutableQuery[Response_co]) -> Response_co:
    try:
        return query.execute()
    except APIError as exc:
        if exc.code == "23505":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un registro con esos datos.",
            ) from exc
        if exc.code in {"22P02", "23503", "23514"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Los datos no cumplen las reglas de la base de datos.",
            ) from exc
        logger.error("Falló una consulta PostgREST (código %s).", exc.code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No fue posible completar la operación en Supabase.",
        ) from exc


def get_authenticated_user(request: Request) -> User:
    user = getattr(request.state, "current_user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión no está autenticada.",
        )
    return user


AuthenticatedClient = Annotated[Client, Depends(get_authenticated_client)]
