import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import type { View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, UserPlus, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../lib/logger'

const roundToNearest30 = (date: Date): Date => {
    const ms = 1000 * 60 * 30
    return new Date(Math.ceil(date.getTime() / ms) * ms)
}

const locales = { 'es': es }

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    getDay,
    locales,
})

const messages = {
    allDay: 'Todo el día',
    previous: '← Anterior',
    next: 'Siguiente →',
    today: 'Hoy',
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
    date: 'Fecha',
    time: 'Hora',
    event: 'Turno',
    noEventsInRange: 'No hay turnos en este rango.',
    showMore: (total: number) => `+${total} más`,
}

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
    confirmado: '#16a34a',
    pendiente: '#d97706',
    cancelado: '#ef4444',
    cancelado_tarde: '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
    confirmado: 'Confirmado',
    pendiente: 'Pendiente',
    cancelado: 'Cancelado',
    cancelado_tarde: 'Cancelado c/penalidad',
}

// ─── Appointment Tooltip Portal ────────────────────────────────────────────────
interface TooltipData {
    names: string
    service: string
    professional: string
    status: string
    time: string
    x: number
    y: number
}

function AppointmentTooltip({ data }: { data: TooltipData }) {
    const statusColor = STATUS_COLOR[data.status] ?? '#94a3b8'
    const statusLabel = STATUS_LABEL[data.status] ?? data.status

    // Smart positioning: keep inside viewport
    const OFFSET = 14
    const W = 240
    const left = Math.min(data.x + OFFSET, window.innerWidth - W - 12)
    const top = data.y - OFFSET

    return createPortal(
        <div
            className="appt-tooltip"
            style={{ left, top, width: W }}
        >
            <div className="appt-tooltip-header">
                <span className="appt-tooltip-names">{data.names}</span>
                <span
                    className="appt-tooltip-badge"
                    style={{ backgroundColor: `${statusColor}22`, color: statusColor, borderColor: `${statusColor}55` }}
                >
                    <span
                        className="appt-tooltip-dot"
                        style={{ backgroundColor: statusColor }}
                    />
                    {statusLabel}
                </span>
            </div>

            <div className="appt-tooltip-rows">
                {data.time && (
                    <div className="appt-tooltip-row">
                        <span className="appt-tooltip-icon">🕐</span>
                        <span>{data.time}</span>
                    </div>
                )}
                <div className="appt-tooltip-row">
                    <span className="appt-tooltip-icon">💆</span>
                    <span>{data.service}</span>
                </div>
                <div className="appt-tooltip-row">
                    <span className="appt-tooltip-icon">👤</span>
                    <span>{data.professional}</span>
                </div>
            </div>
        </div>,
        document.body
    )
}

// ─── Custom Event ──────────────────────────────────────────────────────────────
function AppointmentEvent({ event }: { event: any }) {
    const { patientList, service, professional } = event.raw
    const names = patientList?.length
        ? patientList.map((p: any) => `${p.last_name} ${p.first_name}`).join(' & ')
        : '—'

    const [tooltip, setTooltip] = useState<TooltipData | null>(null)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const getStatusColor = (status: string) => STATUS_COLOR[status] ?? '#94a3b8'

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setTooltip({
            names,
            service: service?.name || '—',
            professional: professional
                ? `${professional.first_name} ${professional.last_name}`
                : '—',
            status: event.status,
            time: format(event.start, 'HH:mm') + ' – ' + format(event.end, 'HH:mm'),
            x: e.clientX,
            y: e.clientY,
        })
    }, [names, service, professional, event.status, event.start, event.end])

    const handleMouseLeave = useCallback(() => {
        hideTimer.current = setTimeout(() => setTooltip(null), 80)
    }, [])

    useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])

    return (
        <div
            className="flex flex-col h-full overflow-hidden leading-snug px-0.5 pt-0.5 gap-0.5 relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {tooltip && <AppointmentTooltip data={tooltip} />}
            <span className="font-semibold text-[11px] truncate">{names}</span>
            <span className="text-[10px] truncate opacity-90">{service?.name || '—'}</span>
            <span className="text-[10px] truncate opacity-75">
                {professional?.first_name} {professional?.last_name}
            </span>
            <div
                className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-[1.5px] border-white shadow-sm"
                style={{ backgroundColor: getStatusColor(event.status) }}
            />
        </div>
    )
}

// ─── NoTitle Wrapper — suppresses rbc's native title tooltip ──────────────────
// react-big-calendar injects a `title` attr on the .rbc-event div automatically.
// We use a MutationObserver inside the calendar container to strip it on-the-fly.
function useStripEventTitles(containerRef: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const root = containerRef.current
        if (!root) return

        const strip = () => {
            root.querySelectorAll<HTMLElement>('.rbc-event[title]').forEach(el => {
                el.removeAttribute('title')
            })
        }

        strip()
        const observer = new MutationObserver(strip)
        observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['title'], childList: true })
        return () => observer.disconnect()
    }, [containerRef])
}

// ─── Patient Search Input ──────────────────────────────────────────────────────
function PatientSearchInput({
    patients,
    value,
    onChange,
    required = false,
}: {
    patients: any[]
    value: string
    onChange: (id: string) => void
    required?: boolean
}) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const selected = patients.find(p => p.id === value)

    const filtered = query.trim()
        ? patients.filter(p => {
            const haystack = `${p.first_name} ${p.last_name} ${p.document_id ?? ''}`.toLowerCase()
            return haystack.includes(query.toLowerCase())
        })
        : patients

    // Cerrar al hacer clic fuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleSelect = (p: any) => {
        onChange(p.id)
        setQuery('')
        setOpen(false)
    }

    const handleClear = () => {
        onChange('')
        setQuery('')
    }

    return (
        <div ref={ref} className="relative">
            {selected ? (
                // Paciente seleccionado — mostrar chip con X
                <div className="flex items-center justify-between bg-background border border-input rounded-md px-3 py-2 text-sm">
                    <span className="text-foreground">
                        <span className="font-medium">{selected.last_name}, {selected.first_name}</span>
                        {selected.document_id && (
                            <span className="text-muted-foreground ml-2">— Cédula {selected.document_id}</span>
                        )}
                    </span>
                    <button type="button" onClick={handleClear} className="ml-2 text-muted-foreground hover:text-foreground cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                // Input de búsqueda
                <input
                    type="text"
                    required={required}
                    placeholder="Buscar por nombre o cédula..."
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                />
            )}

            {/* Dropdown de resultados */}
            {open && !selected && (
                <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                    ) : (
                        filtered.slice(0, 30).map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelect(p)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                            >
                                <span className="font-medium text-foreground">{p.last_name}, {p.first_name}</span>
                                {p.document_id && (
                                    <span className="text-muted-foreground ml-2">— Cédula {p.document_id}</span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function Appointments() {
    const calendarRef = useRef<HTMLDivElement>(null)
    useStripEventTitles(calendarRef)

    const { user } = useAuth()
    const currentUserName = user?.user_metadata?.nombre
        ? (user.user_metadata.nombre as string).split(' ')[0]
        : (user?.email ?? 'Sistema')

    const [view, setView] = useState<View>(Views.DAY)
    const [date, setDate] = useState<Date>(new Date())

    const [events, setEvents] = useState<any[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [professionals, setProfessionals] = useState<any[]>([])
    const [rooms, setRooms] = useState<any[]>([])

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<any>(null)

    // patient_ids: lista de IDs (mínimo 1 entrada vacía al abrir el form)
    const [formData, setFormData] = useState({
        patient_ids: [''],
        service_id: '',
        professional_id: '',
        room_id: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(roundToNearest30(new Date()), 'HH:mm'),
        status: 'pendiente',
        notes: '',
    })

    const [activeCuponera, setActiveCuponera] = useState<any>(null)

    useEffect(() => {
        const fetchCuponera = async () => {
            if (!isModalOpen) return

            const pid = formData.patient_ids[0]
            const sid = formData.service_id

            if (!pid || !sid) {
                setActiveCuponera(null)
                return
            }

            // Si estamos editando y YA tiene una cuponera vinculada
            if (selectedEvent?.raw?.cuponera) {
                setActiveCuponera({ ...selectedEvent.raw.cuponera, is_linked: true })
                return
            }

            // Si es un turno nuevo o uno sin cuponera vinculada, buscar si hay una activa
            const { data } = await supabase
                .from('cuponeras')
                .select('id, total_sessions, used_sessions')
                .eq('patient_id', pid)
                .eq('service_id', sid)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)

            setActiveCuponera(data?.[0] ? { ...data[0], is_linked: false } : null)
        }

        fetchCuponera()
    }, [formData.patient_ids[0], formData.service_id, isModalOpen, selectedEvent])


    useEffect(() => { fetchData() }, [])

    async function fetchData() {
        const { data: appts } = await supabase
            .from('appointments')
            .select(`
                id, start_time, end_time, status, room_id, cuponera_id, notes,
                appointment_patients(patients(id, first_name, last_name)),
                services(id, name, duration_minutes),
                professionals(id, first_name, last_name, color),
                rooms(id, name),
                cuponeras(id, total_sessions, used_sessions)
            `)

        if (appts) {
            const formatted = appts.map(app => {
                // Lista de pacientes desde la tabla de unión
                const apRows: any[] = Array.isArray(app.appointment_patients) ? app.appointment_patients : []
                const patientList = apRows.map((r: any) => {
                    const p = Array.isArray(r.patients) ? r.patients[0] : r.patients
                    return p
                }).filter(Boolean)

                const service = Array.isArray(app.services) ? app.services[0] : app.services
                const professional = Array.isArray(app.professionals) ? app.professionals[0] : app.professionals
                const room = Array.isArray(app.rooms) ? app.rooms[0] : app.rooms

                const cuponera = Array.isArray(app.cuponeras) ? app.cuponeras[0] : app.cuponeras

                // Título: todos los nombres unidos con &
                const title = patientList.length
                    ? patientList.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ')
                    : 'Sin paciente'

                return {
                    id: app.id,
                    title,
                    start: new Date(app.start_time),
                    end: new Date(app.end_time),
                    status: app.status,
                    resourceId: app.room_id,
                    raw: { app, patientList, patient: patientList[0] ?? null, service, professional, room, cuponera },
                }
            })
            setEvents(formatted)
        }

        const { data: pData } = await supabase.from('patients').select('id, first_name, last_name, document_id').order('last_name')
        const { data: sData } = await supabase.from('services').select('id, name, duration_minutes')
        const { data: profData } = await supabase.from('professionals').select('id, first_name, last_name').eq('is_active', true)
        const { data: rData } = await supabase.from('rooms').select('id, name').eq('is_active', true).order('name')

        if (pData) setPatients(pData)
        if (sData) setServices(sData)
        if (profData) setProfessionals(profData)
        if (rData) setRooms(rData)
    }

    const openNewModal = (start?: Date, resourceId?: string) => {
        setSelectedEvent(null)
        const targetDate = start ?? roundToNearest30(new Date())
        setFormData({
            patient_ids: [''],
            service_id: '',
            professional_id: '',
            room_id: resourceId ?? '',
            date: format(targetDate, 'yyyy-MM-dd'),
            time: format(targetDate, 'HH:mm'),
            status: 'pendiente',
            notes: '',
        })
        setIsModalOpen(true)
    }

    const handleSelectSlot = (slotInfo: { start: Date; resourceId?: string | number }) => {
        openNewModal(slotInfo.start, slotInfo.resourceId as string | undefined)
    }

    const handleSelectEvent = (event: any) => {
        setSelectedEvent(event)
        const existingIds = event.raw.patientList?.map((p: any) => p.id) ?? ['']
        const profId = event.raw.professional?.id ?? event.raw.app?.professional_id ?? ''
        const roomId = event.raw.room?.id ?? event.raw.app?.room_id ?? ''
        setFormData(f => ({ 
            ...f, 
            status: event.status, 
            professional_id: profId, 
            room_id: roomId,
            patient_ids: existingIds.length ? existingIds : [''],
            notes: event.raw.app?.notes || ''
        }))
        setIsModalOpen(true)
    }

    // ── Helpers para el selector de pacientes ──
    const addPatientSlot = () => {
        setFormData(f => ({ ...f, patient_ids: [...f.patient_ids, ''] }))
    }

    const removePatientSlot = (idx: number) => {
        setFormData(f => ({
            ...f,
            patient_ids: f.patient_ids.length > 1
                ? f.patient_ids.filter((_, i) => i !== idx)
                : ['']
        }))
    }

    const updatePatientSlot = (idx: number, value: string) => {
        setFormData(f => {
            const ids = [...f.patient_ids]
            ids[idx] = value
            return { ...f, patient_ids: ids }
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // ── Edit existing ──
        if (selectedEvent) {
            const prevStatus = selectedEvent.status
            const newStatus = formData.status
            const updatePayload: Record<string, any> = { 
                status: newStatus,
                notes: formData.notes 
            }
            if (formData.professional_id) updatePayload.professional_id = formData.professional_id
            if (formData.room_id) updatePayload.room_id = formData.room_id
            const { error } = await supabase
                .from('appointments')
                .update(updatePayload)
                .eq('id', selectedEvent.id)
            if (!error) {
                // Update patients in junction table
                const validIds = formData.patient_ids.filter(Boolean)
                if (validIds.length > 0) {
                    await supabase.from('appointment_patients').delete().eq('appointment_id', selectedEvent.id)
                    await supabase.from('appointment_patients').insert(
                        validIds.map(pid => ({ appointment_id: selectedEvent.id, patient_id: pid }))
                    )
                }

                // Cuponera Update Logic
                const wasConsumed = ['confirmado', 'cancelado_tarde'].includes(prevStatus)
                const isNowConsumed = ['confirmado', 'cancelado_tarde'].includes(newStatus)

                if (prevStatus !== newStatus && selectedEvent.raw.cuponera && wasConsumed !== isNowConsumed) {
                    const cuponera = selectedEvent.raw.cuponera
                    const sessionDelta = isNowConsumed ? 1 : -1
                    const newUsed = cuponera.used_sessions + sessionDelta
                    const isNowActive = newUsed < cuponera.total_sessions

                    await supabase.from('cuponeras').update({
                        used_sessions: newUsed,
                        is_active: isNowActive
                    }).eq('id', cuponera.id)
                }

                // Log only if status actually changed
                if (prevStatus !== newStatus) {
                    const { raw } = selectedEvent
                    const statusLabels: Record<string, string> = {
                        confirmado: 'confirmó',
                        cancelado: 'canceló',
                        cancelado_tarde: 'canceló con penalidad',
                        completado: 'completó',
                        pendiente: 'puso en pendiente',
                    }
                    const patientNames = raw.patientList?.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ') ?? '—'
                    const appointmentTime = format(selectedEvent.start, "EEEE dd 'de' MMM HH:mm", { locale: es })
                    await writeLog({
                        action: `turno_${newStatus}`,
                        userName: currentUserName,
                        entityType: 'appointment',
                        entityId: selectedEvent.id,
                        details: {
                            label: `${currentUserName} ${statusLabels[newStatus] ?? newStatus} el turno de ${patientNames}`,
                            patient: patientNames,
                            service: raw.service?.name,
                            professional: `${raw.professional?.first_name} ${raw.professional?.last_name}`,
                            appointment_time: appointmentTime,
                            prev_status: prevStatus,
                            new_status: newStatus,
                        },
                    })
                }
                setIsModalOpen(false)
                fetchData()
            } else {
                console.error('Error updating appointment:', error)
                alert(`Error al actualizar el turno: ${error.message}`)
            }
            return
        }

        // ── Create new ──
        const validPatientIds = formData.patient_ids.filter(Boolean)
        if (!validPatientIds.length || !formData.service_id || !formData.professional_id || !formData.room_id) return

        const selectedService = services.find(s => s.id === formData.service_id)
        const duration = selectedService?.duration_minutes || 30

        const startDateTime = new Date(`${formData.date}T${formData.time}:00`)
        const endDateTime = new Date(startDateTime.getTime() + duration * 60000)

        // Anti-double-booking
        const { data: overlapping, error: overlapError } = await supabase
            .from('appointments')
            .select('id')
            .or(`professional_id.eq.${formData.professional_id},room_id.eq.${formData.room_id}`)
            .neq('status', 'cancelado')
            .neq('status', 'cancelado_tarde')
            .lt('start_time', endDateTime.toISOString())
            .gt('end_time', startDateTime.toISOString())

        if (overlapError) {
            console.warn('Overlap check failed (posiblemente RLS):', overlapError)
        } else if (overlapping && overlapping.length > 0) {
            alert('El profesional o el consultorio ya tienen un turno asignado en ese horario.')
            return
        }

        const { data: newAppt, error } = await supabase.from('appointments').insert([{
            patient_id: validPatientIds[0], // primer paciente como referencia legacy
            service_id: formData.service_id,
            professional_id: formData.professional_id,
            room_id: formData.room_id,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            status: formData.status,
            notes: formData.notes,
            cuponera_id: activeCuponera?.id || null,
        }]).select('id').single()

        if (!error && newAppt) {
            // Insertar todos los pacientes en la tabla de unión
            await supabase.from('appointment_patients').insert(
                validPatientIds.map(pid => ({ appointment_id: newAppt.id, patient_id: pid }))
            )

            // Obtener nombres para el log
            const { data: pData } = await supabase.from('patients').select('first_name, last_name').in('id', validPatientIds)
            const patientNames = pData?.map(p => `${p.first_name} ${p.last_name}`).join(' & ') ?? '—'
            const prof = professionals.find(p => p.id === formData.professional_id)

            await writeLog({
                action: 'turno_creado',
                userName: currentUserName,
                entityType: 'appointment',
                entityId: newAppt.id,
                details: {
                    label: `${currentUserName} agendó un turno a ${patientNames}`,
                    patient: patientNames,
                    service: selectedService?.name,
                    professional: `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim(),
                    appointment_time: format(startDateTime, "EEEE dd 'de' MMM HH:mm", { locale: es }),
                    status: formData.status,
                },
            })

            // Segundo log si el estado inicial no es independiente (Doble registro)
            if (formData.status !== 'pendiente') {
                const statusLabels: Record<string, string> = {
                    confirmado: 'confirmó',
                    cancelado: 'canceló',
                    cancelado_tarde: 'canceló con penalidad',
                }
                await writeLog({
                    action: `turno_${formData.status}`,
                    userName: currentUserName,
                    entityType: 'appointment',
                    entityId: newAppt.id,
                    details: {
                        label: `${currentUserName} ${statusLabels[formData.status] ?? formData.status} el turno de ${patientNames}`,
                        patient: patientNames,
                        service: selectedService?.name,
                        professional: `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim(),
                        appointment_time: format(startDateTime, "EEEE dd 'de' MMM HH:mm", { locale: es }),
                    },
                })
            }


            // Increment cuponera sessions if created as consumed
            if (activeCuponera && ['confirmado', 'cancelado_tarde'].includes(formData.status)) {
                const newUsed = activeCuponera.used_sessions + 1
                const isNowActive = newUsed < activeCuponera.total_sessions

                await supabase.from('cuponeras').update({
                    used_sessions: newUsed,
                    is_active: isNowActive
                }).eq('id', activeCuponera.id)
            }

            setIsModalOpen(false)
            fetchData()
        } else {
            console.error('Error saving appointment:', error)
        }
    }

    // ── Delete appointment ──
    const handleDeleteAppointment = async () => {
        if (!selectedEvent) return
        if (!window.confirm('¿Eliminar este turno? Esta acción no se puede deshacer.')) return

        const { raw } = selectedEvent
        const patientNames = raw.patientList?.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ') ?? '—'
        const appointmentTime = format(selectedEvent.start, "EEEE dd 'de' MMM HH:mm", { locale: es })

        // Borrar pacientes de la tabla de unión primero
        await supabase.from('appointment_patients').delete().eq('appointment_id', selectedEvent.id)
        const { error } = await supabase.from('appointments').delete().eq('id', selectedEvent.id)

        if (!error) {
            // Restore cuponera session if deleted while consumed
            if (raw.cuponera && ['confirmado', 'cancelado_tarde'].includes(selectedEvent.status)) {
                const newUsed = raw.cuponera.used_sessions - 1
                await supabase.from('cuponeras').update({
                    used_sessions: newUsed,
                    is_active: true
                }).eq('id', raw.cuponera.id)
            }

            await writeLog({
                action: 'turno_eliminado',
                userName: currentUserName,
                entityType: 'appointment',
                entityId: selectedEvent.id,
                details: {
                    label: `${currentUserName} canceló el turno de ${patientNames}`,
                    patient: patientNames,
                    service: raw.service?.name,
                    professional: `${raw.professional?.first_name ?? ''} ${raw.professional?.last_name ?? ''}`.trim(),
                    appointment_time: appointmentTime,
                },
            })
            setIsModalOpen(false)
            fetchData()
        } else {
            console.error('Error eliminando turno:', error)
            alert(`Error al eliminar el turno: ${error.message}`)
        }
    }

    // ── Resource props only for Day view ──
    const isResourceView = view === Views.DAY
    const resourceProps = isResourceView
        ? {
            resources: rooms.map(r => ({ id: r.id, title: r.name })),
            resourceIdAccessor: 'id' as any,
            resourceTitleAccessor: 'title' as any,
        }
        : {}

    return (
        <div className="h-full flex flex-col p-6 gap-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Agenda</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Gestión de turnos por consultorio en tiempo real.
                    </p>
                </div>
                <button
                    onClick={() => openNewModal()}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors cursor-pointer"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo Turno
                </button>
            </div>

            {/* Calendar */}
            <div ref={calendarRef} className="flex-1 bg-card rounded-xl shadow-sm border border-border overflow-hidden min-h-0">
                <Calendar
                    culture="es"
                    localizer={localizer}
                    messages={messages}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    onView={(v) => setView(v)}
                    date={date}
                    onNavigate={(d) => setDate(d)}
                    views={[Views.DAY, Views.WEEK]}
                    step={30}
                    timeslots={2}
                    min={new Date(0, 0, 0, 8, 0, 0)}
                    max={new Date(0, 0, 0, 21, 0, 0)}
                    className="h-full font-sans text-sm"
                    selectable
                    onSelectSlot={handleSelectSlot}
                    onSelectEvent={handleSelectEvent}
                    eventPropGetter={(event) => {
                        const profColor = event.raw.professional?.color || 'rgba(59, 130, 246, 0.40)'; // default blue if not set
                        const isCancelled = event.status === 'cancelado' || event.status === 'cancelado_tarde';
                        
                        return {
                            className: 'custom-event',
                            style: {
                                backgroundColor: profColor,
                                opacity: isCancelled ? 0.6 : 1,
                                textDecoration: isCancelled ? 'line-through' : 'none'
                            }
                        };
                    }}
                    components={{ event: AppointmentEvent }}
                    {...resourceProps}
                />
            </div>

            {/* ── Modal ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">
                                {selectedEvent ? 'Actualizar Turno' : 'Agendar Nuevo Turno'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {selectedEvent ? (
                                /* ── Edit mode ── */
                                <div className="space-y-4">
                                    <div className="bg-muted p-4 rounded-md border border-border">
                                        <p className="font-medium text-foreground">{selectedEvent.title}</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {format(selectedEvent.start, 'dd/MM/yyyy HH:mm')}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {selectedEvent.raw.service?.name}
                                            {selectedEvent.raw.professional && ` — Dr/a. ${selectedEvent.raw.professional.first_name} ${selectedEvent.raw.professional.last_name}`}
                                        </p>
                                    </div>

                                    {activeCuponera && (
                                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-center gap-3 mt-4">
                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            <div>
                                                <p className="text-sm font-medium text-green-600 dark:text-green-500">
                                                    {activeCuponera.is_linked ? 'Cuponera vinculada a este turno' : 'Cuponera activa seleccionada'}
                                                </p>
                                                <p className="text-xs text-green-600/80 dark:text-green-500/80">
                                                    Progreso: {activeCuponera.used_sessions} de {activeCuponera.total_sessions} sesiones usadas.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Pacientes en edición */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-foreground">Pacientes</label>
                                            <button
                                                type="button"
                                                onClick={addPatientSlot}
                                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" /> Agregar
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {formData.patient_ids.map((pid, idx) => (
                                                <div key={idx} className="flex gap-2 items-start">
                                                    <div className="flex-1">
                                                        <PatientSearchInput
                                                            patients={patients}
                                                            value={pid}
                                                            onChange={val => updatePatientSlot(idx, val)}
                                                        />
                                                    </div>
                                                    {formData.patient_ids.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removePatientSlot(idx)}
                                                            className="p-2 text-muted-foreground hover:text-destructive cursor-pointer mt-0.5"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Profesional</label>
                                            <select
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={formData.professional_id}
                                                onChange={e => setFormData({ ...formData, professional_id: e.target.value })}
                                            >
                                                <option value="">Sin asignar</option>
                                                {professionals.map(p => (
                                                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Consultorio</label>
                                            <select
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={formData.room_id}
                                                onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                                            >
                                                <option value="">Sin asignar</option>
                                                {rooms.map(r => (
                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Actualizar Estado</label>
                                        <select
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={formData.status}
                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        >
                                            <option value="pendiente">Pendiente (A Confirmar)</option>
                                            <option value="confirmado">Confirmado</option>
                                            <option value="cancelado">Cancelado</option>
                                            <option value="cancelado_tarde">Cancelado con penalidad</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                /* ── Create mode ── */
                                <>
                                    {/* Pacientes — selector dinámico */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-foreground">
                                                Paciente{formData.patient_ids.length > 1 ? 's' : ''}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={addPatientSlot}
                                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer"
                                            >
                                                <UserPlus className="w-3.5 h-3.5" /> Agregar paciente
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {formData.patient_ids.map((pid, idx) => (
                                                <div key={idx} className="flex gap-2 items-start">
                                                    <div className="flex-1">
                                                        <PatientSearchInput
                                                            patients={patients}
                                                            value={pid}
                                                            onChange={val => updatePatientSlot(idx, val)}
                                                            required={idx === 0}
                                                        />
                                                    </div>
                                                    {formData.patient_ids.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removePatientSlot(idx)}
                                                            className="p-2 text-muted-foreground hover:text-destructive cursor-pointer mt-0.5"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}                                        </div>
                                    </div>

                                    {/* Profesional + Consultorio */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Profesional</label>
                                            <select
                                                required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={formData.professional_id}
                                                onChange={e => setFormData({ ...formData, professional_id: e.target.value })}
                                            >
                                                <option value="" disabled>Elegir...</option>
                                                {professionals.map(p => (
                                                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Consultorio</label>
                                            <select
                                                required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={formData.room_id}
                                                onChange={e => setFormData({ ...formData, room_id: e.target.value })}
                                            >
                                                <option value="" disabled>Elegir sala...</option>
                                                {rooms.map(r => (
                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Servicio */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Servicio / Tratamiento</label>
                                        <select
                                            required
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={formData.service_id}
                                            onChange={e => setFormData({ ...formData, service_id: e.target.value })}
                                        >
                                            <option value="" disabled>Seleccionar tratamiento...</option>
                                            {services.map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</option>
                                            ))}
                                        </select>
                                    </div>

                                    {activeCuponera && (
                                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-center gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            <div>
                                                <p className="text-sm font-medium text-green-600 dark:text-green-500">
                                                    Cuponera disponible
                                                </p>
                                                <p className="text-xs text-green-600/80 dark:text-green-500/80">
                                                    Progreso: {activeCuponera.used_sessions} de {activeCuponera.total_sessions} sesiones usadas.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Fecha + Hora */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Fecha</label>
                                            <input
                                                type="date" required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none [color-scheme:dark]"
                                                value={formData.date}
                                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Hora de Inicio</label>
                                            <input
                                                type="time" required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none [color-scheme:dark]"
                                                value={formData.time}
                                                onChange={e => setFormData({ ...formData, time: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Estado */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Estado</label>
                                        <select
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={formData.status}
                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        >
                                            <option value="pendiente">Pendiente (A Confirmar)</option>
                                            <option value="confirmado">Confirmado</option>
                                            <option value="cancelado">Cancelado</option>
                                            <option value="cancelado_tarde">Cancelado con penalidad</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            <div className="space-y-2 mt-4">
                                <label className="text-sm font-medium text-foreground">Notas Adicionales</label>
                                <textarea
                                    rows={3}
                                    placeholder="Información relevante para el turno..."
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-y"
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-between mt-2">
                                <div>
                                    {selectedEvent && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteAppointment}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors cursor-pointer shadow-sm"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Eliminar turno
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 cursor-pointer"
                                    >
                                        {selectedEvent ? 'Guardar Cambios' : 'Agendar Turno'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
