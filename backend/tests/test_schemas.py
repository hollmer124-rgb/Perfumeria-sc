import unittest

from pydantic import ValidationError

from app.schemas import (
    IngresoCategoria,
    IngresoWrite,
    SalidaCategoria,
    SalidaWrite,
)


class TransactionSchemaTests(unittest.TestCase):
    def test_income_categories_match_current_options(self) -> None:
        self.assertEqual(
            [category.value for category in IngresoCategoria],
            [
                "Perfumes Originales",
                "Perfumes 1.1",
                "Replicas",
                "Otro",
            ],
        )
        self.assertEqual(
            [category.value for category in SalidaCategoria],
            [
                "Reabastecimiento de Inventario / Fragancias",
                "Alquiler de Local / Sucursal",
                "Servicios Públicos (Luz, Agua, Internet)",
                "Nómina / Salarios",
                "Empaque y Presentación (Cajas, Bolsas)",
                "Publicidad y Marketing",
                "Otro",
            ],
        )

    def test_income_requires_positive_integer_amount_and_exact_category(self) -> None:
        ingreso = IngresoWrite(
            concepto="  Venta de fragancia  ",
            monto_cop=150_000,
            categoria="Perfumes Originales",
            metodo_pago=" Efectivo ",
            fecha="2025-10-24T15:30:00",
        )

        self.assertEqual(ingreso.concepto, "Venta de fragancia")
        self.assertEqual(ingreso.metodo_pago, "Efectivo")
        self.assertEqual(ingreso.categoria.value, "Perfumes Originales")
        self.assertEqual(ingreso.fecha.utcoffset().total_seconds(), -18_000)

        for invalid_amount in (0, -1, True, "150000", 150_000.0):
            with self.subTest(amount=invalid_amount):
                with self.assertRaises(ValidationError):
                    IngresoWrite(
                        concepto="Venta",
                        monto_cop=invalid_amount,
                        categoria="Otro",
                        metodo_pago="Efectivo",
                        fecha="2025-10-24T15:30:00",
                    )

        for legacy_category in (
            "Venta directa en tienda",
            "Encargo especial",
            "Venta online",
            "otro",
            "venta-online",
        ):
            with self.subTest(category=legacy_category):
                with self.assertRaises(ValidationError):
                    IngresoWrite(
                        concepto="Venta",
                        monto_cop=1,
                        categoria=legacy_category,
                        metodo_pago="Efectivo",
                        fecha="2025-10-24T15:30:00",
                    )

    def test_income_accepts_each_new_category(self) -> None:
        for category in ("Perfumes Originales", "Perfumes 1.1", "Replicas", "Otro"):
            with self.subTest(category=category):
                ingreso = IngresoWrite(
                    concepto="Venta de fragancia",
                    monto_cop=150_000,
                    categoria=category,
                    metodo_pago="Efectivo",
                    fecha="2025-10-24T15:30:00",
                )
                self.assertEqual(ingreso.categoria.value, category)

    def test_expense_requires_a_canonical_category_including_other(self) -> None:
        expense = SalidaWrite(
            concepto="Compra de esencias",
            monto_cop=1,
            categoria=SalidaCategoria.OTRO,
            metodo_pago="Caja menor / Efectivo",
            fecha="2025-10-24T15:30:00",
        )

        self.assertEqual(expense.categoria.value, "Otro")

        with self.assertRaises(ValidationError):
            SalidaWrite(
                concepto="Compra de esencias",
                monto_cop=1,
                categoria="inventario",
                metodo_pago="Caja menor / Efectivo",
                fecha="2025-10-24T15:30:00",
            )


if __name__ == "__main__":
    unittest.main()
