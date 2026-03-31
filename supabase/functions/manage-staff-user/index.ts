import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        // Verify caller is admin
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user: caller } } = await userClient.auth.getUser()
        if (!caller || caller.app_metadata?.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // action: 'disable' | 'enable' | 'delete' | 'update_password'
        const { action, auth_user_id, password } = await req.json()

        if (!auth_user_id) {
            return new Response(JSON.stringify({ error: 'auth_user_id requerido' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'disable') {
            // Ban the user indefinitely so they cannot log in
            const { error } = await adminClient.auth.admin.updateUserById(auth_user_id, {
                ban_duration: '876600h', // 100 years
            })
            if (error) throw error
        } else if (action === 'enable') {
            // Remove the ban
            const { error } = await adminClient.auth.admin.updateUserById(auth_user_id, {
                ban_duration: 'none',
            })
            if (error) throw error
        } else if (action === 'delete') {
            // Permanently delete the auth user
            const { error } = await adminClient.auth.admin.deleteUser(auth_user_id)
            if (error) throw error
        } else if (action === 'update_password') {
            if (!password || password.length < 6) {
                return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
            const { error } = await adminClient.auth.admin.updateUserById(auth_user_id, {
                password: password
            })
            if (error) throw error
        } else {
            return new Response(JSON.stringify({ error: 'action must be disable | enable | delete | update_password' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
