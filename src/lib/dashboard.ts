import { monthsProgress } from './utils'

// Lógica de la pantalla "Hoy": recibe filas ya leídas de Supabase y devuelve lo que se muestra.
// Sin acceso a la base, para poder testearla.

// Estados que no ocupan la agenda: el paciente no viene (el tardío igual consume su sesión).
const NOT_ATTENDING = ['cancelado', 'cancelado_tarde']

// Un turno de hoy "aplanado" para la pantalla (sin los arrays anidados de Supabase).
export interface DayAppt {
    id: string
    start_time: string
    end_time: string
    status: string
    is_unpaid: boolean
    room: string | null
    service: string | null
    patients: string[]
}

type One<T> = T | T[] | null | undefined
const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

// Fila de appointments tal como la devuelve el select de la pantalla "Hoy".
export interface DayApptRow {
    id: string
    start_time: string
    end_time: string
    status: string
    is_unpaid: boolean | null
    rooms?: One<{ name: string | null }>
    services?: One<{ name: string | null }>
    appointment_patients?: { patients: One<{ first_name: string | null; last_name: string | null }> }[] | null
}

export function toDayAppt(row: DayApptRow): DayAppt {
    return {
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
        status: row.status,
        is_unpaid: !!row.is_unpaid,
        room: first(row.rooms)?.name ?? null,
        service: first(row.services)?.name ?? null,
        patients: (row.appointment_patients ?? [])
            .map(ap => first(ap.patients))
            .filter(p => p !== null)
            .map(p => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
            .filter(Boolean),
    }
}

export interface DaySummary {
    total: number                    // turnos que ocupan agenda (sin cancelados)
    porEstado: Record<string, number>
    enCurso: DayAppt[]               // empezaron y todavía no terminaron
    proximo: DayAppt | null          // el primero que todavía no empezó
    sinConfirmar: DayAppt[]
    impagos: DayAppt[]
    lista: DayAppt[]                 // todos, ordenados por hora
}

export function summarizeDay(appts: DayAppt[], now: Date = new Date()): DaySummary {
    const lista = [...appts].sort((a, b) => a.start_time.localeCompare(b.start_time))
    const porEstado: Record<string, number> = {}
    for (const a of lista) porEstado[a.status] = (porEstado[a.status] ?? 0) + 1

    const activos = lista.filter(a => !NOT_ATTENDING.includes(a.status))
    const t = now.getTime()

    return {
        total: activos.length,
        porEstado,
        enCurso: activos.filter(a => new Date(a.start_time).getTime() <= t && new Date(a.end_time).getTime() > t),
        proximo: activos.find(a => new Date(a.start_time).getTime() > t) ?? null,
        sinConfirmar: activos.filter(a => a.status === 'pendiente'),
        impagos: activos.filter(a => a.is_unpaid),
        lista,
    }
}

// Pases mensuales vigentes que vencen dentro de `dias` días: para avisar y ofrecer renovar.
// Devuelve cada pase con su fecha de vencimiento, ordenados del que vence antes.
export function passesExpiringSoon<T extends {
    cuponera_type: string
    start_date: string | null
    total_months: number | null
    is_active?: boolean | null
}>(cuponeras: T[], dias = 7, now: Date = new Date()): (T & { vence: Date })[] {
    const limite = new Date(now)
    limite.setDate(limite.getDate() + dias)
    return cuponeras
        .filter(c => c.cuponera_type === 'months' && c.is_active !== false && c.start_date)
        .map(c => ({ ...c, ...monthsProgress(c.start_date, c.total_months) }))
        .filter(c => c.activa && c.vence !== null && c.vence <= limite)
        .map(c => ({ ...c, vence: c.vence as Date }))
        .sort((a, b) => a.vence.getTime() - b.vence.getTime())
}

// Insumos activos en o por debajo de su mínimo (si el mínimo es 0, solo cuando se agotan).
export function lowStock<T extends { quantity: number | string; min_quantity: number | string; is_active: boolean }>(items: T[]): T[] {
    return items.filter(i => i.is_active && Number(i.quantity) <= Number(i.min_quantity))
}
