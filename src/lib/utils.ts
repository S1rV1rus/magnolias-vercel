import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
