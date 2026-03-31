import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Calendar, Users, Ticket, Settings, Home, LogOut, Activity, Menu, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ThemeToggle } from '../ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export function Layout() {
    const location = useLocation()
    const navigate = useNavigate()
    const { user, isAdmin } = useAuth()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/login')
    }

    const userName = (() => {
        const nombre: string = user?.user_metadata?.nombre || user?.email || 'Usuario'
        return nombre.split(' ')[0]
    })()

    const userRole = (() => {
        const role = user?.app_metadata?.role
        if (role === 'admin') return 'Administrador'
        const metaRol: string = user?.user_metadata?.rol || ''
        return metaRol
            ? metaRol.charAt(0).toUpperCase() + metaRol.slice(1)
            : 'Staff'
    })()

    const userInitial = userName.charAt(0).toUpperCase()

    const navigation = [
        { name: 'Dashboard', href: '/', icon: Home },
        { name: 'Agenda', href: '/appointments', icon: Calendar },
        { name: 'Pacientes', href: '/patients', icon: Users },
        { name: 'Cuponeras', href: '/coupons', icon: Ticket },
        { name: 'Actividad', href: '/logs', icon: Activity },
        ...(isAdmin ? [{ name: 'Configuración', href: '/settings', icon: Settings }] : []),
    ]

    const SidebarContent = () => (
        <>
            <div className="flex h-16 shrink-0 items-center px-6 border-b border-border">
                <span className="text-xl font-bold tracking-tight text-primary">Clínica Magnolias</span>
            </div>
            <nav className="flex-1 space-y-1 p-4">
                {navigation.map((item) => {
                    const isActive = location.pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                                isActive
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors'
                            )}
                        >
                            <item.icon
                                className={cn(
                                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground',
                                    'mr-3 h-5 w-5 flex-shrink-0'
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* User profile */}
            <div className="border-t border-border p-4 flex flex-col gap-4">
                <ThemeToggle />
                <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                        <p className="text-xs text-muted-foreground truncate">{userRole}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        title="Cerrar sesión"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </>
    )

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Desktop Sidebar */}
            <div className="w-64 border-r border-border bg-card flex-col hidden md:flex">
                <SidebarContent />
            </div>

            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Drawer */}
            <div
                className={cn(
                    'fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-in-out md:hidden',
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-border">
                    <span className="text-xl font-bold tracking-tight text-primary">Clínica Magnolias</span>
                    <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                    isActive
                                        ? 'bg-primary/20 text-primary'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                                    'group flex items-center rounded-md px-3 py-3 text-base font-medium transition-colors'
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground',
                                        'mr-3 h-5 w-5 flex-shrink-0'
                                    )}
                                    aria-hidden="true"
                                />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>
                <div className="border-t border-border p-4 flex flex-col gap-4">
                    <ThemeToggle />
                    <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {userInitial}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                            <p className="text-xs text-muted-foreground truncate">{userRole}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            title="Cerrar sesión"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Mobile Header */}
                <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:hidden shrink-0">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                        aria-label="Abrir menú"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <span className="text-lg font-bold tracking-tight text-primary">Clínica Magnolias</span>
                    <div className="w-9" /> {/* Spacer for centering */}
                </header>

                <main className="flex-1 overflow-y-auto bg-background">
                    <div className="mx-auto max-w-7xl h-full px-4 md:px-6 py-4 md:py-6">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    )
}
