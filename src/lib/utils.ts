import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export type Currency = 'UYU' | 'USD'

// Símbolo corto para la moneda de una cuponera/cobro.
export function currencySymbol(currency?: string | null): string {
    return currency === 'USD' ? 'US$' : '$'
}

// Formatea un monto con su moneda. Pesos uruguayos: "$ 1.234"; dólares: "US$ 1.234".
// Si el monto es nulo devuelve "—".
export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
    if (amount === null || amount === undefined) return '—'
    const n = Number(amount)
    if (Number.isNaN(n)) return '—'
    return `${currencySymbol(currency)} ${n.toLocaleString('es-UY')}`
}

// Progreso de una cuponera "por tiempo" (pase mensual) calculado AUTOMÁTICAMENTE por fecha,
// no a mano: cuántos meses transcurrieron desde start_date, cuántos restan, cuándo vence y si
// sigue activa. Así un pase mensual se va contabilizando solo mes a mes.
export function monthsProgress(startDate: string | null | undefined, totalMonths: number | null | undefined) {
    const total = totalMonths || 0
    if (!startDate) {
        return { transcurridos: 0, restantes: total, vence: null as Date | null, activa: true }
    }
    const start = new Date(startDate + 'T12:00:00')
    const now = new Date()
    let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
    if (now.getDate() < start.getDate()) m -= 1 // todavía no se completó el mes en curso
    const transcurridos = Math.max(0, Math.min(m, total))
    const restantes = Math.max(0, total - transcurridos)
    const vence = new Date(start)
    vence.setMonth(vence.getMonth() + total)
    return { transcurridos, restantes, vence, activa: now < vence }
}

// Reparte un monto total entre varios ítems en proporción a sus pesos (en partes iguales si
// ninguno tiene peso). Redondea a centésimos y deja el resto en el último para que la suma
// dé exactamente el total.
export function splitAmount(total: number, weights: number[]): number[] {
    const sumWeights = weights.reduce((s, w) => s + w, 0)
    const parts = weights.map(w => {
        const share = sumWeights > 0 ? w / sumWeights : 1 / weights.length
        return Math.round(total * share * 100) / 100
    })
    const allButLast = parts.slice(0, -1).reduce((s, p) => s + p, 0)
    parts[parts.length - 1] = Math.round((total - allButLast) * 100) / 100
    return parts
}

// Fecha LOCAL en formato 'yyyy-MM-dd'. No usar toISOString().split('T')[0]: devuelve la fecha
// en UTC, y en Uruguay (UTC-3) a partir de las 21:00 da el día siguiente.
export function localDateStr(d: Date = new Date()): string {
    return format(d, 'yyyy-MM-dd')
}

// Rango de días locales ('yyyy-MM-dd', ambos inclusive) como instantes ISO para filtrar
// timestamps: desde las 00:00 locales de `from` hasta las 00:00 locales del día siguiente a
// `to`. Usar con .gte(startIso) y .lt(endIso).
export function localDayRangeIso(from: string, to: string) {
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
}
