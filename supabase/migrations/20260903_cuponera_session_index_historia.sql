-- Número de sesión de cuponera en las entradas de historia clínica.
--
-- Problema: el número mostrado en la ficha del paciente se derivaba de
-- cuponeras.used_sessions (editable a mano y sincronizado en diferido), así que una
-- sesión cargada como "Sesión 1" podía aparecer después con otro número. Los turnos
-- ya persistían su índice en appointments.cuponera_session_index; faltaba el lado de
-- la historia clínica.
--
-- Las dos tablas comparten UNA sola secuencia por cuponera (1..N cronológico,
-- turnos y canjes manuales mezclados).

alter table public.clinical_history
  add column if not exists cuponera_session_index integer;

comment on column public.clinical_history.cuponera_session_index is
  'Número de sesión de la cuponera que consumió esta entrada (1-based). NULL si la entrada no consume cuponera o si es anterior a esta funcionalidad (en ese caso la UI cae al cálculo por posición).';

-- El backfill de los 543 canjes existentes se aplicó por separado, con respaldo de los
-- valores previos en la tabla public.backup_cuponera_session_index.
