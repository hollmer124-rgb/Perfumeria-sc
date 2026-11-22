alter table public.ingresos
    drop constraint if exists ingresos_categoria_check;

update public.ingresos
set categoria = 'Otro'
where categoria = 'otro';

alter table public.ingresos
    add constraint ingresos_categoria_check check (
        categoria in (
            'Perfumes Originales',
            'Perfumes 1.1',
            'Replicas',
            'Otro'
        )
    );

notify pgrst, 'reload schema';
