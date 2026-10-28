import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, PHOTO_URL_TTL_SECONDS, photoFailureMessage, signPhotoUrls, uploadHistoryPhotos } from './photos'

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

// Cliente falso para uploadHistoryPhotos: storage.upload/remove y from(tabla).insert.
// uploadErrors / insertErrors dicen qué foto (por posición) falla en cada paso.
function fakeUploadClient({ uploadErrors = [] as number[], insertErrors = [] as number[] } = {}) {
    let uploadCall = 0
    let insertCall = 0
    type Result = Promise<{ error: Error | null }>
    const upload = vi.fn<(path: string, file: File) => Result>(async () => ({ error: uploadErrors.includes(uploadCall++) ? new Error('upload') : null }))
    const remove = vi.fn<(paths: string[]) => Result>(async () => ({ error: null }))
    const insert = vi.fn<(row: Record<string, unknown>) => Result>(async () => ({ error: insertErrors.includes(insertCall++) ? new Error('insert') : null }))
    const client = {
        storage: { from: vi.fn(() => ({ upload, remove })) },
        from: vi.fn(() => ({ insert })),
    } as unknown as SupabaseClient
    return { client, upload, remove, insert }
}

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

describe('uploadHistoryPhotos', () => {
    it('sube y anota cada foto, numerándolas desde firstOrder', async () => {
        const { client, upload, insert, remove } = fakeUploadClient()
        const res = await uploadHistoryPhotos(client, {
            patientId: 'p1', historyId: 'h1', files: [file('a.png'), file('b.jpg')], firstOrder: 2,
        })
        expect(res).toEqual({ failed: 0 })
        expect(upload).toHaveBeenCalledTimes(2)
        expect(upload.mock.calls[0][0]).toMatch(/^p1\/h1\/[\w-]+\.png$/)
        expect(insert.mock.calls.map(c => c[0])).toEqual([
            expect.objectContaining({ clinical_history_id: 'h1', patient_id: 'p1', photo_order: 2 }),
            expect.objectContaining({ photo_order: 3 }),
        ])
        expect(remove).not.toHaveBeenCalled()
    })

    it('cuenta la foto que no subió y no la anota', async () => {
        const { client, insert } = fakeUploadClient({ uploadErrors: [0] })
        const res = await uploadHistoryPhotos(client, { patientId: 'p1', historyId: 'h1', files: [file('a.jpg'), file('b.jpg')] })
        expect(res).toEqual({ failed: 1 })
        expect(insert).toHaveBeenCalledTimes(1)
    })

    it('si falla la anotación en la base, borra el archivo subido', async () => {
        const { client, upload, remove } = fakeUploadClient({ insertErrors: [0] })
        const res = await uploadHistoryPhotos(client, { patientId: 'p1', historyId: 'h1', files: [file('a.jpg')] })
        expect(res).toEqual({ failed: 1 })
        expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]])
    })
})

describe('photoFailureMessage', () => {
    it('no dice nada si salieron todas', () => {
        expect(photoFailureMessage(0, 3)).toBeNull()
    })
    it('avisa cuántas fallaron', () => {
        expect(photoFailureMessage(2, 3)).toBe('No se pudieron guardar 2 de 3 fotos. Abrí la entrada y volvé a agregarlas.')
        expect(photoFailureMessage(1, 1)).toBe('No se pudo guardar la foto. Abrí la entrada y volvé a agregarla.')
        expect(photoFailureMessage(3, 3)).toBe('No se pudo guardar ninguna de las 3 fotos. Abrí la entrada y volvé a agregarlas.')
    })
})
