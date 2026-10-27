-- ============================================================================
-- 01_diagnostico.sql — SOLO LECTURA: no crea, modifica ni borra nada.
--
-- Para qué: el repo no tiene el esquema base de la base (tablas, políticas RLS,
-- funciones wsp_* del bot, buckets). Con esto se ve el estado real antes de
-- escribir cualquier cambio.
--
-- Cómo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Devuelve UNA celda (columna "diagnostico") con un JSON. Copiala entera
-- (botón de copiar de la celda, o "Export → CSV") y pegala en el chat.
--
-- No incluye datos personales: ni nombres, ni emails, ni teléfonos. Solo
-- estructura, conteos e IDs internos (UUID).
-- ============================================================================

select jsonb_build_object(

  -- Tablas, si tienen RLS activo y cuántas filas tienen (aproximado)
  'tablas', (
    select jsonb_agg(jsonb_build_object(
             'tabla', c.relname,
             'rls', c.relrowsecurity,
             'filas_aprox', c.reltuples::bigint
           ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),

  -- Columnas de cada tabla: "nombre tipo [not null] [default ...]"
  'columnas', (
    select jsonb_object_agg(table_name, cols)
    from (
      select table_name,
             jsonb_agg(
               column_name || ' ' || data_type
               || case when is_nullable = 'NO' then ' not null' else '' end
               || coalesce(' default ' || column_default, '')
               order by ordinal_position
             ) as cols
      from information_schema.columns
      where table_schema = 'public'
      group by table_name
    ) t
  ),

  -- Claves foráneas, únicas, checks y exclusiones
  'constraints', (
    select jsonb_agg(jsonb_build_object(
             'tabla', conrelid::regclass::text,
             'nombre', conname,
             'def', pg_get_constraintdef(oid)
           ) order by conrelid::regclass::text, conname)
    from pg_constraint
    where connamespace = 'public'::regnamespace and contype in ('f', 'u', 'c', 'x')
  ),

  'indices', (
    select jsonb_agg(indexdef order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public'
  ),

  -- Políticas RLS de las tablas y del storage (fotos de pacientes)
  'politicas', (
    select jsonb_agg(jsonb_build_object(
             'schema', schemaname,
             'tabla', tablename,
             'nombre', policyname,
             'cmd', cmd,
             'roles', roles,
             'using', qual,
             'check', with_check
           ) order by schemaname, tablename, policyname)
    from pg_policies
    where schemaname in ('public', 'storage')
  ),

  -- Qué puede hacer el rol "anon" (cualquiera con la clave pública de la web)
  'grants_anon', (
    select jsonb_agg(distinct table_name || ':' || privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
  ),

  -- Funciones (RPC): si corren con permisos de dueño y si anon las puede llamar
  'funciones', (
    select jsonb_agg(jsonb_build_object(
             'nombre', p.proname,
             'args', pg_get_function_identity_arguments(p.oid),
             'retorna', pg_get_function_result(p.oid),
             'security_definer', p.prosecdef,
             'ejecutable_por_anon', has_function_privilege('anon', p.oid, 'execute')
           ) order by p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  ),

  -- Código de las funciones del bot (wsp_*) y de las funciones de triggers
  'definiciones', (
    select jsonb_object_agg(
             p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
             pg_get_functiondef(p.oid)
           )
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and (p.proname like 'wsp\_%' or p.prorettype = 'trigger'::regtype)
  ),

  'triggers', (
    select jsonb_agg(jsonb_build_object(
             'tabla', t.tgrelid::regclass::text,
             'nombre', t.tgname,
             'def', pg_get_triggerdef(t.oid)
           ) order by t.tgrelid::regclass::text, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  ),

  'buckets', (
    select jsonb_agg(jsonb_build_object(
             'id', id,
             'publico', public,
             'limite_bytes', file_size_limit
           ))
    from storage.buckets
  ),

  'extensiones', (
    select jsonb_agg(extname || ' ' || extversion order by extname)
    from pg_extension
  ),

  -- Usuarios del sistema por rol (solo conteos)
  'usuarios_por_rol', (
    select jsonb_object_agg(coalesce(rol, '(sin rol)'), n)
    from (
      select raw_app_meta_data ->> 'role' as rol, count(*) as n
      from auth.users
      group by 1
    ) t
  ),

  -- Pares de turnos activos que se superponen en la misma sala. Si hay, hay que
  -- resolverlos antes de agregar la restricción en la base que lo impide.
  'turnos_superpuestos_misma_sala', (
    select count(*)
    from appointments a
    join appointments b
      on a.room_id = b.room_id
     and a.id < b.id
     and a.start_time < b.end_time
     and b.start_time < a.end_time
    where a.status not in ('cancelado', 'cancelado_tarde')
      and b.status not in ('cancelado', 'cancelado_tarde')
  ),

  -- Posibles deudas saldadas con el monto repetido (bug de "Saldar deuda" ya
  -- corregido en el front): turnos del mismo paciente con el mismo comprobante y
  -- el mismo monto. Solo IDs, para revisar antes de corregir nada.
  'deudas_saldadas_sospechosas', (
    select jsonb_agg(g)
    from (
      select ap.patient_id,
             a.payment_amount,
             a.receipt_number,
             count(*) as turnos,
             jsonb_agg(a.id) as turno_ids
      from appointments a
      join appointment_patients ap on ap.appointment_id = a.id
      where a.payment_amount is not null
        and a.receipt_number is not null
        and a.cuponera_id is null
      group by ap.patient_id, a.payment_amount, a.receipt_number
      having count(*) > 1
    ) g
  )

) as diagnostico;
