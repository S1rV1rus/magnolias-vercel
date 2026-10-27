-- ============================================================================
-- 02_cerrar_accesos_publicos.sql — MODIFICA PERMISOS. No toca ningún dato.
--
-- Problema: la clave pública de Supabase (rol "anon") viaja dentro del JS de
-- la web, así que cualquiera puede usarla. Hoy, con esa clave sola y sin
-- loguearse, se puede:
--   * leer nombre, teléfono y turnos de pacientes con las funciones del bot
--     wsp_buscar_paciente, wsp_pacientes_para_mapear y wsp_turnos_para_recordar
--     (son SECURITY DEFINER: saltean las reglas RLS);
--   * leer las vistas wsp_recordatorios_manana y wsp_recordatorios_sin_avisar
--     (pacientes, teléfonos y servicios; también saltean RLS);
--   * marcar recordatorios como enviados, cambiar a qué contacto de ManyChat
--     va cada teléfono o borrar derivaciones (wsp_marcar_*, wsp_map_*,
--     wsp_registrar_omitidos, wsp_derivaciones_vencidas);
--   * leer y borrar la tabla backup_cuponera_session_index (no tiene RLS).
--
-- Arreglo: esas funciones y vistas quedan solo para service_role (la clave
-- secreta que usa n8n). La web no usa ninguna de ellas, así que no cambia nada
-- para el staff. wsp_agendar_turno y wsp_listar_disponibilidad ya estaban así,
-- lo que indica que el bot llama con service_role.
--
-- ANTES DE CORRER: confirmá que n8n usa la clave secreta (service_role) y no la
-- pública. Ver supabase/manual/README.md, paso 3.
--
-- Cómo: Supabase → SQL Editor → New query → pegar todo → Run. Al final muestra
-- una tabla de verificación: las columnas anon y authenticated tienen que
-- quedar todas en false.
--
-- Para deshacer: el bloque "DESHACER" al final del archivo.
-- ============================================================================

begin;

-- 1. Funciones del bot: solo service_role
revoke execute on function public.wsp_buscar_paciente(text)              from public, anon, authenticated;
revoke execute on function public.wsp_pacientes_para_mapear(integer)     from public, anon, authenticated;
revoke execute on function public.wsp_turnos_para_recordar(integer)      from public, anon, authenticated;
revoke execute on function public.wsp_registrar_omitidos(integer)        from public, anon, authenticated;
revoke execute on function public.wsp_derivaciones_vencidas(integer)     from public, anon, authenticated;
revoke execute on function public.wsp_marcar_recordatorio(uuid[])        from public, anon, authenticated;
revoke execute on function public.wsp_marcar_derivacion(text)            from public, anon, authenticated;
revoke execute on function public.wsp_map_upsert(text, text)             from public, anon, authenticated;
revoke execute on function public.wsp_map_intento(text, text)            from public, anon, authenticated;

grant execute on function public.wsp_buscar_paciente(text)               to service_role;
grant execute on function public.wsp_pacientes_para_mapear(integer)      to service_role;
grant execute on function public.wsp_turnos_para_recordar(integer)       to service_role;
grant execute on function public.wsp_registrar_omitidos(integer)         to service_role;
grant execute on function public.wsp_derivaciones_vencidas(integer)      to service_role;
grant execute on function public.wsp_marcar_recordatorio(uuid[])         to service_role;
grant execute on function public.wsp_marcar_derivacion(text)             to service_role;
grant execute on function public.wsp_map_upsert(text, text)              to service_role;
grant execute on function public.wsp_map_intento(text, text)             to service_role;

-- 2. Vistas con datos de pacientes: solo service_role, y además respetan RLS
--    de quien las consulta (service_role y el SQL Editor no se ven afectados)
revoke all on public.wsp_recordatorios_manana     from anon, authenticated;
revoke all on public.wsp_recordatorios_sin_avisar from anon, authenticated;
alter view public.wsp_recordatorios_manana     set (security_invoker = true);
alter view public.wsp_recordatorios_sin_avisar set (security_invoker = true);

-- 3. Tabla de respaldo sin RLS: se activa RLS sin políticas (solo service_role)
alter table public.backup_cuponera_session_index enable row level security;
revoke all on public.backup_cuponera_session_index from anon, authenticated;

-- 4. Que las funciones nuevas no queden abiertas a anon por defecto (así se
--    abrieron estas). Postgres da EXECUTE a PUBLIC en forma global, por eso
--    hacen falta las dos líneas. Los usuarios logueados (authenticated) siguen
--    recibiéndolo por defecto, para las funciones que use la web.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

commit;

-- Verificación: anon y authenticated en false; service_role en true
select 'función ' || p.proname as objeto,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute')  as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and p.prorettype <> 'trigger'::regtype
union all
select 'tabla/vista ' || c.relname,
       has_table_privilege('anon', c.oid, 'select'),
       has_table_privilege('authenticated', c.oid, 'select'),
       has_table_privilege('service_role', c.oid, 'select')
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('wsp_recordatorios_manana', 'wsp_recordatorios_sin_avisar',
                    'backup_cuponera_session_index')
order by 1;

-- ============================================================================
-- DESHACER (solo si algo del bot deja de funcionar): copiar a una query nueva
-- el bloque de abajo, sacarle los "-- " del principio de cada línea y correrlo.
-- ============================================================================
-- begin;
-- grant execute on function public.wsp_buscar_paciente(text)          to anon, authenticated;
-- grant execute on function public.wsp_pacientes_para_mapear(integer) to anon, authenticated;
-- grant execute on function public.wsp_turnos_para_recordar(integer)  to anon, authenticated;
-- grant execute on function public.wsp_registrar_omitidos(integer)    to anon, authenticated;
-- grant execute on function public.wsp_derivaciones_vencidas(integer) to anon, authenticated;
-- grant execute on function public.wsp_marcar_recordatorio(uuid[])    to anon, authenticated;
-- grant execute on function public.wsp_marcar_derivacion(text)        to anon, authenticated;
-- grant execute on function public.wsp_map_upsert(text, text)         to anon, authenticated;
-- grant execute on function public.wsp_map_intento(text, text)        to anon, authenticated;
-- alter view public.wsp_recordatorios_manana     reset (security_invoker);
-- alter view public.wsp_recordatorios_sin_avisar reset (security_invoker);
-- grant all on public.wsp_recordatorios_manana     to anon, authenticated;
-- grant all on public.wsp_recordatorios_sin_avisar to anon, authenticated;
-- alter table public.backup_cuponera_session_index disable row level security;
-- grant all on public.backup_cuponera_session_index to anon, authenticated;
-- alter default privileges for role postgres grant execute on functions to public;
-- alter default privileges for role postgres in schema public grant execute on functions to anon;
-- commit;
