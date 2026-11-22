create table if not exists public.ingresos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    concepto text not null check (char_length(btrim(concepto)) between 1 and 500),
    monto_cop bigint not null check (monto_cop > 0),
    categoria text not null check (
        categoria in (
            'Perfumes Originales',
            'Perfumes 1.1',
            'Replicas',
            'Otro'
        )
    ),
    metodo_pago text not null check (char_length(btrim(metodo_pago)) between 1 and 100),
    comprobante text check (comprobante is null or char_length(comprobante) <= 120),
    cliente_referencia text check (
        cliente_referencia is null or char_length(cliente_referencia) <= 200
    ),
    fecha timestamptz not null,
    created_at timestamptz not null default now()
);

create table if not exists public.salidas (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    concepto text not null check (char_length(btrim(concepto)) between 1 and 500),
    monto_cop bigint not null check (monto_cop > 0),
    categoria text not null check (
        categoria in (
            'Reabastecimiento de Inventario / Fragancias',
            'Alquiler de Local / Sucursal',
            'Servicios Públicos (Luz, Agua, Internet)',
            'Nómina / Salarios',
            'Empaque y Presentación (Cajas, Bolsas)',
            'Publicidad y Marketing',
            'Otro'
        )
    ),
    metodo_pago text not null check (char_length(btrim(metodo_pago)) between 1 and 100),
    proveedor text check (proveedor is null or char_length(proveedor) <= 200),
    comprobante text check (comprobante is null or char_length(comprobante) <= 120),
    fecha timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists ingresos_user_fecha_idx
    on public.ingresos (user_id, fecha desc);
create index if not exists salidas_user_fecha_idx
    on public.salidas (user_id, fecha desc);
create index if not exists salidas_user_categoria_fecha_idx
    on public.salidas (user_id, categoria, fecha desc);

alter table public.ingresos enable row level security;
alter table public.salidas enable row level security;

drop policy if exists ingresos_select_own on public.ingresos;
create policy ingresos_select_own on public.ingresos
    for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ingresos_insert_own on public.ingresos;
create policy ingresos_insert_own on public.ingresos
    for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists ingresos_update_own on public.ingresos;
create policy ingresos_update_own on public.ingresos
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
drop policy if exists ingresos_delete_own on public.ingresos;
create policy ingresos_delete_own on public.ingresos
    for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists salidas_select_own on public.salidas;
create policy salidas_select_own on public.salidas
    for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists salidas_insert_own on public.salidas;
create policy salidas_insert_own on public.salidas
    for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists salidas_update_own on public.salidas;
create policy salidas_update_own on public.salidas
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
drop policy if exists salidas_delete_own on public.salidas;
create policy salidas_delete_own on public.salidas
    for delete to authenticated using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.ingresos to authenticated;
grant select, insert, update, delete on public.salidas to authenticated;
