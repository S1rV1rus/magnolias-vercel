-- Tarjeta de regalo vinculada al turno + marca explícita de "sin cargo".
--
-- Antes, que un turno fuera regalo se deducía buscando palabras en el texto libre de las
-- notas ('regalo', 'voucher', 'cortesia', 'beca', 'gratis', 'sorteo', 'canje'...). Frágil:
-- falla con "regalito" y da falso positivo con "no es regalo". Además la tarjeta quedaba
-- como vigente hasta que alguien la marcaba a mano, y no había registro de qué turno la usó.
--
-- Ahora la intención es un dato: is_gift marca el turno como sin cargo, y gift_card_id lo
-- vincula con la tarjeta. Al confirmar el turno la tarjeta se canjea sola; al cancelarlo o
-- borrarlo vuelve a vigente. El código es opcional: se puede marcar sin cargo sin tarjeta
-- (cortesía de la casa).
--
-- La heurística de texto sigue viva en el front como fallback de lectura, para no cambiar
-- cómo se ven los turnos históricos que ya la usan.

alter table public.appointments
  add column if not exists gift_card_id uuid
  references public.gift_cards(id) on delete set null;

alter table public.appointments
  add column if not exists is_gift boolean not null default false;

-- ÚNICO a propósito: una tarjeta no puede pagar dos turnos. El control de "ya está usada"
-- vivía solo en el front, al vincular; pero dos turnos podían vincular la misma tarjeta
-- mientras seguía vigente y canjearla los dos al confirmarse. Esto lo vuelve imposible a
-- nivel de datos. Los NULL no cuentan, así que los turnos sin tarjeta no se ven afectados.
create unique index if not exists appointments_gift_card_id_uidx
  on public.appointments(gift_card_id)
  where gift_card_id is not null;

comment on column public.appointments.gift_card_id is
  'Tarjeta de regalo usada para pagar este turno. Al confirmarlo, la tarjeta pasa a status=usada; al cancelarlo o borrarlo, vuelve a vigente.';
comment on column public.appointments.is_gift is
  'El turno no se cobra (regalo/cortesía/voucher). Si además tiene gift_card_id, al confirmarlo esa tarjeta pasa a usada.';
