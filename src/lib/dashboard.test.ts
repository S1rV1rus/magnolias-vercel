import { afterEach, describe, expect, it, vi } from 'vitest'
import { lowStock, passesExpiringSoon, summarizeDay, toDayAppt, type DayAppt } from './dashboard'

function appt(over: Partial<DayAppt>): DayAppt {
    return {
        id: Math.random().toString(36).slice(2),
        start_time: '2026-11-03T13:00:00.000Z',
        end_time: '2026-11-03T14:00:00.000Z',
        status: 'confirmado',
        is_unpaid: false,
        room: 'Consultorio 1',
        service: 'Masaje',
        patients: ['Ana Prueba'],
        ...over,
    }
}

describe('summarizeDay', () => {
    // 10:30 en Uruguay
    const now = new Date('2026-11-03T13:30:00.000Z')

    it('el próximo es el primero que no empezó, ignorando cancelados', () => {
        const r = summarizeDay([
            appt({ start_time: '2026-11-03T15:00:00.000Z', end_time: '2026-11-03T16:00:00.000Z', status: 'pendiente' }),
            appt({ start_time: '2026-11-03T12:00:00.000Z', end_time: '2026-11-03T13:00:00.000Z' }), // ya terminó
            appt({ start_time: '2026-11-03T14:00:00.000Z', end_time: '2026-11-03T15:00:00.000Z', status: 'cancelado' }),
        ], now)
        expect(r.proximo?.start_time).toBe('2026-11-03T15:00:00.000Z')
    })

    it('los cancelados (también los tardíos) se cuentan por estado pero no en el total', () => {
        const r = summarizeDay([
            appt({ status: 'confirmado' }),
            appt({ status: 'pendiente' }),
            appt({ status: 'cancelado' }),
            appt({ status: 'cancelado_tarde' }),
        ], now)
        expect(r.total).toBe(2)
        expect(r.porEstado).toEqual({ confirmado: 1, pendiente: 1, cancelado: 1, cancelado_tarde: 1 })
        expect(r.lista).toHaveLength(4)
    })

    it('en curso: empezó y no terminó', () => {
        const r = summarizeDay([
            appt({ id: 'ahora', start_time: '2026-11-03T13:00:00.000Z', end_time: '2026-11-03T14:00:00.000Z' }),
            appt({ id: 'despues', start_time: '2026-11-03T14:00:00.000Z', end_time: '2026-11-03T15:00:00.000Z' }),
        ], now)
        expect(r.enCurso.map(a => a.id)).toEqual(['ahora'])
        expect(r.proximo?.id).toBe('despues')
    })

    it('sin confirmar e impagos, sin contar cancelados', () => {
        const r = summarizeDay([
            appt({ id: 'p', status: 'pendiente' }),
            appt({ id: 'i', is_unpaid: true }),
            appt({ id: 'ci', status: 'cancelado', is_unpaid: true }),
        ], now)
        expect(r.sinConfirmar.map(a => a.id)).toEqual(['p'])
        expect(r.impagos.map(a => a.id)).toEqual(['i'])
    })

    it('ordena la lista por hora y no hay próximo si ya pasaron todos', () => {
        const r = summarizeDay([
            appt({ id: 'b', start_time: '2026-11-03T12:00:00.000Z', end_time: '2026-11-03T12:30:00.000Z' }),
            appt({ id: 'a', start_time: '2026-11-03T11:00:00.000Z', end_time: '2026-11-03T11:30:00.000Z' }),
        ], now)
        expect(r.lista.map(a => a.id)).toEqual(['a', 'b'])
        expect(r.proximo).toBeNull()
    })

    it('día vacío', () => {
        const r = summarizeDay([], now)
        expect(r).toMatchObject({ total: 0, proximo: null, enCurso: [], sinConfirmar: [], impagos: [], lista: [] })
    })
})

describe('toDayAppt', () => {
    it('aplana los objetos o arrays que devuelve Supabase', () => {
        const a = toDayAppt({
            id: 'x', start_time: 's', end_time: 'e', status: 'pendiente', is_unpaid: null,
            rooms: [{ name: 'Consultorio 2' }],
            services: { name: 'Masaje' },
            appointment_patients: [
                { patients: { first_name: 'Ana', last_name: 'Prueba' } },
                { patients: [{ first_name: 'Beto', last_name: null }] },
                { patients: null },
            ],
        })
        expect(a).toEqual({
            id: 'x', start_time: 's', end_time: 'e', status: 'pendiente', is_unpaid: false,
            room: 'Consultorio 2', service: 'Masaje', patients: ['Ana Prueba', 'Beto'],
        })
    })

    it('sin sala, servicio ni pacientes', () => {
        const a = toDayAppt({ id: 'x', start_time: 's', end_time: 'e', status: 'confirmado', is_unpaid: true })
        expect(a).toMatchObject({ room: null, service: null, patients: [], is_unpaid: true })
    })
})

describe('passesExpiringSoon', () => {
    afterEach(() => { vi.useRealTimers() })

    const pase = (start_date: string | null, total_months: number, extra = {}) =>
        ({ cuponera_type: 'months', start_date, total_months, is_active: true, ...extra })

    it('avisa los pases que vencen dentro de la ventana, del más próximo al más lejano', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-03T15:00:00.000Z'))
        const r = passesExpiringSoon([
            pase('2026-10-08', 1), // vence 08/11 → dentro de 7 días
            pase('2026-10-05', 1), // vence 05/11 → dentro de 7 días
            pase('2026-10-20', 1), // vence 20/11 → fuera
        ], 7)
        expect(r.map(c => c.start_date)).toEqual(['2026-10-05', '2026-10-08'])
    })

    it('ignora los ya vencidos, los inactivos, los de sesiones y los sin fecha', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-03T15:00:00.000Z'))
        const r = passesExpiringSoon([
            pase('2026-09-01', 1),                         // venció el 01/10
            pase('2026-10-05', 1, { is_active: false }),   // dado de baja a mano
            pase('2026-10-05', 1, { cuponera_type: 'sessions' }),
            pase(null, 1),
        ], 7)
        expect(r).toEqual([])
    })
})

describe('lowStock', () => {
    it('incluye los activos en o por debajo del mínimo', () => {
        const r = lowStock([
            { id: 'bajo', quantity: 2, min_quantity: 5, is_active: true },
            { id: 'justo', quantity: '5', min_quantity: '5', is_active: true },
            { id: 'ok', quantity: 10, min_quantity: 5, is_active: true },
            { id: 'inactivo', quantity: 0, min_quantity: 5, is_active: false },
            { id: 'agotado', quantity: 0, min_quantity: 0, is_active: true },
        ])
        expect(r.map(i => i.id)).toEqual(['bajo', 'justo', 'agotado'])
    })
})
