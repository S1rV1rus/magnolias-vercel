// PostgREST devuelve como máximo 1000 filas por consulta (max_rows de Supabase) y corta sin
// avisar. Para listas que pueden pasar ese número (pacientes, turnos impagos) se pide de a
// páginas con .range() hasta que una venga incompleta.
//
// `page` tiene que armar la consulta de cero en cada llamada y con un orden ESTABLE (que
// termine en una columna única, ej. .order('id')); si no, las páginas pueden repetir o saltear
// filas.
export const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await page(from, from + PAGE_SIZE - 1)
        if (error) return { data: rows, error }
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
    }
}
