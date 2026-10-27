import type { SupabaseClient } from '@supabase/supabase-js'

export const PHOTO_BUCKET = 'patient-photos'

// Cuánto dura cada link firmado: una jornada, para que las fotos no se rompan con la ficha abierta.
// Al recargar la ficha se piden links nuevos.
export const PHOTO_URL_TTL_SECONDS = 60 * 60 * 8

// Devuelve { storage_path → URL firmada } para las fotos clínicas, en un solo pedido.
// El bucket es privado: sin URL firmada (y sin estar logueado) las fotos no se pueden abrir.
// Las rutas que fallan (archivo borrado, etc.) quedan fuera del mapa.
export async function signPhotoUrls(client: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return {}

    const { data, error } = await client.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS)
    if (error) throw error

    const urls: Record<string, string> = {}
    for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl
    }
    return urls
}
