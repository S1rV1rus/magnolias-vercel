import { describe, expect, it } from 'vitest'
import { localDateStr, localDayRangeIso, splitAmount } from './utils'

describe('zona horaria de los tests', () => {
    it('corre en hora de Uruguay (UTC-3)', () => {
        expect(new Date('2026-10-26T12:00:00Z').getTimezoneOffset()).toBe(180)
    })
})

describe('localDateStr', () => {
    it('devuelve la fecha local, no la UTC, después de las 21:00', () => {
        const late = new Date('2026-10-31T23:30:00-03:00')
        expect(late.toISOString().slice(0, 10)).toBe('2026-11-01') // el bug que se corrigió
        expect(localDateStr(late)).toBe('2026-10-31')
    })

    it('a la medianoche local ya es el día nuevo', () => {
        expect(localDateStr(new Date('2026-11-01T00:00:00-03:00'))).toBe('2026-11-01')
    })
})

describe('localDayRangeIso', () => {
    it('va desde las 00:00 locales del primer día hasta las 00:00 locales del día siguiente al último', () => {
        expect(localDayRangeIso('2026-10-01', '2026-10-31')).toEqual({
            startIso: '2026-10-01T03:00:00.000Z',
            endIso: '2026-11-01T03:00:00.000Z',
        })
    })

    it('incluye un turno a las 23:30 del último día y excluye uno del día siguiente', () => {
        const { startIso, endIso } = localDayRangeIso('2026-10-01', '2026-10-31')
        const inRange = (iso: string) => iso >= startIso && iso < endIso
        expect(inRange(new Date('2026-10-31T23:30:00-03:00').toISOString())).toBe(true)
        expect(inRange(new Date('2026-11-01T00:10:00-03:00').toISOString())).toBe(false)
        expect(inRange(new Date('2026-10-01T00:00:00-03:00').toISOString())).toBe(true)
        expect(inRange(new Date('2026-09-30T23:59:00-03:00').toISOString())).toBe(false)
    })

    it('un rango de un solo día cubre las 24 horas', () => {
        const { startIso, endIso } = localDayRangeIso('2026-12-31', '2026-12-31')
        expect(startIso).toBe('2026-12-31T03:00:00.000Z')
        expect(endIso).toBe('2027-01-01T03:00:00.000Z')
    })
})

describe('splitAmount', () => {
    const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100

    it('reparte en proporción a los pesos', () => {
        expect(splitAmount(3000, [1000, 2000])).toEqual([1000, 2000])
    })

    it('reparte en partes iguales si no hay pesos y la suma da exacto', () => {
        const parts = splitAmount(1000, [0, 0, 0])
        expect(parts).toEqual([333.33, 333.33, 333.34])
        expect(sum(parts)).toBe(1000)
    })

    it('la suma siempre coincide con el total', () => {
        for (const [total, weights] of [
            [1234.56, [100, 250, 75.5]],
            [100, [1, 1, 1]],
            [999.99, [3, 7]],
            [50, [800]],
        ] as [number, number[]][]) {
            expect(sum(splitAmount(total, weights))).toBe(total)
        }
    })

    it('un solo ítem se lleva todo', () => {
        expect(splitAmount(1500, [1200])).toEqual([1500])
    })
})
