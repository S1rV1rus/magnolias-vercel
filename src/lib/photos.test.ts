import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, PHOTO_URL_TTL_SECONDS, signPhotoUrls } from './photos'

// Cliente falso con lo mínimo que usa signPhotoUrls: storage.from(bucket).createSignedUrls(paths, ttl).
function fakeClient(result: { data: unknown; error: unknown }) {
    const createSignedUrls = vi.fn(async () => result)
    const from = vi.fn(() => ({ createSignedUrls }))
    const client = { storage: { from } } as unknown as SupabaseClient
    return { client, from, createSignedUrls }
}

describe('signPhotoUrls', () => {
    it('firma todas las rutas en un solo pedido y devuelve ruta → URL', async () => {
        const { client, from, createSignedUrls } = fakeClient({
            data: [
                { path: 'p1/h1/a.jpg', signedUrl: 'https://x/a?token=1', error: null },
                { path: 'p1/h1/b.jpg', signedUrl: 'https://x/b?token=2', error: null },
            ],
            error: null,
        })
        const urls = await signPhotoUrls(client, ['p1/h1/a.jpg', 'p1/h1/b.jpg'])
        expect(urls).toEqual({ 'p1/h1/a.jpg': 'https://x/a?token=1', 'p1/h1/b.jpg': 'https://x/b?token=2' })
        expect(from).toHaveBeenCalledWith(PHOTO_BUCKET)
        expect(createSignedUrls).toHaveBeenCalledTimes(1)
        expect(createSignedUrls).toHaveBeenCalledWith(['p1/h1/a.jpg', 'p1/h1/b.jpg'], PHOTO_URL_TTL_SECONDS)
    })

    it('no llama al storage si no hay fotos', async () => {
        const { client, createSignedUrls } = fakeClient({ data: [], error: null })
        expect(await signPhotoUrls(client, [])).toEqual({})
        expect(createSignedUrls).not.toHaveBeenCalled()
    })

    it('saca rutas vacías y repetidas antes de pedir', async () => {
        const { client, createSignedUrls } = fakeClient({ data: [], error: null })
        await signPhotoUrls(client, ['a.jpg', '', 'a.jpg', 'b.jpg'])
        expect(createSignedUrls).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], PHOTO_URL_TTL_SECONDS)
    })

    it('deja afuera las fotos que no se pudieron firmar', async () => {
        const { client } = fakeClient({
            data: [
                { path: 'ok.jpg', signedUrl: 'https://x/ok', error: null },
                { path: 'borrada.jpg', signedUrl: null, error: 'Object not found' },
            ],
            error: null,
        })
        expect(await signPhotoUrls(client, ['ok.jpg', 'borrada.jpg'])).toEqual({ 'ok.jpg': 'https://x/ok' })
    })

    it('propaga el error si falla el pedido entero', async () => {
        const boom = new Error('sin conexión')
        const { client } = fakeClient({ data: null, error: boom })
        await expect(signPhotoUrls(client, ['a.jpg'])).rejects.toBe(boom)
    })
})
