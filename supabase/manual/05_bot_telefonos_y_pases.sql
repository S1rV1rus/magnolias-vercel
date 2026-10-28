-- ============================================================================
-- 05_bot_telefonos_y_pases.sql — MODIFICA DOS FUNCIONES DEL BOT. No toca
-- ningún dato ni permiso.
--
-- 1) wsp_pacientes_para_mapear (la usa n8n para dar de alta en ManyChat a los
--    pacientes con turno próximo, que es lo que habilita los recordatorios):
--    un celular guardado con 8 dígitos sin el 0 (ej. 99123456) quedaba sin
--    número internacional y se salteaba para siempre: ese paciente nunca
--    recibía recordatorios. Ahora 8 dígitos que empiezan con 9 → +598 9xxxxxxx.
--    Los fijos de 8 dígitos (2xxx / 4xxx) se siguen salteando: no tienen
--    WhatsApp.
--
-- 2) wsp_buscar_paciente (la usa el bot cuando escribe un paciente): para los
--    pases mensuales calculaba "meses restantes = total - used_months", pero
--    used_months nunca se actualiza, así que el bot siempre decía que quedaban
--    todos los meses, incluso con el pase vencido. Ahora calcula por fecha,
--    igual que el panel (monthsProgress en src/lib/utils.ts): esconde los
--    pases vencidos y agrega "vence" (DD/MM/YYYY). El resto de la respuesta
--    queda igual; "vence" es un dato nuevo que n8n puede ignorar.
--
-- CREATE OR REPLACE conserva los permisos: siguen siendo solo de service_role
-- (script 02).
--
-- Cómo: supabase db query --linked -f supabase/manual/05_bot_telefonos_y_pases.sql
-- Al final muestra una tabla: version_nueva = true en las dos, anon = false y
-- service_role = true.
--
-- Para deshacer: correr 05_deshacer.sql (son las versiones originales,
-- copiadas tal cual de supabase/schema.sql).
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION "public"."wsp_pacientes_para_mapear"("p_dias" integer DEFAULT 7) RETURNS TABLE("phone_e164" "text", "phone_norm" "text", "nombre" "text", "apellido" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with base as (
    select distinct
      p.id,
      btrim(coalesce(p.first_name,'')) as nombre,
      btrim(coalesce(p.last_name,''))  as apellido,
      regexp_replace(coalesce(p.phone,''),'\D','','g') as d
    from appointments a
    join patients p on p.id = a.patient_id
    where a.status in ('confirmado','pendiente')
      and a.start_time > now()
      and a.start_time <= now() + make_interval(days => p_dias)
      and coalesce(btrim(p.phone),'') <> ''
  ), norm as (
    select
      nombre, apellido, d,
      right(d, 8) as phone_norm,
      case
        when length(d) = 9  and left(d,1) = '0'   then '+598' || substring(d from 2)  -- celular UY local
        when length(d) = 8  and left(d,1) = '9'   then '+598' || d                    -- celular UY sin el 0
        when left(d,3) = '598'                     then '+' || d                       -- ya trae 598
        when length(d) >= 10                       then '+' || d                       -- otro país con código
        else null                                                                       -- ambiguo: no arriesgar
      end as phone_e164
    from base
  )
  select n.phone_e164, n.phone_norm, n.nombre, n.apellido
  from norm n
  where n.phone_e164 is not null
    and not exists (select 1 from public.wsp_manychat_map m where m.phone_norm = n.phone_norm)
    and not exists (select 1 from public.wsp_map_intentos i
                     where i.phone_norm = n.phone_norm and i.resultado = 'ya_existe');
$$;


CREATE OR REPLACE FUNCTION "public"."wsp_buscar_paciente"("p_telefono" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_norm text;
  v_ids uuid[];
  v_pid uuid;
  v_count int;
  v_nombre text;
  v_hoy date := (now() at time zone 'America/Montevideo')::date;
begin
  v_norm := right(regexp_replace(coalesce(p_telefono,''), '\D', '', 'g'), 8);
  if length(v_norm) < 8 then
    return jsonb_build_object('encontrado', false);
  end if;

  select array_agg(id) into v_ids
  from patients
  where coalesce(btrim(phone),'') <> ''
    and right(regexp_replace(phone, '\D', '', 'g'), 8) = v_norm;

  v_count := coalesce(array_length(v_ids,1), 0);

  if v_count = 0 then
    return jsonb_build_object('encontrado', false);
  end if;

  -- Colisión de teléfono: devolver nombres para que el agente confirme con cuál habla
  if v_count > 1 then
    return jsonb_build_object(
      'encontrado', true,
      'multiples', true,
      'nombres', (select jsonb_agg(btrim(coalesce(first_name,'')||' '||coalesce(last_name,''))) from patients where id = any(v_ids))
    );
  end if;

  v_pid := v_ids[1];
  select btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into v_nombre from patients where id = v_pid;

  return jsonb_build_object(
    'encontrado', true,
    'multiples', false,
    'nombre', v_nombre,

    'turno_futuro', (
      select jsonb_build_object(
        'fecha', (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])
                   [extract(dow from (a.start_time at time zone 'America/Montevideo'))::int + 1]
                 || ' ' || to_char(a.start_time at time zone 'America/Montevideo', 'DD/MM'),
        'hora', to_char(a.start_time at time zone 'America/Montevideo', 'HH24:MI'),
        'servicio', s.name,
        'profesional', nullif(btrim(coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,'')), '')
      )
      from appointments a
      left join services s on s.id = a.service_id
      left join professionals pr on pr.id = a.professional_id
      where a.patient_id = v_pid and a.start_time > now() and a.status in ('pendiente','confirmado')
      order by a.start_time asc limit 1
    ),

    'ultimo_turno', (
      select jsonb_build_object(
        'fecha', to_char(a.start_time at time zone 'America/Montevideo', 'DD/MM/YYYY'),
        'servicio', s.name,
        'profesional', nullif(btrim(coalesce(pr.first_name,'')||' '||coalesce(pr.last_name,'')), '')
      )
      from appointments a
      left join services s on s.id = a.service_id
      left join professionals pr on pr.id = a.professional_id
      where a.patient_id = v_pid and a.start_time <= now() and a.status not in ('cancelado','cancelado_tarde')
      order by a.start_time desc limit 1
    ),

    -- Pases mensuales: restantes y vencimiento por FECHA (start_date + total_months), igual
    -- que monthsProgress() del panel. used_months no se mantiene, no se usa.
    'cuponeras_activas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'servicio', x.servicio,
        'restantes', x.restantes,
        'total', x.total,
        'tipo', x.tipo,
        'vence', x.vence
      ))
      from (
        select
          s.name as servicio,
          case when c.cuponera_type = 'months' then
                 case when c.start_date is null then coalesce(c.total_months,0)
                      else greatest(coalesce(c.total_months,0) - least(greatest(
                             (extract(year from age(v_hoy, c.start_date)) * 12
                              + extract(month from age(v_hoy, c.start_date)))::int, 0),
                             coalesce(c.total_months,0)), 0) end
               else greatest(coalesce(c.total_sessions,0)-coalesce(c.used_sessions,0),0) end as restantes,
          case when c.cuponera_type='months' then c.total_months else c.total_sessions end as total,
          case when c.cuponera_type='months' then 'meses' else 'sesiones' end as tipo,
          case when c.cuponera_type = 'months' and c.start_date is not null
               then to_char(c.start_date + make_interval(months => coalesce(c.total_months,0)), 'DD/MM/YYYY') end as vence
        from cuponeras c left join services s on s.id = c.service_id
        where c.patient_id = v_pid and c.is_active
          and case when c.cuponera_type = 'months'
                   then c.start_date is null
                        or v_hoy < (c.start_date + make_interval(months => coalesce(c.total_months,0)))::date
                   else coalesce(c.total_sessions,0) - coalesce(c.used_sessions,0) > 0 end
      ) x
      where x.restantes > 0
    ), '[]'::jsonb),

    'tiene_deuda', exists(select 1 from appointments a where a.patient_id = v_pid and a.is_unpaid)
  );
end;
$$;

commit;

-- Verificación: version_nueva = true, anon = false, service_role = true en las dos.
select p.proname as funcion,
       (p.prosrc like '%celular UY sin el 0%' or p.prosrc like '%v_hoy%') as version_nueva,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('wsp_pacientes_para_mapear', 'wsp_buscar_paciente')
order by 1;
