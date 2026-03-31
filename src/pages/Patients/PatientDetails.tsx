import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Calendar, FileText, CreditCard, Plus, Ticket, CheckCircle2, X, User } from 'lucide-react'
import { cn } from '../../lib/utils'

export function PatientDetails() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [patient, setPatient] = useState<any>(null)
    const [cuponeras, setCuponeras] = useState<any[]>([])
    const [appointments, setAppointments] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [professionals, setProfessionals] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState('historia')
    const [loading, setLoading] = useState(true)

    // Modal Cuponera
    const [isCuponeraModalOpen, setIsCuponeraModalOpen] = useState(false)
    const [cuponeraForm, setCuponeraForm] = useState({
        service_id: '',
        total_sessions: 8,
        invoice_number: '',
        amount_paid: ''
    })

    // Modal Editar Paciente
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        first_name: '',
        last_name: '',
        document_id: '',
        phone: '',
        email: ''
    })

    // Modal Nueva Historia Clínica
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<any | null>(null)
    const [historyForm, setHistoryForm] = useState({
        service_type: '',
        professional_id: '',
        notes: '',
        data: {}, // Parámetros específicos JSON
        date: new Date().toISOString().split('T')[0]
    })
    const uniqueAssignedTreatmentNames = Array.from(new Set(
        cuponeras.map(c => {
            const service = Array.isArray(c.services) ? c.services[0] : c.services
            return service?.name
        }).filter(Boolean)
    ))

    async function loadData() {
        if (!id) return
        setLoading(true)

        // Fetch patient
        const { data: pData } = await supabase.from('patients').select('*').eq('id', id).single()
        if (pData) {
            setPatient(pData)
            setEditForm({
                first_name: pData.first_name || '',
                last_name: pData.last_name || '',
                document_id: pData.document_id || '',
                phone: pData.phone || '',
                email: pData.email || ''
            })
        }

        // Fetch cuponeras
        const { data: cData } = await supabase
            .from('cuponeras')
            .select(`
                *,
                services(name)
            `)
            .eq('patient_id', id)
            .order('created_at', { ascending: false })

        if (cData) setCuponeras(cData)

        // Fetch History Entries
        const { data: hData } = await supabase
            .from('clinical_history')
            .select(`
                *,
                professionals(first_name, last_name)
            `)
            .eq('patient_id', id)
            .order('created_at', { ascending: false })

        if (hData) setHistoryEntries(hData)

        // Fetch services for dropdown
        const { data: sData } = await supabase.from('services').select('id, name').eq('is_active', true)
        if (sData) setServices(sData)

        // Fetch professionals for dropdown
        const { data: profData } = await supabase.from('professionals').select('id, first_name, last_name')
        if (profData) setProfessionals(profData)

        // Fetch Appointments
        const { data: aData } = await supabase
            .from('appointments')
            .select(`
                id, start_time, end_time, status, notes, cuponera_id,
                appointment_patients!inner(patient_id),
                services(name),
                professionals(first_name, last_name)
            `)
            .eq('appointment_patients.patient_id', id)
            .order('start_time', { ascending: false })

        if (aData) setAppointments(aData)

        setLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [id])

    const handleCreateCuponera = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!cuponeraForm.service_id || !id) return

        const { error } = await supabase.from('cuponeras').insert([{
            patient_id: id,
            service_id: cuponeraForm.service_id,
            total_sessions: cuponeraForm.total_sessions,
            used_sessions: 0,
            is_active: true,
            invoice_number: cuponeraForm.invoice_number || null,
            amount_paid: cuponeraForm.amount_paid ? parseFloat(cuponeraForm.amount_paid) : null
        }])

        if (!error) {
            setIsCuponeraModalOpen(false)
            setCuponeraForm({ service_id: '', total_sessions: 8, invoice_number: '', amount_paid: '' })
            loadData() // refresh list
        } else {
            console.error('Error creating cuponera:', error)
        }
    }

    const handleUseSession = async (cuponera: any) => {
        if (cuponera.used_sessions >= cuponera.total_sessions) return

        const { error } = await supabase
            .from('cuponeras')
            .update({ used_sessions: cuponera.used_sessions + 1 })
            .eq('id', cuponera.id)

        if (!error) {
            const serviceName = Array.isArray(cuponera.services) ? cuponera.services[0]?.name : cuponera.services?.name;
            await supabase.from('history').insert({
                patient_id: id,
                service_type: 'Canje de Sesión',
                notes: `[CUPONERA:${cuponera.id}] Se consumió manualmente la sesión ${cuponera.used_sessions + 1} de la cuponera asignada de ${serviceName || 'Tratamiento'}.`,
                created_at: new Date().toISOString()
            });
            loadData() // refresh list to show updated count
        } else {
            console.error('Error updating session use:', error)
        }
    }

    const handleUpdatePatient = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!id) return

        const { error } = await supabase
            .from('patients')
            .update({
                first_name: editForm.first_name,
                last_name: editForm.last_name,
                document_id: editForm.document_id || null,
                phone: editForm.phone || null,
                email: editForm.email || null
            })
            .eq('id', id)

        if (!error) {
            setIsEditModalOpen(false)
            loadData()
        } else {
            console.error('Error updating patient:', error)
        }
    }

    const handleCreateHistory = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!id) return

        let createdAt = new Date().toISOString()
        const todayStr = new Date().toISOString().split('T')[0]
        if (historyForm.date && historyForm.date !== todayStr) {
            createdAt = new Date(`${historyForm.date}T12:00:00Z`).toISOString()
        }

        const { error } = await supabase
            .from('clinical_history')
            .insert([{
                patient_id: id,
                professional_id: historyForm.professional_id || null,
                service_type: historyForm.service_type,
                notes: historyForm.notes,
                data: historyForm.data,
                created_at: createdAt
            }])

        if (!error) {
            setIsHistoryModalOpen(false)
            setHistoryForm({ service_type: '', professional_id: '', notes: '', data: {}, date: new Date().toISOString().split('T')[0] })
            loadData()
        } else {
            console.error('Error creating history entry:', error)
        }
    }

    if (loading) {
        return <div className="p-8 text-muted-foreground animate-pulse">Cargando paciente...</div>
    }

    if (!patient) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h2 className="text-2xl font-bold text-foreground">Paciente no encontrado</h2>
                <button onClick={() => navigate('/patients')} className="mt-4 text-primary hover:underline">Volver a Pacientes</button>
            </div>
        )
    }

    const tabs = [
        { id: 'historia', name: 'Historia Clínica', icon: FileText },
        { id: 'turnos', name: 'Turnos', icon: Calendar },
        { id: 'pagos', name: 'Cuponeras y Pagos', icon: CreditCard },
    ]

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 relative">
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-border pb-6">
                <button
                    onClick={() => navigate('/patients')}
                    className="p-2 -ml-2 hover:bg-muted rounded-full text-muted-foreground transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{patient.first_name} {patient.last_name}</h1>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Cédula: {patient.document_id || 'N/A'}</span>
                        {patient.phone && <span>• Tel: {patient.phone}</span>}
                        {patient.email && <span>• Email: {patient.email}</span>}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsEditModalOpen(true)}
                        className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm cursor-pointer"
                    >
                        Editar Perfil
                    </button>
                    <button
                        onClick={() => navigate('/appointments')}
                        className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm cursor-pointer"
                    >
                        <Calendar className="w-4 h-4" /> Ir a Agenda
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 border-b border-border">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer",
                            activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/80"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.name}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="bg-card border border-border/50 rounded-lg p-6 shadow-sm min-h-[400px]">
                {activeTab === 'historia' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-2">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Evolución e Historia</h3>
                            </div>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" /> Agregar Entrada
                            </button>
                        </div>

                        {historyEntries.length === 0 && cuponeras.length === 0 && appointments.filter(a => a.notes?.trim()).length === 0 ? (
                            <div className="text-sm text-muted-foreground border border-border/50 border-dashed rounded-lg p-8 text-center bg-muted/20">
                                No hay tratamientos asignados ni entradas en la historia clínica aún.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {[
                                    ...cuponeras.filter(c => c.total_sessions - c.used_sessions > 0).map(c => ({ ...c, type: 'cuponera', sortDate: c.created_at })),
                                    ...historyEntries.map(h => ({ 
                                        ...h, 
                                        type: 'history', 
                                        sortDate: h.created_at,
                                        notes: h.notes?.replace(/\[CUPONERA:[^\]]+\]\s*/g, '')
                                    })),
                                    ...appointments.filter(a => a.notes?.trim() && !a.cuponera_id).map(a => ({ ...a, type: 'appointment', sortDate: a.start_time }))
                                ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).map(item => {
                                    if (item.type === 'cuponera') {
                                        const service = Array.isArray(item.services) ? item.services[0] : item.services
                                        const cuponeraRedemptions = [
                                            ...appointments.filter(a => a.cuponera_id === item.id).map(a => ({
                                                id: a.id,
                                                date: new Date(a.start_time),
                                                professional: Array.isArray(a.professionals) ? a.professionals[0] : a.professionals,
                                                note: a.notes,
                                                type: 'Turno'
                                            })),
                                            ...historyEntries.filter(h => h.notes && h.notes.includes(`[CUPONERA:${item.id}]`)).map(h => ({
                                                id: h.id,
                                                date: new Date(h.created_at),
                                                professional: Array.isArray(h.professionals) ? h.professionals[0] : h.professionals,
                                                note: h.notes?.replace(`[CUPONERA:${item.id}] `, ''),
                                                type: 'Canje Manual'
                                            }))
                                        ].sort((a, b) => a.date.getTime() - b.date.getTime());

                                        return (
                                            <div key={`cup-${item.id}`} className="border border-primary/20 shadow-sm rounded-lg p-5 bg-primary/5 relative overflow-hidden transition-colors">
                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-primary rounded-l-lg"></div>
                                                <div className="flex justify-between items-start mb-2 pl-1">
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1 block">Tratamiento Actual Asignado</span>
                                                        <h4 className="font-semibold text-foreground text-base leading-tight">{service?.name || "Servicio Genérico"}</h4>
                                                    </div>
                                                    <span className="text-[11px] bg-background px-2.5 py-1 rounded-full border border-border/50 font-medium text-foreground whitespace-nowrap shadow-sm">
                                                        Sesiones: {item.used_sessions} / {item.total_sessions}
                                                    </span>
                                                </div>
                                                <div className="pl-1 mt-3">
                                                    <p className="text-[13px] text-muted-foreground mb-3">
                                                        Adquirido el {new Date(item.created_at).toLocaleDateString('es-AR') + ' ' + new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    
                                                    {cuponeraRedemptions.length > 0 && (
                                                        <details className="group/details mt-3">
                                                            <summary className="cursor-pointer text-xs font-medium text-primary flex items-center gap-1 hover:text-primary/80 transition-colors w-max select-none">
                                                                Ver sesiones consumidas ({cuponeraRedemptions.length})
                                                                <svg className="w-3 h-3 transition-transform group-open/details:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </summary>
                                                            <div className="mt-3 space-y-2 pl-2 border-l-2 border-primary/20 bg-background/50 rounded-r-lg p-2">
                                                                {cuponeraRedemptions.map((r, i, arr) => {
                                                                    const sessionNumber = Math.max(1, item.used_sessions - (arr.length - 1 - i));
                                                                    return (
                                                                        <div key={r.id} className="text-xs space-y-1 pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                                                            <div className="flex justify-between items-center font-medium text-foreground">
                                                                                <span>Sesión {sessionNumber} - {r.date.toLocaleDateString('es-AR') + ' ' + r.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted/50 border border-border/50 text-muted-foreground">{r.type}</span>
                                                                                    <span className="text-muted-foreground">{r.professional ? `${r.professional.first_name} ${r.professional.last_name}` : 'Sin profesional'}</span>
                                                                                </div>
                                                                            </div>
                                                                            {r.note && (
                                                                                <p className="text-muted-foreground whitespace-pre-wrap mt-1 pb-1">{r.note}</p>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    } else if (item.type === 'history') {
                                        const prof = Array.isArray(item.professionals) ? item.professionals[0] : item.professionals
                                        return (
                                            <div
                                                key={`hist-${item.id}`}
                                                onClick={() => setSelectedHistoryEntry(item)}
                                                className="border border-border/60 shadow-sm rounded-lg p-5 bg-card relative overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
                                            >
                                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 rounded-l-lg group-hover:bg-primary transition-colors"></div>
                                                <div className="flex justify-between text-sm mb-3">
                                                    <span className="font-semibold text-foreground text-base group-hover:text-primary transition-colors">{item.service_type || 'Visita General'}</span>
                                                    <span className="text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/50">
                                                        {new Date(item.created_at).toLocaleDateString('es-AR') + ' ' + new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - {prof ? `Dr / a.${prof.first_name} ${prof.last_name}` : 'Sin profesional asignado'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-3">
                                                    {item.notes || 'Sin evolución descriptiva.'}
                                                </p>
                                                {item.notes && item.notes.length > 150 && (
                                                    <div className="text-xs text-primary mt-2 font-medium">Ver detalles completos...</div>
                                                )}
                                            </div>
                                        )
                                    } else if (item.type === 'appointment') {
                                        return (
                                            <div key={`appt-${item.id}`} className="flex gap-4 p-4 rounded-lg bg-card border border-border/50 hover:border-primary/20 transition-colors group">
                                                <div className="flex-shrink-0 mt-1">
                                                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                        <Calendar className="w-4 h-4" />
                                                    </div>
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <span className="inline-flex items-center text-[10px] font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded uppercase tracking-wider mb-2">Nota de Turno</span>
                                                            <p className="text-sm font-semibold text-foreground">{item.services?.name || 'Consulta general'}</p>
                                                        </div>
                                                        <span className="text-sm text-muted-foreground font-medium">{new Date(item.start_time).toLocaleDateString('es-AR')}</span>
                                                    </div>
                                                    {item.professionals && (
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5">
                                                            <User className="w-3.5 h-3.5" />
                                                            Atendido por: {item.professionals.first_name} {item.professionals.last_name}
                                                        </p>
                                                    )}
                                                    {item.notes && (
                                                        <div className="mt-3 p-3 bg-muted/50 rounded-md border border-border/50">
                                                            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{item.notes}</p>
                                                        </div>
                                                    )}
                                                    {item.cuponera_id && (
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
                                                            <CreditCard className="w-3.5 h-3.5" />
                                                            Consumió sesión de cuponera
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'turnos' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Turnos del Paciente</h3>
                                <p className="text-sm text-muted-foreground">Historial de turnos agendados y su estado.</p>
                            </div>
                        </div>

                        {appointments.length === 0 ? (
                            <div className="text-sm text-muted-foreground border border-border/50 border-dashed rounded-lg p-8 text-center bg-muted/20">
                                No hay turnos registrados para este paciente.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {appointments.map(appt => {
                                    const service = Array.isArray(appt.services) ? appt.services[0] : appt.services
                                    const prof = Array.isArray(appt.professionals) ? appt.professionals[0] : appt.professionals
                                    
                                    const getStatusBadge = (status: string) => {
                                        switch (status) {
                                            case 'confirmado':
                                                return <span className="bg-green-500/10 text-green-600 border border-green-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">Confirmado</span>
                                            case 'pendiente':
                                                return <span className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">Pendiente</span>
                                            case 'cancelado':
                                            case 'cancelado_tarde':
                                                return <span className="bg-red-500/10 text-red-600 border border-red-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">Cancelado</span>
                                            default:
                                                return <span className="bg-slate-500/10 text-slate-600 border border-slate-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">{status || 'Desconocido'}</span>
                                        }
                                    }

                                    return (
                                        <div key={appt.id} className="border border-border/60 bg-card rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-primary/30 transition-colors">
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h4 className="font-semibold text-foreground text-base">{service?.name || "Turno general"}</h4>
                                                    {getStatusBadge(appt.status)}
                                                </div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-2 capitalize">
                                                    <Calendar className="w-4 h-4" /> 
                                                    {new Date(appt.start_time).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                    <span className="hidden sm:inline">•</span>
                                                    <span className="block sm:inline">{new Date(appt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs</span>
                                                </div>
                                                {prof && (
                                                    <div className="text-[13px] text-muted-foreground mt-2">
                                                        Profesional: <span className="font-medium text-foreground">{prof.first_name} {prof.last_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'pagos' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Cuponeras de Tratamientos</h3>
                                <p className="text-sm text-muted-foreground">Gestiona los paquetes de sesiones compradas por el cliente.</p>
                            </div>
                            <button
                                onClick={() => setIsCuponeraModalOpen(true)}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                            >
                                <Plus className="w-4 h-4" /> Vender Cuponera
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cuponeras.length === 0 ? (
                                <div className="col-span-full border border-dashed border-border/50 p-8 text-center rounded-lg bg-muted/20">
                                    <Ticket className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
                                    <p className="text-sm text-muted-foreground">El cliente no posee cuponeras activas.</p>
                                </div>
                            ) : (
                                cuponeras.map(cup => {
                                    const service = Array.isArray(cup.services) ? cup.services[0] : cup.services
                                    const available = cup.total_sessions - cup.used_sessions
                                    const isExhausted = available <= 0

                                    const cuponeraRedemptions = [
                                        ...appointments.filter(a => a.cuponera_id === cup.id).map(a => ({
                                            id: a.id,
                                            date: new Date(a.start_time),
                                            professional: Array.isArray(a.professionals) ? a.professionals[0] : a.professionals,
                                            note: a.notes,
                                            type: 'Turno'
                                        })),
                                        ...historyEntries.filter(h => h.notes && h.notes.includes(`[CUPONERA:${cup.id}]`)).map(h => ({
                                            id: h.id,
                                            date: new Date(h.created_at),
                                            professional: Array.isArray(h.professionals) ? h.professionals[0] : h.professionals,
                                            note: h.notes?.replace(`[CUPONERA:${cup.id}] `, ''),
                                            type: 'Canje Manual'
                                        }))
                                    ].sort((a, b) => a.date.getTime() - b.date.getTime());

                                    return (
                                        <div key={cup.id} className={cn(
                                            "border rounded-xl p-5 flex flex-col justify-between transition-opacity",
                                            isExhausted ? "opacity-60 bg-muted/30 border-border/50" : "bg-card border-border shadow-sm hover:border-primary/50"
                                        )}>
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-semibold text-foreground truncate pl-1">{service?.name || "Servicio Genérico"}</h4>
                                                    {isExhausted ? (
                                                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded border border-red-500/20">Agotada</span>
                                                    ) : (
                                                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-green-500/10 text-green-500 rounded border border-green-500/20">Activa</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mb-4 pl-1">
                                                    Adquirida el {new Date(cup.created_at).toLocaleDateString('es-AR')}
                                                </p>

                                                <div className="bg-muted p-3 flex items-center justify-between rounded-lg">
                                                    <div className="text-center w-full">
                                                        <span className="block text-2xl font-bold text-foreground leading-none">{available}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Disponibles</span>
                                                    </div>
                                                    <div className="w-px h-8 bg-border"></div>
                                                    <div className="text-center w-full">
                                                        <span className="block text-2xl font-bold text-foreground leading-none">{cup.used_sessions}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Usadas</span>
                                                    </div>
                                                    <div className="w-px h-8 bg-border"></div>
                                                    <div className="text-center w-full">
                                                        <span className="block text-xl font-medium text-muted-foreground/50 leading-none">{cup.total_sessions}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Total</span>
                                                    </div>
                                                </div>

                                                {cuponeraRedemptions.length > 0 && (
                                                    <div className="mt-4 pt-4 border-t border-border/50">
                                                        <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Sesiones Consumidas ({cuponeraRedemptions.length})</p>
                                                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                                            {cuponeraRedemptions.map((r, i, arr) => {
                                                                const sessionNumber = Math.max(1, cup.used_sessions - (arr.length - 1 - i));
                                                                return (
                                                                <div key={r.id} className="bg-muted/50 p-2.5 rounded-md border border-border/50">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="text-[10px] font-medium text-foreground">Sesión {sessionNumber} - {r.date.toLocaleDateString('es-AR') + ' ' + r.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-background border border-border text-muted-foreground">{r.type}</span>
                                                                            {r.professional && (
                                                                                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{r.professional.first_name} {r.professional.last_name}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {r.note && <p className="text-xs text-foreground line-clamp-2 mt-1 whitespace-pre-wrap">{r.note}</p>}
                                                                </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleUseSession(cup)}
                                                disabled={isExhausted}
                                                className={cn(
                                                    "mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors border cursor-pointer disabled:cursor-not-allowed",
                                                    isExhausted
                                                        ? "bg-transparent text-muted-foreground border-border/50"
                                                        : "bg-background hover:bg-muted text-foreground border-border hover:border-primary/50"
                                                )}
                                            >
                                                {isExhausted ? 'Sin sesiones' : <><CheckCircle2 className="w-4 h-4 text-green-500" /> Consumir 1 Sesión</>}
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Nueva Cuponera */}
            {isCuponeraModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                        <h3 className="text-lg font-bold text-foreground mb-1">Vender Cuponera</h3>
                        <p className="text-sm text-muted-foreground mb-5">Asigna un paquete de sesiones al cliente.</p>

                        <form onSubmit={handleCreateCuponera} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Tratamiento</label>
                                <select
                                    required
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={cuponeraForm.service_id}
                                    onChange={e => setCuponeraForm({ ...cuponeraForm, service_id: e.target.value })}
                                >
                                    <option value="" disabled>Seleccionar...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Cant. Sesiones</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max="50"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={cuponeraForm.total_sessions}
                                    onChange={e => setCuponeraForm({ ...cuponeraForm, total_sessions: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="pt-2 border-t border-border mt-6"></div>

                            <div className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground flex justify-between">
                                        Monto Cobrado
                                        <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={cuponeraForm.amount_paid}
                                            onChange={(e) => setCuponeraForm({ ...cuponeraForm, amount_paid: e.target.value })}
                                            className="w-full pl-7 pr-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground flex justify-between">
                                        Número de Factura
                                        <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej. B-0001-00000012"
                                        value={cuponeraForm.invoice_number}
                                        onChange={(e) => setCuponeraForm({ ...cuponeraForm, invoice_number: e.target.value })}
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => setIsCuponeraModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer">
                                    Guardar Cuponera
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Editar Paciente */}
            {
                isEditModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                            <h3 className="text-xl font-bold text-foreground mb-1">Editar Paciente</h3>
                            <p className="text-sm text-muted-foreground mb-5">Modifica los datos de contacto y legajo del paciente.</p>

                            <form onSubmit={handleUpdatePatient} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Nombre</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={editForm.first_name}
                                            onChange={e => setEditForm({ ...editForm, first_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Apellido</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={editForm.last_name}
                                            onChange={e => setEditForm({ ...editForm, last_name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Cédula de Identidad <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                    <input
                                        type="text"
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={editForm.document_id}
                                        onChange={e => setEditForm({ ...editForm, document_id: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Teléfono de Contacto <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                    <input
                                        type="text"
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={editForm.phone}
                                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Correo Electrónico <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                    <input
                                        type="email"
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={editForm.email}
                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                    />
                                </div>

                                <div className="pt-4 flex justify-end gap-3">
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors">
                                        Guardar Cambios
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Modal de Nueva Hoja de Historia Clínica */}
            {
                isHistoryModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                            <h3 className="text-xl font-bold text-foreground mb-1">Cargar Evolución Clínica</h3>
                            <p className="text-sm text-muted-foreground mb-5">Añade una nueva entrada al registro del paciente.</p>

                            <form onSubmit={handleCreateHistory} className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Fecha de la Visita</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={historyForm.date}
                                            onChange={e => setHistoryForm({ ...historyForm, date: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-sm font-medium text-foreground">Tipo de Visita / Tratamiento</label>
                                        {uniqueAssignedTreatmentNames.length > 0 ? (
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    list="assigned-treatments"
                                                    required
                                                    placeholder="Selecciona o escribe un tratamiento..."
                                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                    value={historyForm.service_type}
                                                    onChange={e => setHistoryForm({ ...historyForm, service_type: e.target.value })}
                                                />
                                                <datalist id="assigned-treatments">
                                                    {uniqueAssignedTreatmentNames.map(name => (
                                                        <option key={name as string} value={name as string} />
                                                    ))}
                                                    <option value="Evaluación Inicial" />
                                                    <option value="Consulta General" />
                                                </datalist>
                                            </div>
                                        ) : (
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej. Evaluación Inicial, Láser, Masaje..."
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={historyForm.service_type}
                                                onChange={e => setHistoryForm({ ...historyForm, service_type: e.target.value })}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Profesional a cargo</label>
                                        <select
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={historyForm.professional_id}
                                            onChange={e => setHistoryForm({ ...historyForm, professional_id: e.target.value })}
                                        >
                                            <option value="">-- Sin profesional --</option>
                                            {professionals.map(p => (
                                                <option key={p.id} value={p.id}>Dr/a. {p.first_name} {p.last_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Notas de la Evolución</label>
                                    <textarea
                                        required
                                        rows={5}
                                        placeholder="Describe las observaciones, indicaciones, estado de la piel, y evolución del paciente en esta sesión..."
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-y"
                                        value={historyForm.notes}
                                        onChange={e => setHistoryForm({ ...historyForm, notes: e.target.value })}
                                    />
                                </div>

                                <div className="pt-4 flex justify-end gap-3">
                                    <button type="button" onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors">
                                        Guardar Archivo
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Modal de Lectura de Historia Clínica */}
            {
                selectedHistoryEntry && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6 flex flex-col max-h-[90vh]">
                            <div className="flex justify-between items-start mb-4 pb-4 border-b border-border/50">
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">
                                        {selectedHistoryEntry.service_type || 'Visita General'}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Evolución del {new Date(selectedHistoryEntry.created_at).toLocaleDateString('es-AR')} a las {new Date(selectedHistoryEntry.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedHistoryEntry(null)} className="p-2 mb-auto hover:bg-muted rounded-full text-muted-foreground transition-colors cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Profesional a Cargo</h4>
                                    <p className="text-sm text-foreground font-medium">
                                        {(() => {
                                            const p = Array.isArray(selectedHistoryEntry.professionals) ? selectedHistoryEntry.professionals[0] : selectedHistoryEntry.professionals
                                            return p ? `Dr / a.${p.first_name} ${p.last_name}` : 'Sin registro de profesional'
                                        })()}
                                    </p>
                                </div>

                                <div>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notas y Evolución</h4>
                                    <div className="bg-background border border-border/50 p-4 rounded-lg text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                                        {selectedHistoryEntry.notes || 'No se registraron notas en esta evolución.'}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-border/50 flex justify-end">
                                <button type="button" onClick={() => setSelectedHistoryEntry(null)} className="px-5 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors shadow-sm cursor-pointer">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
