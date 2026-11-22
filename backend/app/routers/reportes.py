from datetime import date, datetime, time, timedelta, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from supabase import Client

from app.database import execute_query, get_authenticated_client
from app.routers.common import apply_date_range
from app.schemas import SalidaCategoria


router = APIRouter(prefix="/api/reportes", tags=["Reportes"])
COLOMBIA_TZ = timezone(timedelta(hours=-5))
PAGE_SIZE = 1000
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
BRAND_GREEN = "0F766E"
SUBTLE_BORDER = "E2E8F0"
MONEY_FORMAT = "$ #,##0"


def _fetch_all_rows(
    client: Client,
    table: str,
    columns: str,
    fecha_inicio: date | None,
    fecha_fin: date | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = apply_date_range(
            client.table(table).select(columns),
            fecha_inicio,
            fecha_fin,
        )
        response = execute_query(
            query.order("fecha", desc=True)
            .order("id", desc=True)
            .range(offset, offset + PAGE_SIZE - 1)
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def _safe_text(value: Any) -> str:
    if hasattr(value, "value"):
        value = value.value
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def _excel_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.min)
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("Supabase devolvió una fecha con formato inválido.")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=COLOMBIA_TZ)
    return parsed.astimezone(COLOMBIA_TZ).replace(tzinfo=None)


def _style_table_header(sheet: Any, row: int, columns: int) -> None:
    fill = PatternFill(fill_type="solid", fgColor=BRAND_GREEN)
    font = Font(color="FFFFFF", bold=True)
    border = Border(
        left=Side(style="thin", color=SUBTLE_BORDER),
        right=Side(style="thin", color=SUBTLE_BORDER),
        top=Side(style="thin", color=SUBTLE_BORDER),
        bottom=Side(style="thin", color=SUBTLE_BORDER),
    )
    for column in range(1, columns + 1):
        cell = sheet.cell(row=row, column=column)
        cell.fill = fill
        cell.font = font
        cell.border = border
        cell.alignment = Alignment(vertical="center")


def _style_sheet_borders(sheet: Any) -> None:
    border = Border(
        left=Side(style="thin", color=SUBTLE_BORDER),
        right=Side(style="thin", color=SUBTLE_BORDER),
        top=Side(style="thin", color=SUBTLE_BORDER),
        bottom=Side(style="thin", color=SUBTLE_BORDER),
    )
    for row in sheet.iter_rows():
        for cell in row:
            if cell.value is not None:
                cell.border = border
                cell.alignment = Alignment(vertical="center", wrap_text=True)


def _auto_fit_columns(sheet: Any) -> None:
    for column_cells in sheet.columns:
        column_letter = get_column_letter(column_cells[0].column)
        content_width = max(
            (len(str(cell.value)) for cell in column_cells if cell.value is not None),
            default=0,
        )
        sheet.column_dimensions[column_letter].width = min(max(content_width + 3, 12), 60)


def _write_transaction_sheet(
    sheet: Any,
    headers: list[str],
    row_values: list[list[Any]],
    money_column: int,
) -> int:
    sheet.append(headers)
    _style_table_header(sheet, 1, len(headers))
    sheet.freeze_panes = "A2"

    for values in row_values:
        sheet.append(values)
        sheet.cell(row=sheet.max_row, column=1).number_format = "dd/mm/yyyy hh:mm"
        sheet.cell(row=sheet.max_row, column=money_column).number_format = MONEY_FORMAT

    total_row = max(3, len(row_values) + 2)
    sheet.cell(row=total_row, column=1, value="TOTAL")
    amount_column = get_column_letter(money_column)
    sheet.cell(
        row=total_row,
        column=money_column,
        value=f"=SUM({amount_column}2:{amount_column}{total_row - 1})",
    )
    sheet.cell(row=total_row, column=money_column).number_format = MONEY_FORMAT
    for cell in sheet[total_row]:
        cell.font = Font(bold=True)
        cell.border = Border(top=Side(style="thin", color=SUBTLE_BORDER))
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(row_values) + 1}"
    return total_row


def _build_workbook(
    ingresos: list[dict[str, Any]],
    salidas: list[dict[str, Any]],
    period_description: str,
    generated_at: datetime,
) -> BytesIO:
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Resumen Ejecutivo"
    income_sheet = workbook.create_sheet("Ingresos")
    expense_sheet = workbook.create_sheet("Salidas")

    income_rows = [
        [
            _excel_datetime(row["fecha"]),
            _safe_text(row["concepto"]),
            _safe_text(row["categoria"]),
            _safe_text(row["metodo_pago"]),
            _safe_text(row.get("comprobante")),
            int(row.get("monto_cop") or 0),
        ]
        for row in ingresos
    ]
    expense_rows = [
        [
            _excel_datetime(row["fecha"]),
            _safe_text(row["concepto"]),
            _safe_text(row["categoria"]),
            _safe_text(row.get("proveedor")),
            _safe_text(row["metodo_pago"]),
            _safe_text(row.get("comprobante")),
            int(row.get("monto_cop") or 0),
        ]
        for row in salidas
    ]

    income_total_row = _write_transaction_sheet(
        income_sheet,
        ["Fecha", "Concepto", "Categoría", "Método de Pago", "Comprobante / Factura", "Monto (COP)"],
        income_rows,
        6,
    )
    expense_total_row = _write_transaction_sheet(
        expense_sheet,
        [
            "Fecha",
            "Concepto",
            "Categoría",
            "Proveedor / Beneficiario",
            "Método de Egreso",
            "Comprobante / Recibo",
            "Monto (COP)",
        ],
        expense_rows,
        7,
    )

    summary.merge_cells("A1:C1")
    summary["A1"] = "Perfumería SC — Reporte Financiero"
    summary["A1"].font = Font(color="FFFFFF", bold=True, size=16)
    summary["A1"].fill = PatternFill(fill_type="solid", fgColor=BRAND_GREEN)
    summary["A1"].alignment = Alignment(vertical="center")
    summary.row_dimensions[1].height = 30
    summary["A2"] = "Generado"
    summary["B2"] = generated_at.replace(tzinfo=None)
    summary["B2"].number_format = "dd/mm/yyyy hh:mm"
    summary["A3"] = "Período consultado"
    summary["B3"] = period_description

    summary.append([])
    summary.append(["Indicador", "Valor"])
    _style_table_header(summary, 5, 2)
    summary.append(["Total Ingresos", f"=SUM(Ingresos!F2:F{income_total_row - 1})"])
    summary.append(["Total Salidas", f"=SUM(Salidas!G2:G{expense_total_row - 1})"])
    summary.append(["Balance Neto", "=B6-B7"])
    summary.append(["Margen Operativo (%)", "=IFERROR(B8/B6,0)"])
    for row in range(6, 9):
        summary.cell(row=row, column=2).number_format = MONEY_FORMAT
    summary["B9"].number_format = "0.00%"

    summary.append([])
    summary.append(["Categoría de Salida", "Monto (COP)", "Porcentaje"])
    _style_table_header(summary, 11, 3)
    expense_last_data_row = expense_total_row - 1
    for category in SalidaCategoria:
        row_number = summary.max_row + 1
        summary.append([
            category.value,
            f"=SUMIF(Salidas!$C$2:$C${expense_last_data_row},A{row_number},Salidas!$G$2:$G${expense_last_data_row})",
            f"=IFERROR(B{row_number}/$B$7,0)",
        ])
        summary.cell(row=row_number, column=2).number_format = MONEY_FORMAT
        summary.cell(row=row_number, column=3).number_format = "0.00%"

    summary.freeze_panes = "A5"
    for sheet in workbook.worksheets:
        _style_sheet_borders(sheet)
        _auto_fit_columns(sheet)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


@router.get(
    "/excel",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {
                EXCEL_MEDIA_TYPE: {
                    "schema": {"type": "string", "format": "binary"},
                }
            }
        }
    },
)
def export_excel(
    client: Client = Depends(get_authenticated_client),
    fecha_inicio: date | None = None,
    fecha_fin: date | None = None,
) -> StreamingResponse:
    ingresos = _fetch_all_rows(
        client,
        "ingresos",
        "id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,cliente_referencia",
        fecha_inicio,
        fecha_fin,
    )
    salidas = _fetch_all_rows(
        client,
        "salidas",
        "id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,proveedor",
        fecha_inicio,
        fecha_fin,
    )

    if fecha_inicio and fecha_fin:
        period_description = f"{fecha_inicio.isoformat()} a {fecha_fin.isoformat()}"
    elif fecha_inicio:
        period_description = f"Desde {fecha_inicio.isoformat()}"
    elif fecha_fin:
        period_description = f"Hasta {fecha_fin.isoformat()}"
    else:
        period_description = "Todo el historial"

    generated_at = datetime.now(COLOMBIA_TZ)
    output = _build_workbook(ingresos, salidas, period_description, generated_at)
    filename = f"Reporte_Perfumeria_SC_{generated_at:%Y-%m-%d}.xlsx"
    return StreamingResponse(
        output,
        media_type=EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
