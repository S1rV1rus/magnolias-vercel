import { addDays, addMonths, startOfMonth } from 'date-fns'
import { splitAmount } from './utils'

// Fallback de lectura para los turnos históricos, anteriores al check "sin cargo": si la nota
// indica regalo, cortesía o voucher, se asume sin cargo. Se busca por palabra completa y sin
// acentos ("beca" ya no matchea "Rebeca"), y solo se usa cuando el turno no tiene cuponera ni
// está marcado con deuda: un dato explícito siempre gana sobre el texto libre.
const NO_CHARGE_NOTE_RE = /\b(regalos?|vouchers?|big ?box|cortesias?|becas?|gratis|sorteos?|canjes?)\b/

export function notesSuggestNoCharge(notes?: string | null): boolean {
    if (!notes) return false
    const normalized = notes.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return NO_CHARGE_NOTE_RE.test(normalized)
}

// Estados en que un turno CONSUME su sesión de cuponera. 'completado' es un estado histórico
// que la agenda ya no ofrece, pero hay turnos viejos con él: la agenda no lo contaba al editar
// (pasar uno de 'completado' a 'confirmado' sumaba la sesión otra vez) y sí al borrar y en la
// ficha. Ahora todas las pantallas usan la misma lista (la de gift cards ya era esta).
export const CONSUMED_STATUSES = ['confirmado', 'cancelado_tarde', 'completado']

export function isConsumedStatus(status?: string | null): boolean {
    return !!status && CONSUMED_STATUSES.includes(status)
}

// Color y nombre de cada estado: los usan la agenda y la pantalla "Hoy".
export const STATUS_COLOR: Record<string, string> = {
    confirmado: '#16a34a',
    pendiente: '#d97706',
    cancelado: '#ef4444',
    cancelado_tarde: '#ef4444',
    completado: '#2563eb', // estado histórico: ya no se ofrece, pero hay turnos viejos con él
}
export const STATUS_LABEL: Record<string, string> = {
    confirmado: 'Confirmado',
    pendiente: 'Pendiente',
    cancelado: 'Cancelado',
    cancelado_tarde: 'Cancelado c/penalidad',
    completado: 'Completado',
}

// Ventana de turnos que carga la agenda para una fecha: el mes de esa fecha ± 7 días, así
// cubre las semanas que cruzan de mes. Se usa como solapamiento: start_time < end y
// end_time > start.
export function agendaFetchRange(date: Date): { start: Date; end: Date } {
    return {
        start: addDays(startOfMonth(date), -7),
        end: addDays(startOfMonth(addMonths(date, 1)), 7),
    }
}

// Columnas mínimas de un turno para numerar las sesiones de su cuponera
export interface CuponeraApptRow {
    id: string
    start_time: string
    status: string
    cuponera_id: string
    cuponera_session_index: number | null
}

export interface SessionInfo {
    number: number
    projected: boolean
}

// Número de sesión de cada turno de cuponera (por sesiones):
// - turno consumido: usa el índice sellado en DB (cuponera_session_index).
// - turno pendiente: se PROYECTA sobre used_sessions en orden cronológico (used=5 → 6, 7…),
//   marcado como proyectado; al confirmarlo se sella el número real.
// `rows` tiene que traer TODOS los pendientes de cada cuponera, no solo los visibles, o la
// proyección se corre.
export function projectCuponeraSessions(
    rows: CuponeraApptRow[],
    usedByCuponera: Record<string, number | null | undefined>,
): Record<string, SessionInfo> {
    const info: Record<string, SessionInfo> = {}
    const byCuponera: Record<string, CuponeraApptRow[]> = {}
    rows.forEach(a => {
        if (!byCuponera[a.cuponera_id]) byCuponera[a.cuponera_id] = []
        byCuponera[a.cuponera_id].push(a)
    })
    Object.entries(byCuponera).forEach(([cuponeraId, list]) => {
        const used = usedByCuponera[cuponeraId] ?? 0
        list.forEach(a => {
            if (a.cuponera_session_index != null) {
                info[a.id] = { number: a.cuponera_session_index, projected: false }
            }
        })
        list
            .filter(a => a.cuponera_session_index == null)
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            .forEach((a, i) => { info[a.id] = { number: used + i + 1, projected: true } })
    })
    return info
}

// Montos a registrar al saldar la deuda de un paciente. El monto ingresado es el TOTAL: se
// reparte entre los turnos impagos en proporción al precio de lista de cada servicio, así la
// suma coincide con lo cobrado (antes se escribía completo en cada turno y Contabilidad lo
// sumaba una vez por turno). Sin monto, cada turno queda en null y Contabilidad usa el precio
// de lista.
export function debtPaymentAmounts(
    amountInput: string,
    unpaid: { services?: { price?: number | string | null } | null }[],
): (number | null)[] {
    const total = amountInput ? parseFloat(amountInput) : NaN
    if (Number.isNaN(total)) return unpaid.map(() => null)
    return splitAmount(total, unpaid.map(a => Number(a.services?.price) || 0))
}
