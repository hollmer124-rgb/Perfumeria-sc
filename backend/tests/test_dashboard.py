import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.routers.dashboard import dashboard_summary
from app.schemas import SalidaCategoria


COLOMBIA_TZ = timezone(timedelta(hours=-5))


class FakeQuery:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def select(self, _columns: str) -> "FakeQuery":
        return self

    def order(self, _column: str, desc: bool = False) -> "FakeQuery":
        return self

    def range(self, _start: int, _end: int) -> "FakeQuery":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.rows)


class FakeClient:
    def __init__(self, records: dict[str, list[dict[str, object]]]) -> None:
        self.records = records

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.records[name])


class DashboardSummaryTests(unittest.TestCase):
    def test_summary_calculates_monthly_kpis_chart_data_and_recent_activity(self) -> None:
        now = datetime.now(COLOMBIA_TZ)
        previous_day = now.date().replace(day=1) - timedelta(days=1)
        previous_month = datetime(
            previous_day.year,
            previous_day.month,
            min(previous_day.day, 15),
            12,
            tzinfo=COLOMBIA_TZ,
        )
        current_month = datetime(
            now.year,
            now.month,
            min(now.day, 15),
            12,
            tzinfo=COLOMBIA_TZ,
        )
        records = {
            "ingresos": [
                {
                    "id": "11111111-1111-4111-8111-111111111111",
                    "fecha": previous_month.isoformat(),
                    "concepto": "Venta anterior",
                    "monto_cop": 100_000,
                    "categoria": "Perfumes Originales",
                    "metodo_pago": "Efectivo",
                    "comprobante": None,
                    "cliente_referencia": None,
                },
                {
                    "id": "22222222-2222-4222-8222-222222222222",
                    "fecha": (current_month - timedelta(hours=1)).isoformat(),
                    "concepto": "Venta actual",
                    "monto_cop": 150_000,
                    "categoria": "Perfumes 1.1",
                    "metodo_pago": "Nequi / Daviplata",
                    "comprobante": "F-02",
                    "cliente_referencia": "Cliente",
                },
            ],
            "salidas": [
                {
                    "id": "33333333-3333-4333-8333-333333333333",
                    "fecha": current_month.isoformat(),
                    "concepto": "Compra de esencias",
                    "monto_cop": 50_000,
                    "categoria": SalidaCategoria.INVENTARIO.value,
                    "metodo_pago": "Transferencia empresarial",
                    "comprobante": None,
                    "proveedor": "Proveedor",
                },
            ],
        }

        summary = dashboard_summary(FakeClient(records), periodo="mes")

        self.assertEqual(summary.kpis.balance_total_neto, 200_000)
        self.assertEqual(summary.kpis.total_ingresos_mes_actual, 150_000)
        self.assertEqual(summary.kpis.variacion_ingresos_porcentaje, 50.0)
        self.assertEqual(summary.kpis.total_salidas_mes_actual, 50_000)
        self.assertEqual(summary.kpis.margen_operativo_porcentaje, 66.67)
        self.assertEqual(sum(summary.serie_temporal.ingresos), 150_000)
        self.assertEqual(sum(summary.serie_temporal.salidas), 50_000)
        self.assertEqual(summary.distribucion_salidas.data, [50_000])
        self.assertEqual(summary.kpis.total_ingresos_periodo, 150_000)
        self.assertEqual(summary.kpis.total_salidas_periodo, 50_000)
        self.assertEqual(summary.kpis.balance_periodo_neto, 100_000)
        self.assertEqual(summary.total_movimientos, 2)
        self.assertEqual(len(summary.ultimos_movimientos), 2)
        self.assertEqual(summary.ultimos_movimientos[0].tipo, "salida")

        page = dashboard_summary(
            FakeClient(records),
            movimientos_offset=1,
            movimientos_limit=1,
            periodo="mes",
        )

        self.assertEqual(len(page.ultimos_movimientos), 1)
        self.assertEqual(page.ultimos_movimientos[0].concepto, "Venta actual")
        self.assertEqual(page.total_movimientos, 2)

        history = dashboard_summary(FakeClient(records), periodo="todos")
        self.assertEqual(history.kpis.total_ingresos_periodo, 250_000)
        self.assertEqual(history.kpis.total_salidas_periodo, 50_000)
        self.assertEqual(history.kpis.balance_periodo_neto, 200_000)
        self.assertEqual(history.total_movimientos, 3)
        self.assertEqual(len(history.serie_temporal.labels), 2)

    def test_dashboard_periods_filter_movements_and_amounts(self) -> None:
        now = datetime.now(COLOMBIA_TZ)
        week_start = datetime.combine(
            now.date() - timedelta(days=now.weekday()),
            datetime.min.time(),
            tzinfo=COLOMBIA_TZ,
        )
        previous_week = week_start - timedelta(seconds=1)
        previous_month = datetime(now.year, now.month, 1, tzinfo=COLOMBIA_TZ) - timedelta(seconds=1)

        def income(number: int, fecha: datetime, amount: int) -> dict[str, object]:
            return {
                "id": f"aaaaaaaa-aaaa-4aaa-8aaa-{number:012d}",
                "fecha": fecha.isoformat(),
                "concepto": f"Ingreso {number}",
                "monto_cop": amount,
                "categoria": "Perfumes Originales",
                "metodo_pago": "Efectivo",
                "comprobante": None,
                "cliente_referencia": None,
            }

        def expense(number: int, fecha: datetime, amount: int) -> dict[str, object]:
            return {
                "id": f"bbbbbbbb-bbbb-4bbb-8bbb-{number:012d}",
                "fecha": fecha.isoformat(),
                "concepto": f"Salida {number}",
                "monto_cop": amount,
                "categoria": SalidaCategoria.INVENTARIO.value,
                "metodo_pago": "Efectivo",
                "comprobante": None,
                "proveedor": None,
            }

        records = {
            "ingresos": [
                income(1, now, 100),
                income(2, week_start, 200),
                income(3, previous_week, 300),
                income(4, previous_month, 400),
            ],
            "salidas": [
                expense(1, now, 10),
                expense(2, week_start, 20),
                expense(3, previous_week, 30),
                expense(4, previous_month, 40),
            ],
        }

        today = dashboard_summary(FakeClient(records), periodo="hoy")
        self.assertEqual(today.kpis.total_ingresos_periodo, 100 + (200 if now.weekday() == 0 else 0))
        self.assertEqual(today.kpis.total_salidas_periodo, 10 + (20 if now.weekday() == 0 else 0))
        self.assertEqual(today.total_movimientos, 2 + (2 if now.weekday() == 0 else 0))

        week = dashboard_summary(FakeClient(records), periodo="semana")
        self.assertEqual(week.kpis.total_ingresos_periodo, 300)
        self.assertEqual(week.kpis.total_salidas_periodo, 30)
        self.assertEqual(week.total_movimientos, 4)

        history = dashboard_summary(FakeClient(records), periodo="todos")
        self.assertEqual(history.kpis.total_ingresos_periodo, 1_000)
        self.assertEqual(history.kpis.total_salidas_periodo, 100)
        self.assertEqual(history.total_movimientos, 8)


if __name__ == "__main__":
    unittest.main()
