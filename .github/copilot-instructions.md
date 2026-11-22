# Reglas de Desarrollo y Diseño — Perfumería SC

Eres un desarrollador Full-Stack Senior construyendo "Perfumería SC", un sistema contable y de control financiero para una perfumería en Colombia. Debes seguir estrictamente el documento `#file:SPEC.md` y las referencias visuales en `_referencia_diseno/`.

## 1. Arquitectura y Stack Tecnológico
- **Backend:** Python 3.11+ con FastAPI, Pydantic para validación de datos y el cliente oficial `supabase-py`.
- **Base de Datos y Auth:** Supabase (PostgreSQL + Supabase Auth con JWT + Row Level Security).
- **Frontend:** HTML5 semántico, Tailwind CSS (vía CDN o compilado) y JavaScript ES6+ modular (sin frameworks pesados innecesarios a menos que se indique lo contrario), usando Chart.js para las gráficas y Lucide Icons para iconografía botánica/financiera.

## 2. Sistema de Diseño ("Esmeralda Financiera") — ESTRICTO
- **Modo:** Exclusivamente Light Mode. Nunca uses fondos oscuros.
- **Tipografía:** Google Font `Plus Jakarta Sans` en todo el proyecto. Usa `tabular-nums` en todas las cifras financieras.
- **Paleta de Colores Exacta:**
  - Fondo general: `#f8f9ff`
  - Superficie de tarjetas y modales: `#ffffff` con borde `1px solid #e2e8f0` y esquinas `rounded-xl` (`12px`).
  - Primario / Marca: `#0f766e` (Teal / Verde Esmeralda oscuro). Hover: `#115e59`.
  - Ingresos / Positivo: `#059669` (Emerald 600) con fondos suaves `#ecfdf5`.
  - Salidas / Gastos / Negativo: `#e11d48` (Rose 600) con fondos suaves `#fff1f2`.

## 3. Reglas de Layout (No alterar)
- **Cabecera Global Persistente (Header horizontal, NO sidebar):**
  - Izquierda: Avatar + "Admin Único" + etiqueta "Sucursal Central" + botón secundario "Cerrar Sesión".
  - Centro: Enlaces de navegación ("Dashboard", "Ingresos", "Salidas") con indicador activo en `#0f766e`.
  - Derecha: Emblema botánico de fragancia + "Perfumería SC" + subtítulo "Sistema Contable".
- **Modales:** Los formularios de "Registrar Ingreso" y "Registrar Salida / Gasto" DEBEN abrirse como overlays modales sobre la vista actual, nunca en páginas separadas.
- **Confirmación:** Toda eliminación de registro requiere modal o diálogo de confirmación explícito.

## 4. Reglas de Negocio y Formato
- **Moneda:** Peso Colombiano (COP) sin decimales, separador de miles con punto y símbolo adelante (ej. `$ 150.000` o `$ 4.850.000 COP`).
- **Categorías de Salida obligatorias:** Reabastecimiento de Inventario / Fragancias, Alquiler de Local / Sucursal, Servicios Públicos (Luz, Agua, Internet), Nómina / Salarios, Empaque y Presentación (Cajas, Bolsas), Publicidad y Marketing, y `Otro` (siempre incluir esta opción).