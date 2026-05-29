import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { 
    BarChart3, 
    TrendingUp, 
    Calendar, 
    Clock, 
    Sparkles, 
    Award, 
    Activity, 
    Search,
    Filter,
    RefreshCw
} from 'lucide-react'
import { cn } from '../lib/utils'

interface Service {
    id: string
    name: string
    duration_minutes: number
}

interface Professional {
    id: string
    first_name: string
    last_name: string
    color: string
}

interface Appointment {
    id: string
    start_time: string
    status: string
    professional_id: string
    service_id: string
    services: Service | Service[] | null
    professionals: Professional | Professional[] | null
}

type QuickRange = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'this-year' | 'custom'

export function Metrics() {
    const [loading, setLoading] = useState(true)
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [professionals, setProfessionals] = useState<Professional[]>([])
    const [services, setServices] = useState<Service[]>([])
    
    // Filters
    const [quickRange, setQuickRange] = useState<QuickRange>('this-month')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [selectedProfId, setSelectedProfId] = useState('all')
    const [selectedServiceId, setSelectedServiceId] = useState('all')
    const [selectedStatus, setSelectedStatus] = useState<'completado' | 'all' | 'confirmados-completados'>('completado')
    
    // UI State
    const [activeTab, setActiveTab] = useState<'staff' | 'treatments'>('staff')
    const [searchQuery, setSearchQuery] = useState('')

    // Apply quick ranges
    useEffect(() => {
        const now = new Date()
        let start = new Date()
        let end = new Date()

        switch (quickRange) {
            case 'this-month':
                start = new Date(now.getFullYear(), now.getMonth(), 1)
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
                break
            case 'last-month':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
                break
            case 'last-30':
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                end = now
                break
            case 'last-90':
                start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                end = now
                break
            case 'this-year':
                start = new Date(now.getFullYear(), 0, 1)
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
                break
            case 'custom':
                // Don't override user inputs
                return
        }

        setStartDate(start.toISOString().split('T')[0])
        setEndDate(end.toISOString().split('T')[0])
    }, [quickRange])

    async function fetchData() {
        setLoading(true)
        try {
            // 1. Fetch professionals
            const { data: profsData } = await supabase
                .from('professionals')
                .select('id, first_name, last_name, color')
                .eq('is_deleted', false)
            
            // 2. Fetch services
            const { data: servsData } = await supabase
                .from('services')
                .select('id, name, duration_minutes')
                .eq('is_active', true)

            // 3. Fetch appointments in date range
            if (startDate && endDate) {
                const startIso = `${startDate}T00:00:00Z`
                const endIso = `${endDate}T23:59:59Z`

                const { data: apptsData } = await supabase
                    .from('appointments')
                    .select(`
                        id, start_time, status, professional_id, service_id,
                        services(id, name, duration_minutes),
                        professionals(id, first_name, last_name, color)
                    `)
                    .gte('start_time', startIso)
                    .lte('start_time', endIso)

                if (apptsData) {
                    setAppointments(apptsData as unknown as Appointment[])
                }
            }

            if (profsData) setProfessionals(profsData)
            if (servsData) setServices(servsData)
        } catch (error) {
            console.error('Error fetching metrics data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Trigger fetch on date change or manual action
    useEffect(() => {
        if (startDate && endDate) {
            void fetchData()
        }
    }, [startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

    // Helper functions to unpack relations
    const getService = (app: Appointment): Service | null => {
        if (!app.services) return null
        return Array.isArray(app.services) ? app.services[0] : app.services
    }

    const getProfessional = (app: Appointment): Professional | null => {
        if (!app.professionals) return null
        return Array.isArray(app.professionals) ? app.professionals[0] : app.professionals
    }

    // Computed Data
    const filteredAppts = appointments.filter(app => {
        const service = getService(app)
        const professional = getProfessional(app)

        // Status Filter
        if (selectedStatus === 'completado' && app.status !== 'completado') return false
        if (selectedStatus === 'confirmados-completados' && !['completado', 'confirmado'].includes(app.status)) return false
        if (app.status === 'cancelado' || app.status === 'cancelado_tarde') return false // Skip cancelled altogether for performance metrics

        // Professional Filter
        if (selectedProfId !== 'all' && app.professional_id !== selectedProfId) return false

        // Service Filter
        if (selectedServiceId !== 'all' && app.service_id !== selectedServiceId) return false

        // Relation sanity checks
        if (!service || !professional) return false

        return true
    })

    // KPI 1: Total Sessions
    const totalSessions = filteredAppts.length

    // KPI 2: Total Hours Worked
    const totalMinutes = filteredAppts.reduce((sum, app) => {
        const s = getService(app)
        return sum + (s?.duration_minutes || 0)
    }, 0)
    const totalHours = (totalMinutes / 60).toFixed(1)

    // KPI 3: Daily Average
    const getDaysDiff = () => {
        if (!startDate || !endDate) return 1
        const s = new Date(startDate)
        const e = new Date(endDate)
        const diffTime = Math.abs(e.getTime() - s.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
        return diffDays || 1
    }
    const daysCount = getDaysDiff()
    const dailyAverage = (totalSessions / daysCount).toFixed(1)

    // KPI 4 & 5: Tops
    // Calculate occurrences
    const serviceCounts: Record<string, { name: string; count: number }> = {}
    const professionalCounts: Record<string, { name: string; count: number; color: string }> = {}

    filteredAppts.forEach(app => {
        const s = getService(app)
        const p = getProfessional(app)
        
        if (s) {
            serviceCounts[s.id] = {
                name: s.name,
                count: (serviceCounts[s.id]?.count || 0) + 1
            }
        }
        if (p) {
            const fullName = `${p.first_name} ${p.last_name}`
            professionalCounts[p.id] = {
                name: fullName,
                count: (professionalCounts[p.id]?.count || 0) + 1,
                color: p.color
            }
        }
    })

    const topService = Object.values(serviceCounts).sort((a, b) => b.count - a.count)[0]?.name || '—'
    const topProfessional = Object.values(professionalCounts).sort((a, b) => b.count - a.count)[0]?.name || '—'

    // Compute Staff Performance list
    const staffData = professionals.map(prof => {
        const profAppts = filteredAppts.filter(app => app.professional_id === prof.id)
        const sessions = profAppts.length
        const minutes = profAppts.reduce((sum, app) => sum + (getService(app)?.duration_minutes || 0), 0)
        const hours = (minutes / 60).toFixed(1)

        // Services breakdown for this professional
        const sBreakdown: Record<string, { id: string; name: string; count: number }> = {}
        profAppts.forEach(app => {
            const s = getService(app)
            if (s) {
                sBreakdown[s.id] = {
                    id: s.id,
                    name: s.name,
                    count: (sBreakdown[s.id]?.count || 0) + 1
                }
            }
        })

        const sortedServices = Object.values(sBreakdown).sort((a, b) => b.count - a.count)

        return {
            id: prof.id,
            first_name: prof.first_name,
            last_name: prof.last_name,
            fullName: `${prof.first_name} ${prof.last_name}`,
            color: prof.color,
            sessions,
            hours,
            services: sortedServices
        }
    }).sort((a, b) => b.sessions - a.sessions)

    // Filter staff by search and dropdown
    const filteredStaff = staffData.filter(s => {
        if (selectedProfId !== 'all' && s.id !== selectedProfId) return false
        
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        const term = normalize(searchQuery)
        if (term) {
            const matchesName = normalize(s.fullName).includes(term)
            const matchesService = s.services.some(srv => normalize(srv.name).includes(term))
            return matchesName || matchesService
        }
        return true
    })

    // Compute Treatments list
    const treatmentsData = services.map(srv => {
        const srvAppts = filteredAppts.filter(app => app.service_id === srv.id)
        const total = srvAppts.length

        // Professional breakdown for this service
        const pBreakdown: Record<string, { id: string; name: string; count: number; color: string }> = {}
        srvAppts.forEach(app => {
            const p = getProfessional(app)
            if (p) {
                pBreakdown[p.id] = {
                    id: p.id,
                    name: `${p.first_name} ${p.last_name}`,
                    count: (pBreakdown[p.id]?.count || 0) + 1,
                    color: p.color
                }
            }
        })

        const sortedProfs = Object.values(pBreakdown).sort((a, b) => b.count - a.count)

        return {
            id: srv.id,
            name: srv.name,
            duration: srv.duration_minutes,
            total,
            professionals: sortedProfs
        }
    }).sort((a, b) => b.total - a.total)

    // Filter treatments by search and dropdown
    const maxTreatmentVolume = Math.max(...treatmentsData.map(t => t.total), 1)

    const filteredTreatments = treatmentsData.filter(t => {
        if (selectedServiceId !== 'all' && t.id !== selectedServiceId) return false
        
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        const term = normalize(searchQuery)
        if (term) {
            const matchesName = normalize(t.name).includes(term)
            const matchesProf = t.professionals.some(p => normalize(p.name).includes(term))
            return matchesName || matchesProf
        }
        return true
    })

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        <BarChart3 className="w-8 h-8 text-primary" />
                        Métricas de Rendimiento
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Evaluación del staff y análisis de sesiones completadas por tratamiento.
                    </p>
                </div>
                <button
                    onClick={() => void fetchData()}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium bg-secondary text-secondary-foreground border border-border/80 rounded-lg hover:bg-secondary/80 transition-all cursor-pointer shrink-0"
                    title="Actualizar datos"
                >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    Sincronizar
                </button>
            </div>

            {/* Filter Section */}
            <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                    <Filter className="w-4 h-4 text-primary" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtros de Análisis</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Date Shortcuts & Selectors */}
                    <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-semibold text-muted-foreground">Período de análisis</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select
                                className="bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer sm:w-40"
                                value={quickRange}
                                onChange={e => setQuickRange(e.target.value as QuickRange)}
                            >
                                <option value="this-month">Este Mes</option>
                                <option value="last-month">Mes Anterior</option>
                                <option value="last-30">Últimos 30 días</option>
                                <option value="last-90">Últimos 90 días</option>
                                <option value="this-year">Año Actual</option>
                                <option value="custom">Personalizado</option>
                            </select>
                            
                            <div className="flex items-center gap-2 flex-1">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => {
                                        setStartDate(e.target.value)
                                        setQuickRange('custom')
                                    }}
                                    className="bg-background border border-input rounded-md px-2.5 py-1 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none flex-1"
                                />
                                <span className="text-xs text-muted-foreground">al</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => {
                                        setEndDate(e.target.value)
                                        setQuickRange('custom')
                                    }}
                                    className="bg-background border border-input rounded-md px-2.5 py-1 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none flex-1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Status selection */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Estado de Turno</label>
                        <select
                            className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            value={selectedStatus}
                            onChange={e => setSelectedStatus(e.target.value as any)}
                        >
                            <option value="completado">Solo Completados (Rendimiento)</option>
                            <option value="confirmados-completados">Completados + Confirmados</option>
                            <option value="all">Todos (Planificado)</option>
                        </select>
                    </div>

                    {/* Staff/Service dynamic drop filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Filtro Rápido</label>
                        {activeTab === 'staff' ? (
                            <select
                                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                                value={selectedProfId}
                                onChange={e => setSelectedProfId(e.target.value)}
                            >
                                <option value="all">Todas las Profesionales</option>
                                {professionals.map(p => (
                                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                ))}
                            </select>
                        ) : (
                            <select
                                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                                value={selectedServiceId}
                                onChange={e => setSelectedServiceId(e.target.value)}
                            >
                                <option value="all">Todos los Tratamientos</option>
                                {services.map(s => (
                                    <option key={s.id} value={s.id}>{srvLabel(s.name)}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </div>

            {/* KPI Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* KPI 1 */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Turnos Completados</span>
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                            <Activity className="w-4 h-4 text-primary" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">{totalSessions}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">En {daysCount} día{daysCount > 1 && 's'}</p>
                    </div>
                </div>

                {/* KPI 2 */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Horas en Cabina</span>
                        <div className="p-2 bg-violet-500/10 rounded-lg group-hover:bg-violet-500/20 transition-colors">
                            <Clock className="w-4 h-4 text-violet-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">{totalHours} hs</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Suma de duraciones</p>
                    </div>
                </div>

                {/* KPI 3 */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Sesiones por Día</span>
                        <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
                            <Calendar className="w-4 h-4 text-amber-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">{dailyAverage}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Promedio diario</p>
                    </div>
                </div>

                {/* KPI 4 */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Tratamiento Estrella</span>
                        <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                            <Sparkles className="w-4 h-4 text-green-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-sm font-bold tracking-tight text-foreground truncate" title={topService}>
                            {topService}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Mayor volumen</p>
                    </div>
                </div>

                {/* KPI 5 */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Especialista Activa</span>
                        <div className="p-2 bg-pink-500/10 rounded-lg group-hover:bg-pink-500/20 transition-colors">
                            <Award className="w-4 h-4 text-pink-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-sm font-bold tracking-tight text-foreground truncate" title={topProfessional}>
                            {topProfessional}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Mayor cantidad de sesiones</p>
                    </div>
                </div>
            </div>

            {/* Main Tabs and Search bar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mt-2 pb-2 border-b border-border/40">
                <div className="flex bg-muted/30 p-1 rounded-xl border border-border/40">
                    <button
                        onClick={() => {
                            setActiveTab('staff')
                            setSearchQuery('')
                        }}
                        className={cn(
                            "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2",
                            activeTab === 'staff' 
                                ? "bg-card text-foreground shadow-sm font-bold" 
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Rendimiento del Staff
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('treatments')
                            setSearchQuery('')
                        }}
                        className={cn(
                            "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2",
                            activeTab === 'treatments' 
                                ? "bg-card text-foreground shadow-sm font-bold" 
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Tratamientos Realizados
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={activeTab === 'staff' ? "Buscar por profesional o tratamiento..." : "Buscar tratamiento..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
            </div>

            {/* List / Content Cards */}
            {loading ? (
                <div className="p-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Cargando métricas...
                </div>
            ) : totalSessions === 0 ? (
                <div className="p-16 border border-dashed border-border/50 rounded-xl text-center text-muted-foreground bg-muted/10">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
                    <p className="text-sm font-semibold">No se encontraron sesiones para este período.</p>
                    <p className="text-xs mt-1">Asegurate de seleccionar un rango con turnos marcados como "Completado".</p>
                </div>
            ) : activeTab === 'staff' ? (
                // TAB 1: RENDIMIENTO DEL STAFF
                filteredStaff.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        No se encontraron resultados para "{searchQuery}".
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {filteredStaff.map(prof => {
                            const init = `${prof.first_name.charAt(0)}${prof.last_name.charAt(0)}`.toUpperCase()
                            const maxSessions = Math.max(...prof.services.map(s => s.count), 1)

                            return (
                                <div key={prof.id} className="bg-card border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-all hover:shadow-sm">
                                    {/* Staff Header Card */}
                                    <div className="flex items-center gap-3.5 pb-4 border-b border-border/30">
                                        <div 
                                            className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm"
                                            style={{ backgroundColor: prof.color }}
                                        >
                                            {init}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-foreground truncate">{prof.fullName}</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">Especialista en Cabina</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-lg font-black text-foreground block leading-none">{prof.sessions}</span>
                                            <span className="text-[10px] font-medium text-muted-foreground mt-1 block uppercase tracking-wider">{prof.hours} hs cabina</span>
                                        </div>
                                    </div>

                                    {/* Treatments performed breakdown */}
                                    <div className="mt-4 space-y-3">
                                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tratamientos Realizados</h4>
                                        
                                        {prof.services.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic py-2">Sin sesiones realizadas en este período.</p>
                                        ) : (
                                            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                                {prof.services.map(srv => {
                                                    const percentage = ((srv.count / prof.sessions) * 100).toFixed(0)
                                                    return (
                                                        <div key={srv.id} className="space-y-1">
                                                            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                                                                <span className="truncate max-w-[70%]">{srvLabel(srv.name)}</span>
                                                                <span className="text-muted-foreground text-[11px]">
                                                                    {srv.count} {srv.count === 1 ? 'sesión' : 'sesiones'} ({percentage}%)
                                                                </span>
                                                            </div>
                                                            {/* Custom progress bar */}
                                                            <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden border border-border/20">
                                                                <div 
                                                                    className="h-full rounded-full transition-all duration-500"
                                                                    style={{ 
                                                                        width: `${(srv.count / maxSessions) * 100}%`,
                                                                        backgroundColor: prof.color
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            ) : (
                // TAB 2: ESTADISTICAS POR TRATAMIENTO
                filteredTreatments.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        No se encontraron tratamientos para "{searchQuery}".
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTreatments.map(t => {
                            return (
                                <div key={t.id} className="bg-card border border-border/50 rounded-xl p-4.5 flex flex-col justify-between hover:border-primary/30 transition-all hover:shadow-sm group">
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-foreground leading-tight group-hover:text-primary transition-colors" title={t.name}>
                                                    {srvLabel(t.name)}
                                                </h3>
                                                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {t.duration} minutos por sesión
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-base font-extrabold text-foreground block">{t.total}</span>
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mt-0.5">Sesiones</span>
                                            </div>
                                        </div>

                                        {/* Relative volume progress bar */}
                                        <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
                                                style={{ width: `${(t.total / maxTreatmentVolume) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Staff Breakdown */}
                                    <div className="mt-4 pt-3 border-t border-border/30">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Realizado por:</span>
                                        {t.professionals.length === 0 ? (
                                            <p className="text-[10px] text-muted-foreground italic">Sin asignaciones registradas.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {t.professionals.map(p => {
                                                    return (
                                                        <span 
                                                            key={p.id} 
                                                            className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-secondary/80 border border-border/80 px-2 py-0.5 rounded-full text-foreground hover:bg-secondary transition-all"
                                                            title={`${p.name}: ${p.count} sesiones`}
                                                        >
                                                            <span 
                                                                className="w-1.5 h-1.5 rounded-full" 
                                                                style={{ backgroundColor: p.color }}
                                                            />
                                                            {p.name.split(' ')[0]} ({p.count})
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            )}
        </div>
    )
}

// Utility to limit service names for visual cleanliness
function srvLabel(name: string): string {
    if (name.length <= 42) return name
    return `${name.substring(0, 40)}...`
}
