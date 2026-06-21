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
