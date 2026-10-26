import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createStockItem } from './stock'

// Cliente de Supabase falso con lo mínimo que usa createStockItem. Simula la tabla
// stock_items (un solo insumo) y, si `triggerSums`, el trigger trg_update_stock_quantity que
// suma cada movimiento 'addition' a quantity.
interface Result { data?: unknown; error: unknown }
interface Op { table: string; action: 'select' | 'insert' | 'update'; payload?: Record<string, unknown> }

function fakeClient({ triggerSums = true, txError = null as unknown, createError = null as unknown } = {}) {
    const ops: Op[] = []
    const db = { quantity: NaN }

    const run = (op: Op): Result => {
        if (op.table === 'stock_items' && op.action === 'insert') {
            if (createError) return { data: null, error: createError }
            db.quantity = Number(op.payload?.quantity)
            return { data: { id: 'item-1' }, error: null }
        }
        if (op.table === 'stock_transactions' && op.action === 'insert') {
            if (txError) return { error: txError }
            if (triggerSums) db.quantity += Number(op.payload?.quantity)
            return { error: null }
        }
        if (op.table === 'stock_items' && op.action === 'select') {
            return { data: { quantity: db.quantity }, error: null }
        }
        if (op.table === 'stock_items' && op.action === 'update') {
            db.quantity = Number(op.payload?.quantity)
            return { error: null }
        }
        throw new Error(`operación inesperada: ${op.action} ${op.table}`)
    }

    const client = {
        from(table: string) {
            const op: Op = { table, action: 'select' }
            const builder = {
                insert(payload: Record<string, unknown>) { op.action = 'insert'; op.payload = payload; return builder },
                update(payload: Record<string, unknown>) { op.action = 'update'; op.payload = payload; return builder },
                select() { return builder },
                eq() { return builder },
                single() { return builder },
                then<T>(onFulfilled: (r: Result) => T, onRejected?: (e: unknown) => T) {
                    ops.push(op)
                    return Promise.resolve().then(() => run(op)).then(onFulfilled, onRejected)
                },
            }
            return builder
        },
    }
    return { client: client as unknown as SupabaseClient, ops, db }
}

const item = { name: 'Gasas', unit: 'unidades', description: null, label: 'Consultorio 1', min_quantity: 5 }
const user = { id: 'user-1', name: 'Ana' }

afterEach(() => vi.restoreAllMocks())

describe('createStockItem', () => {
    it('con el trigger activo el stock inicial queda una sola vez (antes se duplicaba)', async () => {
        const { client, ops, db } = fakeClient()
        await createStockItem(client, item, 10, user)

        expect(db.quantity).toBe(10)
        expect(ops[0]).toMatchObject({ table: 'stock_items', action: 'insert', payload: { quantity: 0, name: 'Gasas' } })
        expect(ops[1]).toMatchObject({
            table: 'stock_transactions', action: 'insert',
            payload: { item_id: 'item-1', type: 'addition', quantity: 10, user_id: 'user-1', user_name: 'Ana' },
        })
        expect(ops.some(o => o.action === 'update')).toBe(false)
    })

    it('si el trigger no existe, carga la cantidad directo', async () => {
        const { client, ops, db } = fakeClient({ triggerSums: false })
        await createStockItem(client, item, 10, user)

        expect(db.quantity).toBe(10)
        expect(ops.at(-1)).toMatchObject({ table: 'stock_items', action: 'update', payload: { quantity: 10 } })
    })

    it('si falla el movimiento, carga la cantidad directo y lo deja en consola', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { client, db } = fakeClient({ txError: { message: 'RLS' } })
        await createStockItem(client, item, 7, user)

        expect(db.quantity).toBe(7)
        expect(consoleError).toHaveBeenCalled()
    })

    it('sin usuario no inserta movimiento y carga la cantidad directo', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { client, ops, db } = fakeClient()
        await createStockItem(client, item, 4, { id: null, name: 'Staff' })

        expect(db.quantity).toBe(4)
        expect(ops.some(o => o.table === 'stock_transactions')).toBe(false)
    })

    it('con stock inicial 0 solo crea el insumo', async () => {
        const { client, ops, db } = fakeClient()
        await createStockItem(client, item, 0, user)

        expect(db.quantity).toBe(0)
        expect(ops).toHaveLength(1)
    })

    it('propaga el error si no se puede crear el insumo', async () => {
        const { client } = fakeClient({ createError: { message: 'duplicado' } })
        await expect(createStockItem(client, item, 10, user)).rejects.toEqual({ message: 'duplicado' })
    })
})
