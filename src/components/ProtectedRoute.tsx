import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
    adminOnly?: boolean
}

export function ProtectedRoute({ adminOnly = false }: ProtectedRouteProps) {
    const [session, setSession] = useState<Session | null | undefined>(undefined)
    const { isAdmin, loading } = useAuth()

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession)
        })

        return () => listener?.subscription.unsubscribe()
    }, [])

    // Still checking session
    if (session === undefined || loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <svg className="w-8 h-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            </div>
        )
    }

    // Not logged in → go to login
    if (!session) {
        return <Navigate to="/login" replace />
    }

    // Admin-only route: non-admin users get redirected to appointments
    if (adminOnly && !isAdmin) {
        return <Navigate to="/appointments" replace />
    }

    return <Outlet />
}
