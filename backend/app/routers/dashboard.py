from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.database import execute_query, get_authenticated_client
from app.schemas import (
    DashboardExpenseDistribution,
    DashboardKPIs,
    DashboardMovement,
    DashboardSummary,
    DashboardTimeSeries,
    SalidaCategoria,
)


router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])
COLOMBIA_TZ = timezone(timedelta(hours=-5))
PAGE_SIZE = 1000
MONTH_LABELS = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")
WEEKDAY_LABELS = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")


def _fetch_all_rows(client: Client, table: str, columns: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = execute_query(
            client.table(table)
            .select(columns)
            .order("fecha", desc=True)
            .order("id", desc=True)
            .range(offset, offset + PAGE_SIZE - 1)
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def _as_colombia_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, datetime.min.time())
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("Supabase devolvió una fecha con formato inválido.")

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=COLOMBIA_TZ)
    return parsed.astimezone(COLOMBIA_TZ)


def _month_key(value: Any) -> tuple[int, int]:
    local_date = _as_colombia_datetime(value)
    return local_date.year, local_date.month


def _amount(row: dict[str, Any]) -> int:
    return int(row.get("monto_cop") or 0)


def _period_bounds(
    period: str,
    now: datetime,
) -> tuple[datetime | None, datetime | None, datetime | None]:
    if period == "todos":
        return None, None, None

    if period == "hoy":
        start = datetime.combine(now.date(), time.min, tzinfo=COLOMBIA_TZ)
        return start, start - timedelta(days=1), now - timedelta(days=1)

    if period == "semana":
        week_start_date = now.date() - timedelta(days=now.weekday())
        start = datetime.combine(week_start_date, time.min, tzinfo=COLOMBIA_TZ)
        previous_start = start - timedelta(days=7)
        return start, previous_start, previous_start + (now - start)

    start = datetime(now.year, now.month, 1, tzinfo=COLOMBIA_TZ)
    previous_start = (start - timedelta(days=1)).replace(day=1)
    previous_end = min(previous_start + (now - start), start)
    return start, previous_start, previous_end


def _in_period(
    row: dict[str, Any],
    start: datetime | None,
    end: datetime | None,
) -> bool:
    if start is None:
        return True
    value = _as_colombia_datetime(row["fecha"])
    return value >= start and (end is None or value <= end)


def _variation(current: int, previous: int) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 2)


def _month_span(start: date, end: date) -> list[tuple[int, int]]:
    start_index = start.year * 12 + start.month - 1
    end_index = end.year * 12 + end.month - 1
    keys: list[tuple[int, int]] = []
    for index in range(start_index, end_index + 1):
        year, month_index = divmod(index, 12)
        keys.append((year, month_index + 1))
    return keys


def _series(
    period: str,
    ingresos: list[dict[str, Any]],
    salidas: list[dict[str, Any]],
    now: datetime,
) -> DashboardTimeSeries:
    income_by_key: dict[Any, int] = {}
    expense_by_key: dict[Any, int] = {}

    def key_for(value: datetime) -> Any:
        if period == "hoy":
            return value.hour
        if period == "todos":
            return value.year, value.month
        return value.date()

    for row in ingresos:
        key = key_for(_as_colombia_datetime(row["fecha"]))
        income_by_key[key] = income_by_key.get(key, 0) + _amount(row)
    for row in salidas:
        key = key_for(_as_colombia_datetime(row["fecha"]))
        expense_by_key[key] = expense_by_key.get(key, 0) + _amount(row)

    if period == "hoy":
        keys: list[Any] = list(range(now.hour + 1))
        labels = [f"{hour:02d}:00" for hour in keys]
    elif period == "semana":
        monday = now.date() - timedelta(days=now.weekday())
        keys = [monday + timedelta(days=offset) for offset in range(7)]
        labels = [f"{WEEKDAY_LABELS[key.weekday()]} {key.day:02d}" for key in keys]
    elif period == "mes":
        keys = [date(now.year, now.month, day) for day in range(1, now.day + 1)]
        labels = [f"{key.day:02d}" for key in keys]
    else:
        dates = [
            _as_colombia_datetime(row["fecha"]).date()
            for row in ingresos + salidas
        ]
        start = min(dates) if dates else now.date()
        end = max(max(dates), now.date()) if dates else now.date()
        keys = _month_span(start, end)
        labels = [f"{MONTH_LABELS[month - 1]} {year}" for year, month in keys]

    return DashboardTimeSeries(
        labels=labels,
        ingresos=[income_by_key.get(key, 0) for key in keys],
        salidas=[expense_by_key.get(key, 0) for key in keys],
    )


@router.get("/resumen", response_model=DashboardSummary)
def dashboard_summary(
    client: Client = Depends(get_authenticated_client),
    movimientos_offset: Annotated[int, Query(ge=0)] = 0,
    movimientos_limit: Annotated[int, Query(ge=1, le=100)] = 6,
    periodo: Literal["hoy", "semana", "mes", "todos"] = "todos",
) -> DashboardSummary:
    ingresos = _fetch_all_rows(
        client,
        "ingresos",
        "id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,cliente_referencia",
    )
    salidas = _fetch_all_rows(
        client,
        "salidas",
        "id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,proveedor",
    )

    now = datetime.now(COLOMBIA_TZ)
    current_key = (now.year, now.month)
    income_by_month: dict[tuple[int, int], int] = {}
    expense_by_month: dict[tuple[int, int], int] = {}
    income_current_month = 0
    expense_current_month = 0

    for row in ingresos:
        key = _month_key(row["fecha"])
        amount = _amount(row)
        income_by_month[key] = income_by_month.get(key, 0) + amount
        if key == current_key:
            income_current_month += amount

    for row in salidas:
        key = _month_key(row["fecha"])
        amount = _amount(row)
        expense_by_month[key] = expense_by_month.get(key, 0) + amount
        if key == current_key:
            expense_current_month += amount

    total_income = sum(income_by_month.values())
    total_expenses = sum(expense_by_month.values())
    period_start, previous_start, previous_end = _period_bounds(periodo, now)
    period_ingresos = [row for row in ingresos if _in_period(row, period_start, now)]
    period_salidas = [row for row in salidas if _in_period(row, period_start, now)]
    previous_ingresos = [
        row for row in ingresos
        if previous_start is not None
        and previous_end is not None
        and _in_period(row, previous_start, previous_end)
        and _as_colombia_datetime(row["fecha"]) < previous_end
    ]
    previous_salidas = [
        row for row in salidas
        if previous_start is not None
        and previous_end is not None
        and _in_period(row, previous_start, previous_end)
        and _as_colombia_datetime(row["fecha"]) < previous_end
    ]
    period_income = sum(_amount(row) for row in period_ingresos)
    period_expenses = sum(_amount(row) for row in period_salidas)
    previous_income = sum(_amount(row) for row in previous_ingresos)
    previous_expenses = sum(_amount(row) for row in previous_salidas)
    period_margin = (
        round((period_income - period_expenses) / period_income * 100, 2)
        if period_income
        else 0.0
    )

    expense_by_category: dict[str, int] = {}
    for row in period_salidas:
        category = str(row["categoria"])
        expense_by_category[category] = expense_by_category.get(category, 0) + _amount(row)
    category_order = [category.value for category in SalidaCategoria]
    distribution_labels = [
        category for category in category_order if expense_by_category.get(category, 0) > 0
    ]
    distribution_data = [expense_by_category[category] for category in distribution_labels]

    movements: list[DashboardMovement] = []
    for row in period_ingresos:
        movements.append(
            DashboardMovement(
                id=row["id"],
                tipo="ingreso",
                concepto=row["concepto"],
                categoria=row["categoria"],
                metodo_pago=row["metodo_pago"],
                monto_cop=_amount(row),
                fecha=_as_colombia_datetime(row["fecha"]),
                referencia=row.get("comprobante") or row.get("cliente_referencia"),
            )
        )
    for row in period_salidas:
        movements.append(
            DashboardMovement(
                id=row["id"],
                tipo="salida",
                concepto=row["concepto"],
                categoria=row["categoria"],
                metodo_pago=row["metodo_pago"],
                monto_cop=_amount(row),
                fecha=_as_colombia_datetime(row["fecha"]),
                referencia=row.get("comprobante") or row.get("proveedor"),
            )
        )
    movements.sort(
        key=lambda movement: (movement.fecha, str(movement.id)),
        reverse=True,
    )

    return DashboardSummary(
        kpis=DashboardKPIs(
            balance_total_neto=total_income - total_expenses,
            total_ingresos_mes_actual=income_current_month,
            variacion_ingresos_porcentaje=_variation(period_income, previous_income),
            total_salidas_mes_actual=expense_current_month,
            margen_operativo_porcentaje=(
                round((income_current_month - expense_current_month) / income_current_month * 100, 2)
                if income_current_month
                else 0.0
            ),
            balance_periodo_neto=period_income - period_expenses,
            total_ingresos_periodo=period_income,
            variacion_salidas_porcentaje=_variation(period_expenses, previous_expenses),
            total_salidas_periodo=period_expenses,
            margen_periodo_porcentaje=period_margin,
        ),
        serie_temporal=_series(periodo, period_ingresos, period_salidas, now),
        distribucion_salidas=DashboardExpenseDistribution(
            labels=distribution_labels,
            data=distribution_data,
        ),
        total_movimientos=len(movements),
        ultimos_movimientos=movements[
            movimientos_offset : movimientos_offset + movimientos_limit
        ],
    )
