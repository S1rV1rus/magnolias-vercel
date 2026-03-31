import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function Login() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (authError) {
            setError('Email o contraseña incorrectos. Volvé a intentarlo.')
        } else {
            navigate('/')
        }
        setLoading(false)
    }


    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
            {/* Atmospheric background blobs */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute w-96 h-96 rounded-full blur-3xl opacity-10"
                    style={{
                        background: 'hsl(211 100% 62%)',
                        top: '-10%',
                        right: '-5%',
                    }}
                />
                <div
                    className="absolute w-80 h-80 rounded-full blur-3xl opacity-10"
                    style={{
                        background: 'hsl(224 100% 66%)',
                        bottom: '-5%',
                        left: '-5%',
                    }}
                />
            </div>

            {/* Login Card */}
            <div className="relative w-full max-w-md">
                <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 md:p-10">

                    {/* Logo / Brand */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 ring-1 ring-primary/20">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                strokeWidth="1.5"
                                stroke="currentColor"
                                className="w-7 h-7 text-primary"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 6.75a5.25 5.25 0 110 10.5A5.25 5.25 0 0112 6.75zM15.75 3.75a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM5.25 3.75a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"
                                />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-foreground tracking-tight">Clínica Magnolias</h1>
                        <p className="text-sm text-muted-foreground mt-1">Centro de Estética — Panel Interno</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                required
                                placeholder="usuario@magnolias.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground" htmlFor="password">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    placeholder="••••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    onClick={() => setShowPassword(v => !v)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Ingresando...
                                </>
                            ) : (
                                'Ingresar al sistema'
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <p className="text-center text-xs text-muted-foreground mt-6">
                        Solo personal autorizado · Clínica Magnolias &copy; {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        </div>
    )
}
