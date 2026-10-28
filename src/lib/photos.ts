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

// Sube las fotos de una entrada de historia clínica y las anota en clinical_history_photos,
// numerándolas desde firstOrder. Devuelve cuántas fallaron para poder avisarle al usuario.
// Si el archivo subió pero la anotación en la base falló, se borra el archivo: si no, queda
// ocupando lugar en el bucket sin que ninguna ficha lo muestre.
export async function uploadHistoryPhotos(
    client: SupabaseClient,
    { patientId, historyId, files, firstOrder = 1 }: { patientId: string; historyId: string; files: File[]; firstOrder?: number },
): Promise<{ failed: number }> {
    let failed = 0
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${patientId}/${historyId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false })
        if (uploadError) {
            console.error('Error subiendo foto:', uploadError)
            failed++
            continue
        }
        const { error: insertError } = await client.from('clinical_history_photos').insert({
            clinical_history_id: historyId,
            patient_id: patientId,
            storage_path: path,
            photo_order: firstOrder + i,
        })
        if (insertError) {
            console.error('Error registrando foto:', insertError)
            await client.storage.from(PHOTO_BUCKET).remove([path])
            failed++
        }
    }
    return { failed }
}

// Mensaje para el usuario cuando alguna foto no se pudo guardar (null si salieron todas).
export function photoFailureMessage(failed: number, total: number): string | null {
    if (failed <= 0) return null
    if (failed < total) return `No se pudieron guardar ${failed} de ${total} fotos. Abrí la entrada y volvé a agregarlas.`
    return total === 1
        ? 'No se pudo guardar la foto. Abrí la entrada y volvé a agregarla.'
        : `No se pudo guardar ninguna de las ${total} fotos. Abrí la entrada y volvé a agregarlas.`
}
