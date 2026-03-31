import { supabase } from './supabase'

export async function writeLog({
    action,
    userName,
    entityType,
    entityId,
    details,
}: {
    action: string
    userName: string
    entityType?: string
    entityId?: string
    details?: Record<string, any>
}) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('activity_logs').insert([{
        auth_user_id: user?.id ?? null,
        user_name: userName,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        details: details ?? {},
    }])
    if (error) console.warn('[writeLog] failed:', error.message)
}
