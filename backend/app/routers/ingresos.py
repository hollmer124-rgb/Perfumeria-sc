from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from supabase import Client

from app.database import execute_query, get_authenticated_client
from app.routers.common import apply_date_range, apply_text_search, fetch_page, first_row
from app.schemas import IngresoRead, IngresoWrite


router = APIRouter(prefix="/api/ingresos", tags=["Ingresos"])


@router.get("", response_model=list[IngresoRead])
def list_ingresos(
    response: Response,
    search: Annotated[str | None, Query(max_length=100)] = None,
    fecha_inicio: date | None = None,
    fecha_fin: date | None = None,
    metodo_pago: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    client: Client = Depends(get_authenticated_client),
) -> list[dict[str, Any]]:
    query = client.table("ingresos").select("*", count="exact")
    query = apply_text_search(
        query,
        search,
        ("concepto", "comprobante", "cliente_referencia"),
    )
    query = apply_date_range(query, fecha_inicio, fecha_fin)
    if metodo_pago:
        query = query.eq("metodo_pago", metodo_pago.strip())
    rows, total = fetch_page(query, limit, offset)
    response.headers["X-Total-Count"] = str(total)
    return rows


@router.post("", response_model=IngresoRead, status_code=status.HTTP_201_CREATED)
def create_ingreso(
    payload: IngresoWrite,
    request: Request,
    client: Client = Depends(get_authenticated_client),
) -> dict[str, Any]:
    data = payload.model_dump(mode="json")
    data["user_id"] = request.state.current_user.id
    response = execute_query(
        client.table("ingresos").insert(data).select("*")
    )
    return first_row(response)


@router.put("/{record_id}", response_model=IngresoRead)
def update_ingreso(
    record_id: UUID,
    payload: IngresoWrite,
    client: Client = Depends(get_authenticated_client),
) -> dict[str, Any]:
    response = execute_query(
        client.table("ingresos")
        .update(payload.model_dump(mode="json"))
        .eq("id", str(record_id))
        .select("*")
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el ingreso solicitado.",
        )
    return rows[0]


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ingreso(
    record_id: UUID,
    client: Client = Depends(get_authenticated_client),
) -> None:
    response = execute_query(
        client.table("ingresos")
        .delete()
        .eq("id", str(record_id))
        .select("id")
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró el ingreso solicitado.",
        )


__all__ = ["router"]
