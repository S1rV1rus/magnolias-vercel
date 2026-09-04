import { supabase } from './supabase'

// Los canjes de una cuponera por sesiones se numeran 1..N en UNA sola secuencia compartida:
// los turnos guardan el número en appointments.cuponera_session_index y los canjes manuales en
// clinical_history.cuponera_session_index (marcados con el tag [CUPONERA:<id>] en las notas).
// Al borrar un canje del medio hay que bajar 1 a todos los posteriores en LAS DOS tablas; si no
// queda un hueco y el próximo canje reusa un número que ya existía.
export async function shiftCuponeraSessionIndexes(cuponeraId: string, deletedIndex: number) {
    const { data: laterAppts, error: apptError } = await supabase
        .from('appointments')
        .select('id, cuponera_session_index')
        .eq('cuponera_id', cuponeraId)
        .gt('cuponera_session_index', deletedIndex)

    if (apptError) console.error('Error leyendo turnos posteriores de la cuponera:', apptError)

    for (const a of laterAppts ?? []) {
        const { error } = await supabase.from('appointments')
            .update({ cuponera_session_index: (a.cuponera_session_index as number) - 1 })
            .eq('id', a.id)
        if (error) console.error('Error reacomodando el número de sesión del turno:', error)
    }

    const { data: laterEntries, error: historyError } = await supabase
        .from('clinical_history')
        .select('id, cuponera_session_index')
        .like('notes', `%[CUPONERA:${cuponeraId}]%`)
        .gt('cuponera_session_index', deletedIndex)

    if (historyError) console.error('Error leyendo canjes manuales posteriores de la cuponera:', historyError)

    for (const h of laterEntries ?? []) {
        const { error } = await supabase.from('clinical_history')
            .update({ cuponera_session_index: (h.cuponera_session_index as number) - 1 })
            .eq('id', h.id)
        if (error) console.error('Error reacomodando el número de sesión del canje manual:', error)
    }
}
