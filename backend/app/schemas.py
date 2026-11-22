import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)


class IngresoCategoria(str, Enum):
    PERFUMES_ORIGINALES = "Perfumes Originales"
    PERFUMES_11 = "Perfumes 1.1"
    REPLICAS = "Replicas"
    OTRO = "Otro"


class SalidaCategoria(str, Enum):
    INVENTARIO = "Reabastecimiento de Inventario / Fragancias"
    ALQUILER = "Alquiler de Local / Sucursal"
    SERVICIOS = "Servicios Públicos (Luz, Agua, Internet)"
    NOMINA = "Nómina / Salarios"
    EMPAQUE = "Empaque y Presentación (Cajas, Bolsas)"
    MARKETING = "Publicidad y Marketing"
    OTRO = "Otro"


COPAmount = Annotated[StrictInt, Field(gt=0)]


class TransactionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    concepto: StrictStr = Field(min_length=1, max_length=500)
    monto_cop: COPAmount
    fecha: datetime

    @field_validator("concepto", mode="before")
    @classmethod
    def clean_concept(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("fecha")
    @classmethod
    def set_colombia_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone(timedelta(hours=-5)))
        return value


class IngresoWrite(TransactionWrite):
    categoria: IngresoCategoria
    metodo_pago: StrictStr = Field(min_length=1, max_length=100)
    comprobante: StrictStr | None = Field(default=None, max_length=120)
    cliente_referencia: StrictStr | None = Field(default=None, max_length=200)

    @field_validator("metodo_pago", mode="before")
    @classmethod
    def clean_payment_method(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("comprobante", "cliente_referencia", mode="before")
    @classmethod
    def clean_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class SalidaWrite(TransactionWrite):
    categoria: SalidaCategoria
    metodo_pago: StrictStr = Field(min_length=1, max_length=100)
    proveedor: StrictStr | None = Field(default=None, max_length=200)
    comprobante: StrictStr | None = Field(default=None, max_length=120)

    @field_validator("metodo_pago", mode="before")
    @classmethod
    def clean_payment_method(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("proveedor", "comprobante", mode="before")
    @classmethod
    def clean_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class IngresoRead(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    concepto: str
    monto_cop: int
    categoria: IngresoCategoria
    metodo_pago: str
    comprobante: str | None = None
    cliente_referencia: str | None = None
    fecha: datetime
    created_at: datetime


class SalidaRead(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    concepto: str
    monto_cop: int
    categoria: SalidaCategoria
    metodo_pago: str
    proveedor: str | None = None
    comprobante: str | None = None
    fecha: datetime
    created_at: datetime


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: StrictStr = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=256)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Debe ser un correo electrónico válido.")
        return value


class PublicUser(BaseModel):
    id: UUID
    email: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int | None = None
    user: PublicUser


class DashboardKPIs(BaseModel):
    balance_total_neto: int
    total_ingresos_mes_actual: int
    variacion_ingresos_porcentaje: float | None
    total_salidas_mes_actual: int
    margen_operativo_porcentaje: float
    balance_periodo_neto: int
    total_ingresos_periodo: int
    variacion_salidas_porcentaje: float | None
    total_salidas_periodo: int
    margen_periodo_porcentaje: float


class DashboardTimeSeries(BaseModel):
    labels: list[str]
    ingresos: list[int]
    salidas: list[int]

    @model_validator(mode="after")
    def validate_series_lengths(self) -> "DashboardTimeSeries":
        if len(self.labels) != len(self.ingresos) or len(self.labels) != len(self.salidas):
            raise ValueError("Las etiquetas y series temporales deben tener igual longitud.")
        return self


class DashboardExpenseDistribution(BaseModel):
    labels: list[str]
    data: list[int]

    @model_validator(mode="after")
    def validate_distribution_lengths(self) -> "DashboardExpenseDistribution":
        if len(self.labels) != len(self.data):
            raise ValueError("Las categorías y montos deben tener igual longitud.")
        return self


class DashboardMovement(BaseModel):
    id: UUID
    tipo: Literal["ingreso", "salida"]
    concepto: str
    categoria: str
    metodo_pago: str
    monto_cop: int
    fecha: datetime
    referencia: str | None = None


class DashboardSummary(BaseModel):
    kpis: DashboardKPIs
    serie_temporal: DashboardTimeSeries
    distribucion_salidas: DashboardExpenseDistribution
    total_movimientos: int = Field(ge=0)
    ultimos_movimientos: list[DashboardMovement]
