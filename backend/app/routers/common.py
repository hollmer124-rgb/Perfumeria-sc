from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.database import execute_query


def apply_date_range(query: Any, fecha_inicio: date | None, fecha_fin: date | None) -> Any:
    if fecha_inicio and fecha_fin and fecha_inicio > fecha_fin:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="fecha_inicio no puede ser posterior a fecha_fin.",
        )
    if fecha_inicio:
        query = query.gte(
            "fecha",
            datetime.combine(
                fecha_inicio,
                time.min,
                tzinfo=timezone(timedelta(hours=-5)),
            ).isoformat(),
        )
    if fecha_fin:
        fecha_exclusiva = fecha_fin + timedelta(days=1)
        query = query.lt(
            "fecha",
            datetime.combine(
                fecha_exclusiva,
                time.min,
                tzinfo=timezone(timedelta(hours=-5)),
            ).isoformat(),
        )
    return query


def apply_text_search(query: Any, search: str | None, columns: tuple[str, ...]) -> Any:
    if not search or not search.strip():
        return query
    escaped = search.strip().replace("\\", "\\\\").replace('"', '\\"')
    pattern = f'"*{escaped}*"'
    filters = ",".join(f"{column}.ilike.{pattern}" for column in columns)
    return query.or_(filters)


def fetch_page(query: Any, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
    response = execute_query(
        query.order("fecha", desc=True).range(offset, offset + limit - 1)
    )
    total = int(response.count or len(response.data or []))
    return response.data or [], total


def first_row(response: Any) -> dict[str, Any]:
    data = response.data
    if isinstance(data, dict):
        return data
    rows = data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase no devolvió el registro guardado.",
        )
    return rows[0]
