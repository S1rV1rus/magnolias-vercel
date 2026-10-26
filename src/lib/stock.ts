import type { SupabaseClient } from '@supabase/supabase-js'

export interface NewStockItem {
    name: string
    unit: string
    description: string | null
    label: string | null
    min_quantity: number
}

// Crea un insumo con su stock inicial. Se inserta en 0 y el stock inicial entra como
// movimiento 'addition', que el trigger trg_update_stock_quantity suma a quantity. Antes se
// insertaba además quantity=initial_stock y el trigger lo volvía a sumar (stock duplicado).
// Si el movimiento no se pudo registrar (o el trigger no lo sumó), se carga la cantidad
// directo para no dejar el insumo en 0. Lanza el error de Supabase si algo falla.
export async function createStockItem(
    client: SupabaseClient,
    item: NewStockItem,
    initialStock: number,
    user: { id: string | null; name: string },
): Promise<void> {
    const { data: newItem, error: createError } = await client
        .from('stock_items')
        .insert({ ...item, quantity: 0 })
        .select()
        .single()

    if (createError) throw createError
    if (!newItem || initialStock <= 0) return

    const { error: txError } = user.id
        ? await client
            .from('stock_transactions')
            .insert({
                item_id: newItem.id,
                type: 'addition',
                quantity: initialStock,
                user_id: user.id,
                user_name: user.name,
                note: 'Stock inicial cargado al registrar el producto'
            })
        : { error: new Error('Sin usuario para registrar el movimiento') }

    const { data: saved } = await client
        .from('stock_items')
        .select('quantity')
        .eq('id', newItem.id)
        .single()
    if (txError || Number(saved?.quantity) !== initialStock) {
        if (txError) console.error('Error registrando stock inicial:', txError)
        const { error: qtyError } = await client
            .from('stock_items')
            .update({ quantity: initialStock })
            .eq('id', newItem.id)
        if (qtyError) throw qtyError
    }
}
