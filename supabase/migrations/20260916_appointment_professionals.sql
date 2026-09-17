-- Varias profesionales en un mismo turno (ej. masaje en pareja con dos masajistas).
--
-- Un turno admitía UNA sola profesional (appointments.professional_id). Para un masaje en
-- pareja el equipo tenía que agendar dos turnos separados o cargar uno y avisar por fuera;
-- la clienta lo señaló como lo que le impedía usar el sistema.
--
-- Se espeja el patrón que el proyecto ya usa para varios pacientes (appointment_patients):
-- tabla puente, SIN tocar la columna vieja. appointments.professional_id se conserva
-- apuntando a la profesional principal, así todo lo que la lee (métricas, contabilidad,
-- historia clínica, los RPC wsp_* del bot de WhatsApp) sigue funcionando mientras las
-- pantallas se migran de a una.
--
-- El conteo en métricas, por decisión del cliente: un turno con dos profesionales cuenta
-- ENTERO para cada una en su rendimiento individual, pero suma UNO solo a los totales de
-- la clínica (no infla turnos ni facturación).
create table if not exists public.appointment_professionals (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (appointment_id, professional_id)
);

create index if not exists appointment_professionals_appointment_idx
  on public.appointment_professionals(appointment_id);
create index if not exists appointment_professionals_professional_idx
  on public.appointment_professionals(professional_id);

alter table public.appointment_professionals enable row level security;

drop policy if exists "appointment_professionals_auth" on public.appointment_professionals;
create policy "appointment_professionals_auth" on public.appointment_professionals
  for all to authenticated using (true) with check (true);

comment on table public.appointment_professionals is
  'Profesionales asignadas a un turno (1 a 4). appointments.professional_id sigue siendo la principal, por compatibilidad con lo que aún no lee esta tabla.';

-- Backfill de los turnos existentes (443 al momento de aplicarla).
insert into public.appointment_professionals (appointment_id, professional_id)
select a.id, a.professional_id
from public.appointments a
where a.professional_id is not null
on conflict (appointment_id, professional_id) do nothing;
