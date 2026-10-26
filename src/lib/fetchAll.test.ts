import { describe, expect, it } from 'vitest'
import { fetchAllRows, PAGE_SIZE } from './fetchAll'

// Simula una tabla de `total` filas servida de a páginas, como PostgREST con .range()
function fakeTable(total: number, failAtPage?: number) {
    const calls: [number, number][] = []
    const page = async (from: number, to: number) => {
        calls.push([from, to])
        if (failAtPage !== undefined && calls.length - 1 === failAtPage) {
            return { data: null, error: { message: 'boom' } }
        }
        const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }))
        return { data, error: null }
    }
    return { page, calls }
}

describe('fetchAllRows', () => {
    it('trae más de 1000 filas pidiendo de a páginas (antes se cortaba en 1000)', async () => {
        const { page, calls } = fakeTable(2500)
        const { data, error } = await fetchAllRows(page)

        expect(error).toBeNull()
        expect(data).toHaveLength(2500)
        expect(data.at(-1)).toEqual({ id: 2499 })
        expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    })

    it('con menos de una página hace una sola consulta', async () => {
        const { page, calls } = fakeTable(15)
        const { data } = await fetchAllRows(page)
        expect(data).toHaveLength(15)
        expect(calls).toHaveLength(1)
    })

    it('si el total es múltiplo exacto de la página, pide una más y termina vacía', async () => {
        const { page, calls } = fakeTable(PAGE_SIZE * 2)
        const { data } = await fetchAllRows(page)
        expect(data).toHaveLength(PAGE_SIZE * 2)
        expect(calls).toHaveLength(3)
    })

    it('tabla vacía', async () => {
        const { page } = fakeTable(0)
        expect((await fetchAllRows(page)).data).toEqual([])
    })

    it('si una página falla devuelve el error y lo que trajo hasta ahí', async () => {
        const { page } = fakeTable(2500, 1)
        const { data, error } = await fetchAllRows(page)
        expect(error).toEqual({ message: 'boom' })
        expect(data).toHaveLength(1000)
    })
})
