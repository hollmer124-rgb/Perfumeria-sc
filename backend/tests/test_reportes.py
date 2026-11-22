import unittest
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import patch

from openpyxl import load_workbook

from app.routers.reportes import EXCEL_MEDIA_TYPE, _build_workbook, export_excel
from app.schemas import SalidaCategoria


class ReportWorkbookTests(unittest.TestCase):
    def test_builds_three_sheets_with_linked_totals_and_category_formulas(self) -> None:
        generated_at = datetime(2026, 11, 21, 12, 0, tzinfo=timezone(timedelta(hours=-5)))
        ingresos = [
            {
                "fecha": "2026-11-20T14:30:00-05:00",
                "concepto": "Venta perfume",
                "categoria": "Perfumes Originales",
                "metodo_pago": "Efectivo",
                "comprobante": "F-100",
                "monto_cop": 150_000,
            },
        ]
        salidas = [
            {
                "fecha": "2026-11-19T09:00:00-05:00",
                "concepto": "Compra de frascos",
                "categoria": SalidaCategoria.INVENTARIO.value,
                "proveedor": "Proveedor SC",
                "metodo_pago": "Transferencia",
                "comprobante": "E-100",
                "monto_cop": 50_000,
            },
        ]

        workbook_bytes = _build_workbook(ingresos, salidas, "Todo el historial", generated_at)
        workbook = load_workbook(workbook_bytes, data_only=False)

        self.assertEqual(workbook.sheetnames, ["Resumen Ejecutivo", "Ingresos", "Salidas"])
        summary = workbook["Resumen Ejecutivo"]
        income_sheet = workbook["Ingresos"]
        expense_sheet = workbook["Salidas"]
        self.assertEqual(summary["A1"].value, "Perfumería SC — Reporte Financiero")
        self.assertEqual(summary["B3"].value, "Todo el historial")
        self.assertEqual(income_sheet["F3"].value, "=SUM(F2:F2)")
        self.assertEqual(expense_sheet["G3"].value, "=SUM(G2:G2)")
        self.assertEqual(summary["B6"].value, "=SUM(Ingresos!F2:F2)")
        self.assertEqual(summary["B7"].value, "=SUM(Salidas!G2:G2)")
        self.assertEqual(summary["B8"].value, "=B6-B7")
        self.assertTrue(summary["B13"].value.startswith("=SUMIF("))
        self.assertEqual(income_sheet["F2"].number_format, "$ #,##0")
        self.assertEqual(summary["B9"].number_format, "0.00%")
        self.assertEqual(income_sheet["A1"].fill.fgColor.rgb[-6:], "0F766E")
        self.assertEqual(summary.max_row, 18)

    def test_empty_tables_keep_non_circular_total_formulas(self) -> None:
        workbook_bytes: BytesIO = _build_workbook(
            [],
            [],
            "Todo el historial",
            datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc),
        )
        workbook = load_workbook(workbook_bytes, data_only=False)

        self.assertEqual(workbook["Ingresos"]["F3"].value, "=SUM(F2:F2)")
        self.assertEqual(workbook["Salidas"]["G3"].value, "=SUM(G2:G2)")

    def test_export_endpoint_streams_xlsx_and_passes_date_range_to_both_queries(self) -> None:
        start = date(2026, 11, 1)
        end = date(2026, 11, 21)
        with patch("app.routers.reportes._fetch_all_rows", side_effect=[[], []]) as fetch:
            response = export_excel(object(), fecha_inicio=start, fecha_fin=end)

        self.assertEqual(response.media_type, EXCEL_MEDIA_TYPE)
        self.assertIn('filename="Reporte_Perfumeria_SC_', response.headers["content-disposition"])
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(fetch.call_args_list[0].args[2:], ("id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,cliente_referencia", start, end))
        self.assertEqual(fetch.call_args_list[1].args[2:], ("id,fecha,concepto,monto_cop,categoria,metodo_pago,comprobante,proveedor", start, end))


if __name__ == "__main__":
    unittest.main()
