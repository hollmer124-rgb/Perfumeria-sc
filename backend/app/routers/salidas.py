from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from supabase import Client

from app.database import execute_query, get_authenticated_client
from app.routers.common import apply_date_range, apply_text_search, fetch_page, first_row
from app.schemas import SalidaCategoria, SalidaRead, SalidaWrite


router = APIRouter(prefix="/api/salidas", tags=["Salidas"])


@router.get("", response_model=list[SalidaRead])
def list_salidas(
    search: Annotated[str | None, Query(max_length=100)] = None,
    categoria: SalidaCategoria | None = None,
    fecha_inicio: date | None = None,
    fecha_fin: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    client: Client = Depends(get_authenticated_client),
) -> list[dict[str, Any]]:
    query = client.table("salidas").select("*")
    query = apply_text_search(
        query,
        search,
        ("concepto", "proveedor", "comprobante"),
    )
    query = apply_date_range(query, fecha_inicio, fecha_fin)
    if categoria:
        query = query.eq("categoria", categoria.value)
    return fetch_page(query, limit, offset)


@router.post("", response_model=SalidaRead, status_code=status.HTTP_201_CREATED)
def create_salida(
    payload: SalidaWrite,
    request: Request,
    client: Client = Depends(get_authenticated_client),
) -> dict[str, Any]:
    data = payload.model_dump(mode="json")
    data["user_id"] = request.state.current_user.id
    response = execute_query(client.table("salidas").insert(data).select("*"))
    return first_row(response)


@router.put("/{record_id}", response_model=SalidaRead)
def update_salida(
    record_id: UUID,
    payload: SalidaWrite,
    client: Client = Depends(get_authenticated_client),
) -> dict[str, Any]:
    response = execute_query(
        client.table("salidas")
        .update(payload.model_dump(mode="json"))
        .eq("id", str(record_id))
        .select("*")
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró la salida solicitada.",
        )
    return rows[0]


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_salida(
    record_id: UUID,
    client: Client = Depends(get_authenticated_client),
) -> None:
    response = execute_query(
        client.table("salidas")
        .delete()
        .eq("id", str(record_id))
        .select("id")
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró la salida solicitada.",
        )


__all__ = ["router"]
