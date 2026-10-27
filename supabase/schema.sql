


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."appointment_status" AS ENUM (
    'pendiente',
    'confirmado',
    'cancelado_tarde',
    'completado',
    'cancelado'
);


ALTER TYPE "public"."appointment_status" OWNER TO "postgres";


CREATE TYPE "public"."service_type" AS ENUM (
    'simple',
    'complejo'
);


ALTER TYPE "public"."service_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stock_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.type = 'addition' THEN
            UPDATE public.stock_items
            SET quantity = quantity + NEW.quantity
            WHERE id = NEW.item_id;
        ELSIF NEW.type = 'usage' THEN
            UPDATE public.stock_items
            SET quantity = quantity - NEW.quantity
            WHERE id = NEW.item_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_stock_quantity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_agendar_turno"("p_service_id" "text", "p_fecha" "date", "p_hora" time without time zone, "p_nombre" "text", "p_cedula" "text" DEFAULT NULL::"text", "p_telefono" "text" DEFAULT NULL::"text", "p_notas" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sid uuid; v_dur int; v_start timestamptz; v_end timestamptz; v_local timestamp;
  v_dow int; v_min int; v_open_min int; v_close_min int;
  v_room_id uuid; v_room_name text; v_service_name text; v_appt_id uuid;
  v_patient_id uuid; v_first text; v_last text; v_parts text[]; v_notas text;
  v_rooms text[]; v_i int; v_existing uuid; v_nombre text;
begin
  v_nombre := trim(coalesce(p_nombre,''));
  v_parts := string_to_array(v_nombre,' ');
  if v_nombre = '' or lower(v_nombre) like 'cliente%' or array_length(v_parts,1) is null or array_length(v_parts,1) < 2 then
    return jsonb_build_object('ok',false,'error','Necesito el NOMBRE y APELLIDO completos del cliente para poder agendar. Pediselos primero (y la cedula si la tiene) y recien ahi agendá.');
  end if;

  begin v_sid := nullif(trim(p_service_id),'')::uuid; exception when others then v_sid := null; end;
  if v_sid is null then return jsonb_build_object('ok',false,'error','Falta el service_id del tratamiento. Primero consultá los servicios.'); end if;
  select name, coalesce(duration_minutes,60), room_priority into v_service_name, v_dur, v_rooms from services where id=v_sid and is_active;
  if v_service_name is null then return jsonb_build_object('ok',false,'error','Servicio no encontrado o inactivo.'); end if;
  if v_dur is null or v_dur<=0 then v_dur:=60; end if;

  v_local := p_fecha + p_hora;
  v_start := v_local at time zone 'America/Montevideo';
  v_end := (v_local + make_interval(mins=>v_dur)) at time zone 'America/Montevideo';

  v_dow := extract(dow from p_fecha)::int;
  v_min := extract(hour from p_hora)::int*60 + extract(minute from p_hora)::int;
  if v_dow=0 then return jsonb_build_object('ok',false,'error','Cerrado los domingos.');
  elsif v_dow=6 then v_open_min:=540; v_close_min:=1140;
  else v_open_min:=540; v_close_min:=1200; end if;
  if v_min<v_open_min or v_min+v_dur>v_close_min then return jsonb_build_object('ok',false,'error','Ese horario queda fuera del horario de atencion.'); end if;

  if v_rooms is null or array_length(v_rooms,1) is null then
    select r.id, r.name into v_room_id, v_room_name from rooms r
      where r.is_active and not exists(select 1 from appointments a where a.room_id=r.id and a.status not in('cancelado','cancelado_tarde') and a.start_time<v_end and a.end_time>v_start)
      order by r.name limit 1;
  else
    for v_i in 1..array_length(v_rooms,1) loop
      select r.id, r.name into v_room_id, v_room_name from rooms r
        where r.is_active and r.name = v_rooms[v_i]
          and not exists(select 1 from appointments a where a.room_id=r.id and a.status not in('cancelado','cancelado_tarde') and a.start_time<v_end and a.end_time>v_start)
        limit 1;
      exit when v_room_id is not null;
    end loop;
  end if;
  if v_room_id is null then return jsonb_build_object('ok',false,'error','No hay consultorios disponibles para ese servicio en ese horario.'); end if;

  -- Buscar paciente: por cedula, luego por TELEFONO NORMALIZADO (ultimos 8 digitos)
  if nullif(trim(p_cedula),'') is not null then
    select id into v_patient_id from patients where document_id=trim(p_cedula) limit 1;
  end if;
  if v_patient_id is null and nullif(trim(p_telefono),'') is not null
     and length(regexp_replace(trim(p_telefono),'\D','','g')) >= 8 then
    select id into v_patient_id from patients
    where coalesce(btrim(phone),'') <> ''
      and right(regexp_replace(phone,'\D','','g'),8) = right(regexp_replace(trim(p_telefono),'\D','','g'),8)
    order by created_at asc limit 1;
  end if;

  v_first := v_parts[1]; v_last := array_to_string(v_parts[2:],' ');
  if v_patient_id is null then
    insert into patients (first_name,last_name,document_id,phone) values (v_first,v_last,nullif(trim(p_cedula),''),nullif(trim(p_telefono),'')) returning id into v_patient_id;
  else
    update patients set first_name=v_first, last_name=v_last, document_id=coalesce(document_id, nullif(trim(p_cedula),''))
      where id=v_patient_id and (first_name is null or lower(first_name) like 'cliente%');
  end if;

  select a.id into v_existing from appointments a
    join appointment_patients ap on ap.appointment_id=a.id
    where ap.patient_id=v_patient_id and a.service_id=v_sid and a.start_time=v_start and a.status='pendiente' limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok',true,'turno_id',v_existing,'paciente_id',v_patient_id,'servicio',v_service_name,'fecha',p_fecha,'hora',to_char(p_hora,'HH24:MI'),'consultorio',v_room_name,'estado','pendiente','nota','Ya estaba agendado, no se duplico.');
  end if;

  v_notas := concat_ws(' — ','Reserva WhatsApp'||case when nullif(trim(p_telefono),'') is not null then ' · Tel: '||trim(p_telefono) else '' end, nullif(trim(p_notas),''));
  insert into appointments (patient_id,service_id,start_time,end_time,status,room_id,n8n_reference,notes)
  values (v_patient_id,v_sid,v_start,v_end,'pendiente',v_room_id,'whatsapp',v_notas) returning id into v_appt_id;
  insert into appointment_patients (appointment_id,patient_id) values (v_appt_id,v_patient_id);

  return jsonb_build_object('ok',true,'turno_id',v_appt_id,'paciente_id',v_patient_id,'servicio',v_service_name,'fecha',p_fecha,'hora',to_char(p_hora,'HH24:MI'),'fin',to_char(v_end at time zone 'America/Montevideo','HH24:MI'),'consultorio',v_room_name,'estado','pendiente');
end; $$;


ALTER FUNCTION "public"."wsp_agendar_turno"("p_service_id" "text", "p_fecha" "date", "p_hora" time without time zone, "p_nombre" "text", "p_cedula" "text", "p_telefono" "text", "p_notas" "text") OWNER TO "postgres";


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

    'cuponeras_activas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'servicio', s.name,
        'restantes', case when c.cuponera_type='months' then greatest(coalesce(c.total_months,0)-coalesce(c.used_months,0),0)
                          else greatest(coalesce(c.total_sessions,0)-coalesce(c.used_sessions,0),0) end,
        'total', case when c.cuponera_type='months' then c.total_months else c.total_sessions end,
        'tipo', case when c.cuponera_type='months' then 'meses' else 'sesiones' end
      ))
      from cuponeras c left join services s on s.id = c.service_id
      where c.patient_id = v_pid and c.is_active
        and (case when c.cuponera_type='months' then coalesce(c.total_months,0)-coalesce(c.used_months,0)
                  else coalesce(c.total_sessions,0)-coalesce(c.used_sessions,0) end) > 0
    ), '[]'::jsonb),

    'tiene_deuda', exists(select 1 from appointments a where a.patient_id = v_pid and a.is_unpaid)
  );
end;
$$;


ALTER FUNCTION "public"."wsp_buscar_paciente"("p_telefono" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_derivaciones_vencidas"("p_horas" integer) RETURNS TABLE("subscriber_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  delete from public.wsp_derivaciones d
  where d.derivado_en < now() - make_interval(hours => p_horas)
  returning d.subscriber_id;
end;
$$;


ALTER FUNCTION "public"."wsp_derivaciones_vencidas"("p_horas" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_fecha_es"("p_ts" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[
           extract(dow from (p_ts at time zone 'America/Montevideo'))::int + 1
         ] || ' ' || to_char(p_ts at time zone 'America/Montevideo', 'DD/MM');
$$;


ALTER FUNCTION "public"."wsp_fecha_es"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_lista_natural"("p_items" "text"[]) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when array_length(p_items,1) is null then ''
    when array_length(p_items,1) = 1 then p_items[1]
    else array_to_string(p_items[1:array_length(p_items,1)-1], ', ')
         || ' y ' || p_items[array_length(p_items,1)]
  end;
$$;


ALTER FUNCTION "public"."wsp_lista_natural"("p_items" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_listar_disponibilidad"("p_fecha" "date", "p_service_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sid uuid; v_dow int; v_open_min int; v_close_min int; v_dur int;
  v_total_rooms int; v_slots text[] := '{}'; v_m int;
  v_start timestamptz; v_end timestamptz; v_local_start timestamp;
  v_occupied int; v_dia text; v_rooms text[]; v_free boolean;
begin
  begin v_sid := nullif(trim(p_service_id),'')::uuid; exception when others then v_sid := null; end;
  v_dur := coalesce((select duration_minutes from services where id=v_sid),60);
  if v_dur is null or v_dur<=0 then v_dur:=60; end if;
  v_rooms := (select room_priority from services where id=v_sid);

  v_dow := extract(dow from p_fecha)::int;
  v_dia := case v_dow when 0 then 'domingo' when 1 then 'lunes' when 2 then 'martes' when 3 then 'miercoles' when 4 then 'jueves' when 5 then 'viernes' when 6 then 'sabado' end;
  if v_dow=0 then
    return jsonb_build_object('fecha',p_fecha,'dia_semana',v_dia,'abierto',false,'duracion_min',v_dur,'horarios_libres','[]'::jsonb,'mensaje','Cerrado los domingos');
  elsif v_dow=6 then v_open_min:=540; v_close_min:=1140;
  else v_open_min:=540; v_close_min:=1200; end if;

  select count(*) into v_total_rooms from rooms where is_active;

  v_m := v_open_min;
  while v_m + v_dur <= v_close_min loop
    v_local_start := p_fecha + make_interval(mins=>v_m);
    v_start := v_local_start at time zone 'America/Montevideo';
    v_end := (v_local_start + make_interval(mins=>v_dur)) at time zone 'America/Montevideo';
    if v_rooms is null or array_length(v_rooms,1) is null then
      select count(distinct a.room_id) into v_occupied from appointments a
        where a.room_id is not null and a.status not in ('cancelado','cancelado_tarde')
          and a.start_time < v_end and a.end_time > v_start;
      v_free := v_occupied < v_total_rooms;
    else
      v_free := exists(select 1 from rooms r where r.is_active and r.name = any(v_rooms)
        and not exists(select 1 from appointments a where a.room_id=r.id and a.status not in ('cancelado','cancelado_tarde') and a.start_time < v_end and a.end_time > v_start));
    end if;
    if v_free then v_slots := v_slots || to_char(v_local_start,'HH24:MI'); end if;
    v_m := v_m + 30;
  end loop;

  return jsonb_build_object('fecha',p_fecha,'dia_semana',v_dia,'abierto',true,'duracion_min',v_dur,'consultorios_totales',v_total_rooms,'horarios_libres',to_jsonb(v_slots));
end; $$;


ALTER FUNCTION "public"."wsp_listar_disponibilidad"("p_fecha" "date", "p_service_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_map_intento"("p_phone" "text", "p_resultado" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.wsp_map_intentos(phone_norm, resultado, intentos, ultimo_intento)
  select right(regexp_replace(p_phone,'\D','','g'),8), p_resultado, 1, now()
  where length(regexp_replace(coalesce(p_phone,''),'\D','','g')) >= 8
  on conflict (phone_norm) do update
    set resultado = excluded.resultado,
        intentos = public.wsp_map_intentos.intentos + 1,
        ultimo_intento = now();
$$;


ALTER FUNCTION "public"."wsp_map_intento"("p_phone" "text", "p_resultado" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_map_upsert"("p_phone" "text", "p_sub" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.wsp_manychat_map(phone_norm, subscriber_id, updated_at)
  select right(regexp_replace(p_phone,'\D','','g'),8), p_sub, now()
  where length(regexp_replace(coalesce(p_phone,''),'\D','','g')) >= 8
    and coalesce(btrim(p_sub),'') <> ''
  on conflict (phone_norm) do update
    set subscriber_id = excluded.subscriber_id, updated_at = now();
$$;


ALTER FUNCTION "public"."wsp_map_upsert"("p_phone" "text", "p_sub" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_marcar_derivacion"("p_sub" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.wsp_derivaciones(subscriber_id, derivado_en)
  values (p_sub, now())
  on conflict (subscriber_id) do update set derivado_en = now();
$$;


ALTER FUNCTION "public"."wsp_marcar_derivacion"("p_sub" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_marcar_recordatorio"("p_appts" "uuid"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.wsp_recordatorios_enviados (appointment_id)
  select unnest(p_appts)
  on conflict (appointment_id) do nothing;
$$;


ALTER FUNCTION "public"."wsp_marcar_recordatorio"("p_appts" "uuid"[]) OWNER TO "postgres";


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


ALTER FUNCTION "public"."wsp_pacientes_para_mapear"("p_dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_registrar_omitidos"("p_dias" integer DEFAULT 1) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_count integer;
begin
  insert into public.wsp_recordatorios_omitidos (appointment_id, motivo)
  select a.id, 'sin contacto de ManyChat'
  from appointments a
  join patients p on p.id = a.patient_id
  left join public.wsp_manychat_map m
    on m.phone_norm = right(regexp_replace(coalesce(p.phone,''),'\D','','g'),8)
  where a.status = 'confirmado'
    and (a.start_time at time zone 'America/Montevideo')::date
        = (now() at time zone 'America/Montevideo')::date + p_dias
    and m.subscriber_id is null
    and not exists (select 1 from public.wsp_recordatorios_enviados r where r.appointment_id = a.id)
  on conflict (appointment_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;


ALTER FUNCTION "public"."wsp_registrar_omitidos"("p_dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wsp_turnos_para_recordar"("p_dias" integer DEFAULT 1) RETURNS TABLE("appointment_ids" "uuid"[], "subscriber_id" "text", "nombre" "text", "servicio" "text", "fecha" "text", "hora" "text", "telefono" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with turnos as (
    select
      a.id as appointment_id,
      a.start_time,
      m.subscriber_id,
      split_part(btrim(coalesce(p.first_name,'')), ' ', 1) as nombre,
      coalesce(s.name, 'tu sesión') as servicio,
      p.phone as telefono,
      public.wsp_fecha_es(a.start_time) as fecha,
      to_char(a.start_time at time zone 'America/Montevideo', 'HH24:MI') as hora
    from appointments a
    join patients p on p.id = a.patient_id
    left join services s on s.id = a.service_id
    join public.wsp_manychat_map m
      on m.phone_norm = right(regexp_replace(coalesce(p.phone,''),'\D','','g'),8)
    where a.status = 'confirmado'
      and (a.start_time at time zone 'America/Montevideo')::date
          = (now() at time zone 'America/Montevideo')::date + p_dias
      and not exists (
        select 1 from public.wsp_recordatorios_enviados r where r.appointment_id = a.id
      )
  )
  select
    array_agg(t.appointment_id order by t.start_time),
    t.subscriber_id,
    min(t.nombre),
    public.wsp_lista_natural(array_agg(distinct t.servicio)),
    min(t.fecha),
    public.wsp_lista_natural(array_agg(t.hora order by t.start_time)),
    min(t.telefono)
  from turnos t
  group by t.subscriber_id, (t.start_time at time zone 'America/Montevideo')::date;
$$;


ALTER FUNCTION "public"."wsp_turnos_para_recordar"("p_dias" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auth_user_id" "uuid",
    "user_name" "text" DEFAULT 'Sistema'::"text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."appointment_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."appointment_professionals" OWNER TO "postgres";


COMMENT ON TABLE "public"."appointment_professionals" IS 'Profesionales asignadas a un turno (1 a 4). appointments.professional_id sigue siendo la principal, por compatibilidad con las pantallas que aún no leen esta tabla.';



CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "patient_id" "uuid",
    "service_id" "uuid" NOT NULL,
    "professional_id" "uuid",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'pendiente'::"public"."appointment_status" NOT NULL,
    "notes" "text",
    "n8n_reference" "text",
    "room_id" "uuid",
    "cuponera_id" "uuid",
    "is_unpaid" boolean DEFAULT false,
    "payment_amount" numeric,
    "receipt_number" "text",
    "cuponera_session_index" integer,
    "gift_card_id" "uuid",
    "is_gift" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."gift_card_id" IS 'Tarjeta de regalo usada para pagar este turno. Al confirmarlo, la tarjeta pasa a status=usada; al cancelarlo o borrarlo, vuelve a vigente.';



COMMENT ON COLUMN "public"."appointments"."is_gift" IS 'El turno no se cobra (regalo/cortesía/voucher). Si además tiene gift_card_id, al confirmarlo esa tarjeta pasa a usada.';



CREATE TABLE IF NOT EXISTS "public"."backup_cuponera_session_index" (
    "tabla" "text" NOT NULL,
    "registro_id" "uuid" NOT NULL,
    "valor_anterior" integer,
    "guardado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."backup_cuponera_session_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "author_name" "text" NOT NULL,
    "auth_user_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "color" "text" DEFAULT 'yellow'::"text" NOT NULL,
    "is_pinned" boolean DEFAULT false,
    CONSTRAINT "blog_notes_color_check" CHECK (("color" = ANY (ARRAY['yellow'::"text", 'red'::"text", 'green'::"text", 'blue'::"text", 'purple'::"text", 'orange'::"text"])))
);


ALTER TABLE "public"."blog_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."blog_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "patient_id" "uuid" NOT NULL,
    "professional_id" "uuid",
    "service_type" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "cuponera_session_index" integer
);


ALTER TABLE "public"."clinical_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinical_history"."cuponera_session_index" IS 'Número de sesión de la cuponera que consumió esta entrada (1-based). NULL si la entrada no consume cuponera o si es anterior a esta funcionalidad (en ese caso la UI cae al cálculo por posición).';



CREATE TABLE IF NOT EXISTS "public"."clinical_history_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinical_history_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "photo_order" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "clinical_history_photos_photo_order_check" CHECK ((("photo_order" >= 1) AND ("photo_order" <= 3)))
);


ALTER TABLE "public"."clinical_history_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cuponeras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "patient_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "total_sessions" integer NOT NULL,
    "used_sessions" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "invoice_number" character varying,
    "amount_paid" numeric,
    "cuponera_type" "text" DEFAULT 'sessions'::"text" NOT NULL,
    "total_months" integer,
    "used_months" integer DEFAULT 0,
    "start_date" "date",
    "is_paid" boolean DEFAULT true,
    "currency" "text" DEFAULT 'UYU'::"text" NOT NULL,
    "body_zones" "text"[],
    CONSTRAINT "cuponeras_cuponera_type_check" CHECK (("cuponera_type" = ANY (ARRAY['sessions'::"text", 'months'::"text"]))),
    CONSTRAINT "cuponeras_currency_check" CHECK (("currency" = ANY (ARRAY['UYU'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."cuponeras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "code" "text" NOT NULL,
    "patient_id" "uuid",
    "service_id" "uuid",
    "amount" numeric,
    "currency" "text" DEFAULT 'UYU'::"text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'vigente'::"text" NOT NULL,
    "redeemed_at" "date",
    "redeemed_service_id" "uuid",
    "recipient_name" "text",
    CONSTRAINT "gift_cards_currency_check" CHECK (("currency" = ANY (ARRAY['UYU'::"text", 'USD'::"text"]))),
    CONSTRAINT "gift_cards_status_check" CHECK (("status" = ANY (ARRAY['vigente'::"text", 'usada'::"text"])))
);


ALTER TABLE "public"."gift_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pack_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "service_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sessions" integer NOT NULL,
    "price" numeric NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true,
    CONSTRAINT "pack_prices_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "pack_prices_sessions_check" CHECK (("sessions" >= 1))
);


ALTER TABLE "public"."pack_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "document_id" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."professional_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "is_active" boolean DEFAULT true,
    "auth_user_id" "uuid",
    "color" "text" DEFAULT '#3b82f6'::"text",
    "is_deleted" boolean DEFAULT false
);


ALTER TABLE "public"."professionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer,
    "price" numeric,
    "type" "public"."service_type" DEFAULT 'simple'::"public"."service_type" NOT NULL,
    "is_active" boolean DEFAULT true,
    "room_priority" "text"[],
    "hide_price_agent" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'unidades'::"text" NOT NULL,
    "description" "text",
    "min_quantity" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "label" "text"
);


ALTER TABLE "public"."stock_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."stock_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wsp_derivaciones" (
    "subscriber_id" "text" NOT NULL,
    "derivado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wsp_derivaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wsp_manychat_map" (
    "phone_norm" "text" NOT NULL,
    "subscriber_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wsp_manychat_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wsp_map_intentos" (
    "phone_norm" "text" NOT NULL,
    "resultado" "text" NOT NULL,
    "intentos" integer DEFAULT 1 NOT NULL,
    "ultimo_intento" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wsp_map_intentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wsp_recordatorios_enviados" (
    "appointment_id" "uuid" NOT NULL,
    "enviado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wsp_recordatorios_enviados" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."wsp_recordatorios_manana" WITH ("security_invoker"='true') AS
 SELECT "to_char"(("a"."start_time" AT TIME ZONE 'America/Montevideo'::"text"), 'Dy DD/MM HH24:MI'::"text") AS "cuando",
    "btrim"(((COALESCE("p"."first_name", ''::"text") || ' '::"text") || COALESCE("p"."last_name", ''::"text"))) AS "paciente",
    COALESCE("s"."name", '—'::"text") AS "servicio",
        CASE
            WHEN ("m"."subscriber_id" IS NOT NULL) THEN 'sí'::"text"
            ELSE 'NO — sin contacto'::"text"
        END AS "le_llega",
        CASE
            WHEN ("r"."appointment_id" IS NOT NULL) THEN 'ya avisado'::"text"
            ELSE 'pendiente'::"text"
        END AS "estado",
    "a"."start_time"
   FROM (((("public"."appointments" "a"
     JOIN "public"."patients" "p" ON (("p"."id" = "a"."patient_id")))
     LEFT JOIN "public"."services" "s" ON (("s"."id" = "a"."service_id")))
     LEFT JOIN "public"."wsp_manychat_map" "m" ON (("m"."phone_norm" = "right"("regexp_replace"(COALESCE("p"."phone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text"), 8))))
     LEFT JOIN "public"."wsp_recordatorios_enviados" "r" ON (("r"."appointment_id" = "a"."id")))
  WHERE (("a"."status" = 'confirmado'::"public"."appointment_status") AND ((("a"."start_time" AT TIME ZONE 'America/Montevideo'::"text"))::"date" = ((("now"() AT TIME ZONE 'America/Montevideo'::"text"))::"date" + 1)))
  ORDER BY "a"."start_time";


ALTER VIEW "public"."wsp_recordatorios_manana" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wsp_recordatorios_omitidos" (
    "appointment_id" "uuid" NOT NULL,
    "motivo" "text" NOT NULL,
    "detectado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wsp_recordatorios_omitidos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."wsp_recordatorios_sin_avisar" WITH ("security_invoker"='true') AS
 SELECT "to_char"(("a"."start_time" AT TIME ZONE 'America/Montevideo'::"text"), 'Dy DD/MM HH24:MI'::"text") AS "turno",
    "btrim"(((COALESCE("p"."first_name", ''::"text") || ' '::"text") || COALESCE("p"."last_name", ''::"text"))) AS "paciente",
    "p"."phone" AS "telefono",
    COALESCE("s"."name", '—'::"text") AS "servicio",
    "o"."motivo",
    ("o"."detectado_en" AT TIME ZONE 'America/Montevideo'::"text") AS "detectado",
    "a"."start_time"
   FROM ((("public"."wsp_recordatorios_omitidos" "o"
     JOIN "public"."appointments" "a" ON (("a"."id" = "o"."appointment_id")))
     JOIN "public"."patients" "p" ON (("p"."id" = "a"."patient_id")))
     LEFT JOIN "public"."services" "s" ON (("s"."id" = "a"."service_id")))
  ORDER BY "a"."start_time" DESC;


ALTER VIEW "public"."wsp_recordatorios_sin_avisar" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."wsp_servicios_agente" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
        CASE
            WHEN "hide_price_agent" THEN NULL::numeric
            ELSE "price"
        END AS "price",
    "duration_minutes",
    "is_active"
   FROM "public"."services" "s";


ALTER VIEW "public"."wsp_servicios_agente" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_patients"
    ADD CONSTRAINT "appointment_patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_professionals"
    ADD CONSTRAINT "appointment_professionals_appointment_id_professional_id_key" UNIQUE ("appointment_id", "professional_id");



ALTER TABLE ONLY "public"."appointment_professionals"
    ADD CONSTRAINT "appointment_professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_cuponera_session_index"
    ADD CONSTRAINT "backup_cuponera_session_index_pkey" PRIMARY KEY ("tabla", "registro_id");



ALTER TABLE ONLY "public"."blog_notes"
    ADD CONSTRAINT "blog_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_reads"
    ADD CONSTRAINT "blog_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_reads"
    ADD CONSTRAINT "blog_reads_unique_user_note" UNIQUE ("note_id", "user_id");



ALTER TABLE ONLY "public"."clinical_history_photos"
    ADD CONSTRAINT "clinical_history_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_history"
    ADD CONSTRAINT "clinical_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuponeras"
    ADD CONSTRAINT "cuponeras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pack_prices"
    ADD CONSTRAINT "pack_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_document_id_key" UNIQUE ("document_id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_schedules"
    ADD CONSTRAINT "professional_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_schedules"
    ADD CONSTRAINT "professional_schedules_prof_month_year_key" UNIQUE ("professional_id", "month", "year");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_items"
    ADD CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transactions"
    ADD CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wsp_derivaciones"
    ADD CONSTRAINT "wsp_derivaciones_pkey" PRIMARY KEY ("subscriber_id");



ALTER TABLE ONLY "public"."wsp_manychat_map"
    ADD CONSTRAINT "wsp_manychat_map_pkey" PRIMARY KEY ("phone_norm");



ALTER TABLE ONLY "public"."wsp_map_intentos"
    ADD CONSTRAINT "wsp_map_intentos_pkey" PRIMARY KEY ("phone_norm");



ALTER TABLE ONLY "public"."wsp_recordatorios_enviados"
    ADD CONSTRAINT "wsp_recordatorios_enviados_pkey" PRIMARY KEY ("appointment_id");



ALTER TABLE ONLY "public"."wsp_recordatorios_omitidos"
    ADD CONSTRAINT "wsp_recordatorios_omitidos_pkey" PRIMARY KEY ("appointment_id");



CREATE INDEX "appointment_professionals_appointment_idx" ON "public"."appointment_professionals" USING "btree" ("appointment_id");



CREATE INDEX "appointment_professionals_professional_idx" ON "public"."appointment_professionals" USING "btree" ("professional_id");



CREATE UNIQUE INDEX "appointments_gift_card_id_uidx" ON "public"."appointments" USING "btree" ("gift_card_id") WHERE ("gift_card_id" IS NOT NULL);



CREATE INDEX "idx_blog_reads_note_id" ON "public"."blog_reads" USING "btree" ("note_id");



CREATE INDEX "idx_chphotos_history_id" ON "public"."clinical_history_photos" USING "btree" ("clinical_history_id");



CREATE INDEX "idx_chphotos_patient_id" ON "public"."clinical_history_photos" USING "btree" ("patient_id");



CREATE INDEX "stock_items_label_idx" ON "public"."stock_items" USING "btree" ("label") WHERE ("label" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_update_stock_quantity" AFTER INSERT ON "public"."stock_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_stock_quantity"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."appointment_patients"
    ADD CONSTRAINT "appointment_patients_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_patients"
    ADD CONSTRAINT "appointment_patients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_professionals"
    ADD CONSTRAINT "appointment_professionals_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_professionals"
    ADD CONSTRAINT "appointment_professionals_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_cuponera_id_fkey" FOREIGN KEY ("cuponera_id") REFERENCES "public"."cuponeras"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."blog_notes"
    ADD CONSTRAINT "blog_notes_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."blog_reads"
    ADD CONSTRAINT "blog_reads_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."blog_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_history"
    ADD CONSTRAINT "clinical_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."clinical_history_photos"
    ADD CONSTRAINT "clinical_history_photos_clinical_history_id_fkey" FOREIGN KEY ("clinical_history_id") REFERENCES "public"."clinical_history"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_history_photos"
    ADD CONSTRAINT "clinical_history_photos_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_history"
    ADD CONSTRAINT "clinical_history_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."cuponeras"
    ADD CONSTRAINT "cuponeras_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."cuponeras"
    ADD CONSTRAINT "cuponeras_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_redeemed_service_id_fkey" FOREIGN KEY ("redeemed_service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pack_prices"
    ADD CONSTRAINT "pack_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_schedules"
    ADD CONSTRAINT "professional_schedules_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_transactions"
    ADD CONSTRAINT "stock_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_transactions"
    ADD CONSTRAINT "stock_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow all read services" ON "public"."services" FOR SELECT USING (true);



CREATE POLICY "Allow authenticated on clinical_history_photos" ON "public"."clinical_history_photos" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow staff delete services" ON "public"."services" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow staff insert services" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow staff update services" ON "public"."services" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete blog_notes" ON "public"."blog_notes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete pack_prices" ON "public"."pack_prices" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert blog_notes" ON "public"."blog_notes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert pack_prices" ON "public"."pack_prices" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can read blog_notes" ON "public"."blog_notes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read pack_prices" ON "public"."pack_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update blog_notes" ON "public"."blog_notes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update pack_prices" ON "public"."pack_prices" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Cada usuario registra su propia lectura" ON "public"."blog_reads" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Cualquier autenticado puede insertar stock_transactions" ON "public"."stock_transactions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Cualquier autenticado puede modificar stock_items" ON "public"."stock_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Cualquier autenticado puede ver lecturas" ON "public"."blog_reads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Cualquier autenticado puede ver stock_items" ON "public"."stock_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Cualquier autenticado puede ver stock_transactions" ON "public"."stock_transactions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Staff see all appointments" ON "public"."appointments" TO "authenticated" USING (true);



CREATE POLICY "Staff see all clinical_history" ON "public"."clinical_history" TO "authenticated" USING (true);



CREATE POLICY "Staff see all cuponeras" ON "public"."cuponeras" TO "authenticated" USING (true);



CREATE POLICY "Staff see all gift_cards" ON "public"."gift_cards" TO "authenticated" USING (true);



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_professionals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointment_professionals_auth" ON "public"."appointment_professionals" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_all_appointment_patients" ON "public"."appointment_patients" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_all_patients" ON "public"."patients" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_all_professional_schedules" ON "public"."professional_schedules" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_all_professionals" ON "public"."professionals" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_all_rooms" ON "public"."rooms" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_insert_logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_read_logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."backup_cuponera_session_index" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_history_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuponeras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pack_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wsp_derivaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wsp_manychat_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wsp_map_intentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wsp_recordatorios_enviados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wsp_recordatorios_omitidos" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."update_stock_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stock_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stock_quantity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_agendar_turno"("p_service_id" "text", "p_fecha" "date", "p_hora" time without time zone, "p_nombre" "text", "p_cedula" "text", "p_telefono" "text", "p_notas" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_agendar_turno"("p_service_id" "text", "p_fecha" "date", "p_hora" time without time zone, "p_nombre" "text", "p_cedula" "text", "p_telefono" "text", "p_notas" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_buscar_paciente"("p_telefono" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_buscar_paciente"("p_telefono" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_derivaciones_vencidas"("p_horas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_derivaciones_vencidas"("p_horas" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."wsp_fecha_es"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."wsp_fecha_es"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."wsp_fecha_es"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."wsp_lista_natural"("p_items" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."wsp_lista_natural"("p_items" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."wsp_lista_natural"("p_items" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_listar_disponibilidad"("p_fecha" "date", "p_service_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_listar_disponibilidad"("p_fecha" "date", "p_service_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_map_intento"("p_phone" "text", "p_resultado" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_map_intento"("p_phone" "text", "p_resultado" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_map_upsert"("p_phone" "text", "p_sub" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_map_upsert"("p_phone" "text", "p_sub" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_marcar_derivacion"("p_sub" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_marcar_derivacion"("p_sub" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_marcar_recordatorio"("p_appts" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_marcar_recordatorio"("p_appts" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_pacientes_para_mapear"("p_dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_pacientes_para_mapear"("p_dias" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_registrar_omitidos"("p_dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_registrar_omitidos"("p_dias" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wsp_turnos_para_recordar"("p_dias" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wsp_turnos_para_recordar"("p_dias" integer) TO "service_role";
























GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_patients" TO "anon";
GRANT ALL ON TABLE "public"."appointment_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_patients" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_professionals" TO "anon";
GRANT ALL ON TABLE "public"."appointment_professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_professionals" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."backup_cuponera_session_index" TO "service_role";



GRANT ALL ON TABLE "public"."blog_notes" TO "anon";
GRANT ALL ON TABLE "public"."blog_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_notes" TO "service_role";



GRANT ALL ON TABLE "public"."blog_reads" TO "anon";
GRANT ALL ON TABLE "public"."blog_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_reads" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_history" TO "anon";
GRANT ALL ON TABLE "public"."clinical_history" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_history" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_history_photos" TO "anon";
GRANT ALL ON TABLE "public"."clinical_history_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_history_photos" TO "service_role";



GRANT ALL ON TABLE "public"."cuponeras" TO "anon";
GRANT ALL ON TABLE "public"."cuponeras" TO "authenticated";
GRANT ALL ON TABLE "public"."cuponeras" TO "service_role";



GRANT ALL ON TABLE "public"."gift_cards" TO "anon";
GRANT ALL ON TABLE "public"."gift_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_cards" TO "service_role";



GRANT ALL ON TABLE "public"."pack_prices" TO "anon";
GRANT ALL ON TABLE "public"."pack_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."pack_prices" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."professional_schedules" TO "anon";
GRANT ALL ON TABLE "public"."professional_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."professionals" TO "anon";
GRANT ALL ON TABLE "public"."professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."professionals" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."stock_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_items" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transactions" TO "anon";
GRANT ALL ON TABLE "public"."stock_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_derivaciones" TO "anon";
GRANT ALL ON TABLE "public"."wsp_derivaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."wsp_derivaciones" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_manychat_map" TO "anon";
GRANT ALL ON TABLE "public"."wsp_manychat_map" TO "authenticated";
GRANT ALL ON TABLE "public"."wsp_manychat_map" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_map_intentos" TO "anon";
GRANT ALL ON TABLE "public"."wsp_map_intentos" TO "authenticated";
GRANT ALL ON TABLE "public"."wsp_map_intentos" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_recordatorios_enviados" TO "anon";
GRANT ALL ON TABLE "public"."wsp_recordatorios_enviados" TO "authenticated";
GRANT ALL ON TABLE "public"."wsp_recordatorios_enviados" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_recordatorios_manana" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_recordatorios_omitidos" TO "anon";
GRANT ALL ON TABLE "public"."wsp_recordatorios_omitidos" TO "authenticated";
GRANT ALL ON TABLE "public"."wsp_recordatorios_omitidos" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_recordatorios_sin_avisar" TO "service_role";



GRANT ALL ON TABLE "public"."wsp_servicios_agente" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;




























