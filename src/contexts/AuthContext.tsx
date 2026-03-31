import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
    user: User | null
    session: Session | null
    role: 'admin' | 'staff' | null
    isAdmin: boolean
    isStaff: boolean
    loading: boolean
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    role: null,
    isAdmin: false,
    isStaff: false,
    loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            setUser(data.session?.user ?? null)
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession)
            setUser(newSession?.user ?? null)
        })

        return () => listener?.subscription.unsubscribe()
    }, [])

    const rawRole = user?.app_metadata?.role as string | undefined
    const role: 'admin' | 'staff' | null = rawRole === 'admin' ? 'admin' : rawRole === 'staff' ? 'staff' : null

    return (
        <AuthContext.Provider value={{
            user,
            session,
            role,
            isAdmin: role === 'admin',
            isStaff: role === 'staff',
            loading,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}
