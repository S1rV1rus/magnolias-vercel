import { format } from 'date-fns'
import { supabase } from './supabase'

// Las gift cards se canjean solas desde la agenda: un turno marcado "sin cargo"
// (appointments.is_gift) puede tener una tarjeta vinculada (appointments.gift_card_id) y,
// cuando el turno queda consumido (confirmado / completado / cancelado con penalidad), la
// tarjeta pasa a 'usada'. Si el turno vuelve a pendiente, se cancela, se borra o se desvincula
// la tarjeta, se deshace el canje y vuelve a 'vigente'.

// Lo mínimo que necesita la agenda de una tarjeta: identificarla, mostrarla y canjearla.
export type GiftCardRow = {
    id: string
    code: string
    status: string
    amount: number | null
    currency: string | null
    service_id: string | null
    redeemed_at: string | null
}

// Estados en los que el turno ya consumió la tarjeta (mismo criterio que usan la cuponera al
// borrar el turno y la historia clínica). Si el turno nunca estuvo en uno de estos estados no
// fue él quien canjeó la tarjeta, así que tampoco es quién para deshacer el canje: puede
// haberlo hecho alguien a mano desde el módulo de Gift Cards.
export const GIFT_CARD_CONSUMED_STATUSES = ['confirmado', 'cancelado_tarde', 'completado']

// Resultado del canje: 'ok' si lo tomó este turno, 'ya_canjeada' si la tarjeta ya estaba usada
// (se la llevó otro turno o se canjeó a mano) y 'error' si la base rechazó el update.
export type RedeemResult = 'ok' | 'ya_canjeada' | 'error'

const GIFT_CARD_COLUMNS = 'id, code, status, amount, currency, service_id, redeemed_at'

const normalizeCode = (code: string) => code.trim().toLowerCase()

// Busca una tarjeta por su código, sin distinguir mayúsculas ni espacios sobrantes.
// Primero el match exacto: los códigos son texto libre y los comodines del patrón del ilike
// ('_', '%', y el '*' que PostgREST traduce a '%') hacen que un código como BIGBOX_2024
// matchee de más y que la fila buena se caiga del limit. El ilike queda solo como red para
// las diferencias de mayúsculas, y el match exacto se confirma acá contra el código normalizado.
export async function findGiftCardByCode(code: string): Promise<GiftCardRow | null> {
    const clean = code.trim()
    if (!clean) return null

    const { data: exact, error: exactError } = await supabase
        .from('gift_cards')
        .select(GIFT_CARD_COLUMNS)
        .eq('code', clean)
        .limit(1)

    if (exactError) {
        console.error('Error buscando la gift card:', exactError)
        return null
    }
    if (exact && exact.length > 0) return exact[0] as GiftCardRow

    const { data, error } = await supabase
        .from('gift_cards')
        .select(GIFT_CARD_COLUMNS)
        .ilike('code', clean)
        .limit(5)

    if (error) {
        console.error('Error buscando la gift card:', error)
        return null
    }

    return (data ?? []).find(c => normalizeCode(c.code ?? '') === normalizeCode(clean)) ?? null
}

// Marca la tarjeta como canjeada. El tratamiento del canje es el del turno; si el turno no
// tiene servicio, se deja el que ya traía la tarjeta.
// El update es condicional (solo si sigue vigente): así no pisa el canje que ya hizo otro
// turno u otra pestaña. Si no toma efecto, el llamador tiene que avisarle a quien guardó.
export async function redeemGiftCard(card: Pick<GiftCardRow, 'id' | 'service_id'>, serviceId?: string | null): Promise<RedeemResult> {
    const { data, error } = await supabase.from('gift_cards').update({
        status: 'usada',
        // Fecha local, no UTC: con toISOString() un canje después de las 21:00 en Uruguay
        // (UTC-3) se guardaba con la fecha del día siguiente.
        redeemed_at: format(new Date(), 'yyyy-MM-dd'),
        redeemed_service_id: serviceId || card.service_id || null,
    })
        .eq('id', card.id)
        .eq('status', 'vigente')
        .select('id')

    if (error) {
        console.error('Error marcando la gift card como usada:', error)
        return 'error'
    }

    return (data?.length ?? 0) > 0 ? 'ok' : 'ya_canjeada'
}

// Deshace el canje: misma reversión que el botón "Reactivar" del módulo de Gift Cards.
// Devuelve si la liberación se aplicó, para que el llamador pueda avisar si falló.
export async function releaseGiftCard(cardId: string): Promise<boolean> {
    const { error } = await supabase.from('gift_cards')
        .update({ status: 'vigente', redeemed_at: null, redeemed_service_id: null })
        .eq('id', cardId)

    if (error) {
        console.error('Error liberando la gift card:', error)
        return false
    }

    return true
}
