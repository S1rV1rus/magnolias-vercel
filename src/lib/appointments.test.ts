import { describe, expect, it } from 'vitest'
import {
    agendaFetchRange,
    debtPaymentAmounts,
    notesSuggestNoCharge,
    projectCuponeraSessions,
    type CuponeraApptRow,
} from './appointments'

describe('notesSuggestNoCharge', () => {
    it.each([
        'Regalo de cumpleaños',
        'cortesía de la casa',
        'Cortesia',
        'Big Box',
        'bigbox',
        'voucher 2x1',
        'Vouchers',
        'beca',
        'GRATIS',
        'ganó el sorteo',
        'canje',
    ])('detecta "%s"', notes => {
        expect(notesSuggestNoCharge(notes)).toBe(true)
    })

    it.each([
        'Turno de Rebeca',
        'regalito',
        'paga en efectivo',
        '',
        null,
        undefined,
    ])('no detecta %j', notes => {
        expect(notesSuggestNoCharge(notes)).toBe(false)
    })
})

describe('agendaFetchRange', () => {
    it('cubre el mes visible con 7 días de margen a cada lado', () => {
        const { start, end } = agendaFetchRange(new Date(2026, 9, 15, 10, 0)) // 15/10/2026
        expect(start).toEqual(new Date(2026, 8, 24)) // 24/09
        expect(end).toEqual(new Date(2026, 10, 8)) // 08/11 (exclusivo)
    })

    it('incluye la semana que cruza de mes en la vista semanal', () => {
        // Semana lun 26/10 – dom 1/11 vista desde el 1/11: la ventana de noviembre debe
        // incluir los turnos del 26 al 31 de octubre.
        const { start } = agendaFetchRange(new Date(2026, 10, 1))
        expect(start.getTime()).toBeLessThanOrEqual(new Date(2026, 9, 26).getTime())
    })

    it('cruza el cambio de año', () => {
        const { start, end } = agendaFetchRange(new Date(2026, 11, 31))
        expect(start).toEqual(new Date(2026, 10, 24))
        expect(end).toEqual(new Date(2027, 0, 8))
    })
})

describe('projectCuponeraSessions', () => {
    const row = (id: string, start: string, index: number | null, cuponera = 'c1'): CuponeraApptRow => ({
        id, start_time: start, status: index == null ? 'pendiente' : 'confirmado', cuponera_id: cuponera, cuponera_session_index: index,
    })

    it('usa el índice sellado en los consumidos y proyecta los pendientes sobre used_sessions', () => {
        const info = projectCuponeraSessions([
            row('a', '2026-10-01T13:00:00Z', 1),
            row('b', '2026-10-08T13:00:00Z', 2),
            row('c', '2026-10-15T13:00:00Z', null),
            row('d', '2026-10-22T13:00:00Z', null),
        ], { c1: 2 })
        expect(info).toEqual({
            a: { number: 1, projected: false },
            b: { number: 2, projected: false },
            c: { number: 3, projected: true },
            d: { number: 4, projected: true },
        })
    })

    it('proyecta los pendientes en orden cronológico aunque lleguen desordenados', () => {
        const info = projectCuponeraSessions([
            row('later', '2026-11-20T13:00:00Z', null),
            row('earlier', '2026-10-20T13:00:00Z', null),
        ], { c1: 5 })
        expect(info.earlier).toEqual({ number: 6, projected: true })
        expect(info.later).toEqual({ number: 7, projected: true })
    })

    it('con todos los pendientes de la cuponera, un turno de noviembre se numera igual que antes del filtro', () => {
        // La agenda ahora carga solo el mes visible, pero la proyección recibe TODOS los
        // pendientes de la cuponera (consulta aparte). Mirando noviembre, el pendiente de
        // octubre tiene que seguir contando para numerar el de noviembre.
        const all = [
            row('oct', '2026-10-28T13:00:00Z', null),
            row('nov', '2026-11-04T13:00:00Z', null),
        ]
        expect(projectCuponeraSessions(all, { c1: 3 }).nov).toEqual({ number: 5, projected: true })
    })

    it('numera cada cuponera por separado', () => {
        const info = projectCuponeraSessions([
            row('x', '2026-10-01T13:00:00Z', null, 'c1'),
            row('y', '2026-10-01T13:00:00Z', null, 'c2'),
        ], { c1: 0, c2: 7 })
        expect(info.x.number).toBe(1)
        expect(info.y.number).toBe(8)
    })

    it('si no se conoce used_sessions arranca de 0', () => {
        expect(projectCuponeraSessions([row('a', '2026-10-01T13:00:00Z', null)], {}).a.number).toBe(1)
    })
})

describe('debtPaymentAmounts', () => {
    const appts = [
        { services: { price: 1500 } },
        { services: { price: 1500 } },
        { services: { price: 3000 } },
    ]

    it('reparte el total según el precio de lista y la suma da lo cobrado', () => {
        const amounts = debtPaymentAmounts('6000', appts)
        expect(amounts).toEqual([1500, 1500, 3000])
        expect((amounts as number[]).reduce((s, x) => s + x, 0)).toBe(6000)
    })

    it('ya no escribe el total completo en cada turno', () => {
        const amounts = debtPaymentAmounts('3000', appts) as number[]
        expect(amounts.every(a => a < 3000)).toBe(true)
        expect(amounts.reduce((s, x) => s + x, 0)).toBe(3000)
    })

    it('sin precios reparte en partes iguales', () => {
        expect(debtPaymentAmounts('100', [{ services: null }, { services: { price: null } }])).toEqual([50, 50])
    })

    it('acepta precios que vienen como texto (numeric de Postgres)', () => {
        expect(debtPaymentAmounts('300', [{ services: { price: '100' } }, { services: { price: '200' } }])).toEqual([100, 200])
    })

    it('sin monto deja todos en null (Contabilidad usa el precio de lista)', () => {
        expect(debtPaymentAmounts('', appts)).toEqual([null, null, null])
        expect(debtPaymentAmounts('abc', appts)).toEqual([null, null, null])
    })
})
