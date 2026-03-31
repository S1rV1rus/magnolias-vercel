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
        // Verify caller is authenticated
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized: no token' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Create admin client (service role)
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        // Verify the caller is an admin using their token
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user: caller }, error: authError } = await userClient.auth.getUser()
        if (authError || !caller) {
            return new Response(JSON.stringify({ error: 'Unauthorized: invalid token' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        if (caller.app_metadata?.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const body = await req.json()
        const { email, password, nombre, professional_id } = body

        if (!email || !password || !nombre) {
            return new Response(JSON.stringify({ error: 'email, password y nombre son requeridos' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Create the Supabase Auth user with staff role
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: { role: 'staff' },
            user_metadata: { nombre, rol: 'staff' },
        })

        if (createError) {
            return new Response(JSON.stringify({ error: createError.message }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Optionally link the auth user id to the professional record
        if (professional_id && newUser?.user) {
            await adminClient
                .from('professionals')
                .update({ auth_user_id: newUser.user.id })
                .eq('id', professional_id)
        }

        return new Response(JSON.stringify({ user_id: newUser?.user?.id }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
