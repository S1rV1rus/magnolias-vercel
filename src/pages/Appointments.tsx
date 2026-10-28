import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import type { View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, UserPlus, Trash2, CheckCircle2, Gift } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../lib/logger'
import { monthsProgress, formatMoney, isCuponeraActive } from '../lib/utils'
import { shiftCuponeraSessionIndexes } from '../lib/cuponeras'
import { fetchAllRows } from '../lib/fetchAll'
import { agendaFetchRange, isConsumedStatus, notesSuggestNoCharge, projectCuponeraSessions, STATUS_COLOR, STATUS_LABEL, type CuponeraApptRow } from '../lib/appointments'
import { findGiftCardByCode, redeemGiftCard, releaseGiftCard, GIFT_CARD_CONSUMED_STATUSES, type GiftCardRow } from '../lib/giftCards'

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

// ─── Profesionales del turno ───────────────────────────────────────────────────
// Un turno puede tener de 1 a 4 profesionales (masaje en pareja, cuatro manos): la principal
// vive en appointments.professional_id y el equipo completo en appointment_professionals,
// igual que appointments.patient_id + appointment_patients con los pacientes.
const MAX_PROFESSIONALS = 4

interface ProfessionalRef {
    id: string
    first_name: string
    last_name: string
}

const professionalsOf = (list: ProfessionalRef[] | undefined, primary: ProfessionalRef | null): ProfessionalRef[] =>
    list?.length ? list : (primary ? [primary] : [])

// Etiqueta corta para la tarjeta del calendario, que es angosta: con una sola, nombre y
// apellido como siempre; con dos, los dos nombres; con más, la principal y cuántas la
// acompañan ("Agustina +2").
const professionalsShortLabel = (list: ProfessionalRef[] | undefined, primary: ProfessionalRef | null) => {
    const profs = professionalsOf(list, primary)
    if (!profs.length) return ''
    if (profs.length === 1) return `${profs[0].first_name} ${profs[0].last_name}`
    if (profs.length === 2) return `${profs[0].first_name} + ${profs[1].first_name}`
    return `${profs[0].first_name} +${profs.length - 1}`
}

// Nombres completos, para el tooltip, el modal y los logs (ahí sí entra el texto largo).
const professionalsFullLabel = (list: ProfessionalRef[] | undefined, primary: ProfessionalRef | null) => {
    const profs = professionalsOf(list, primary)
    return profs.length ? profs.map(p => `${p.first_name} ${p.last_name}`).join(' & ') : '—'
}

// ─── Appointment Tooltip Portal ────────────────────────────────────────────────
const PAYMENT_COLOR: Record<string, string> = {
    pago: '#16a34a',       // green-600
    impago: '#ef4444',     // red-500
    pendiente: '#d97706',  // amber-600
}

interface TooltipData {
    names: string
    service: string
    professional: string
    status: string
    time: string
    notes: string
    paymentStatus: 'pago' | 'impago' | 'pendiente'
    paymentLabel: string
    x: number
    y: number
    cuponeraProgress?: string
}

function AppointmentTooltip({ data }: { data: TooltipData }) {
    const statusColor = STATUS_COLOR[data.status] ?? '#94a3b8'
    const statusLabel = STATUS_LABEL[data.status] ?? data.status
    const paymentColor = PAYMENT_COLOR[data.paymentStatus] ?? '#94a3b8'

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
                <div className="flex flex-wrap gap-1.5 items-center mt-1">
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
                    {data.paymentLabel && (
                        <span
                            className="appt-tooltip-badge"
                            style={{ backgroundColor: `${paymentColor}22`, color: paymentColor, borderColor: `${paymentColor}55` }}
                        >
                            <span
                                className="appt-tooltip-dot"
                                style={{ backgroundColor: paymentColor }}
                            />
                            {data.paymentLabel}
                        </span>
                    )}
                </div>
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
                {data.cuponeraProgress && (
                    <div className="appt-tooltip-row text-primary font-medium">
                        <span className="appt-tooltip-icon font-normal">🎫</span>
                        <span className="font-semibold">{data.cuponeraProgress}</span>
                    </div>
                )}
                <div className="appt-tooltip-row">
                    <span className="appt-tooltip-icon">👤</span>
                    <span>{data.professional}</span>
                </div>
                {data.notes && (
                    <div className="appt-tooltip-row appt-tooltip-notes">
                        <span className="appt-tooltip-icon">📝</span>
                        <span>{data.notes}</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

// ─── Custom Event ──────────────────────────────────────────────────────────────
function AppointmentEvent({ event }: { event: any }) {
    const { patientList, service, professional, professionalList } = event.raw
    const names = patientList?.length
        ? patientList.map((p: any) => `${p.last_name} ${p.first_name}`).join(' & ')
        : '—'

    const [tooltip, setTooltip] = useState<TooltipData | null>(null)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [isTouch, setIsTouch] = useState(false)

    const getStatusColor = (status: string) => STATUS_COLOR[status] ?? '#94a3b8'

    const getPaymentStatusInfo = useCallback(() => {
        if (['cancelado', 'cancelado_tarde'].includes(event.status)) {
            return { status: 'pendiente' as const, label: '' };
        }

        // Turno marcado explícitamente como sin cargo (regalo / cortesía)
        if (event.raw.app?.is_gift) {
            return {
                status: 'pago' as const,
                label: event.raw.app?.gift_card_id ? 'Sin cargo (Gift Card)' : 'Sin cargo',
            };
        }

        const isUsingCuponera = !!event.raw.app?.cuponera_id;
        const cuponera = event.raw.cuponera;

        if (isUsingCuponera) {
            const isMonthly = cuponera?.cuponera_type === 'months';
            const tag = isMonthly ? 'Pase' : 'Cup.';
            const progress = cuponera
                ? (isMonthly
                    ? ` ${monthsProgress(cuponera.start_date, cuponera.total_months).transcurridos}/${cuponera.total_months}m`
                    : ` ${event.raw.cuponeraSessionNumber ?? cuponera.used_sessions}/${cuponera.total_sessions}`)
                : '';
            if (cuponera && cuponera.is_paid === false) {
                return { status: 'impago' as const, label: `Falta Pagar (${tag}${progress})` };
            }
            return { status: 'pago' as const, label: `Pagado (${tag}${progress})` };
        } else {
            if (event.raw.app?.is_unpaid) {
                return { status: 'impago' as const, label: 'Falta Pagar' };
            } else if (notesSuggestNoCharge(event.raw.app?.notes)) {
                return { status: 'pago' as const, label: 'Pagado' };
            } else if (event.status === 'pendiente') {
                return { status: 'pendiente' as const, label: 'A Cobrar' };
            }
            return { status: 'pago' as const, label: 'Pagado' };
        }
    }, [event.raw.app?.cuponera_id, event.raw.cuponera, event.raw.app?.is_unpaid, event.status, event.raw.app?.notes, event.raw.app?.is_gift, event.raw.app?.gift_card_id])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isTouch) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        const paymentInfo = getPaymentStatusInfo()
        setTooltip({
            names,
            service: service?.name || '—',
            professional: professionalsFullLabel(professionalList, professional),
            status: event.status,
            time: format(event.start, 'HH:mm') + ' – ' + format(event.end, 'HH:mm'),
            notes: event.raw.app?.notes || '',
            paymentStatus: paymentInfo.status,
            paymentLabel: paymentInfo.label,
            x: e.clientX,
            y: e.clientY,
            cuponeraProgress: event.raw.cuponera
                ? (event.raw.cuponera.cuponera_type === 'months'
                    ? `Mes ${monthsProgress(event.raw.cuponera.start_date, event.raw.cuponera.total_months).transcurridos} de ${event.raw.cuponera.total_months}`
                    : `Sesión ${event.raw.cuponeraSessionNumber ?? event.raw.cuponera.used_sessions} de ${event.raw.cuponera.total_sessions}${event.raw.cuponeraSessionProjected ? ' (a confirmar)' : ''}`)
                : undefined,
        })
    }, [isTouch, names, service, professional, professionalList, event.status, event.start, event.end, event.raw.app?.notes, event.raw.cuponera, event.raw.cuponeraSessionNumber, event.raw.cuponeraSessionProjected, getPaymentStatusInfo])

    const handleMouseLeave = useCallback(() => {
        if (isTouch) return
        hideTimer.current = setTimeout(() => setTooltip(null), 80)
    }, [isTouch])

    // --- Lógica Mobile (Touch) ---
    // En celular, un toque corto ("tap") no abre la edición, sino que muestra la previsualización.
    // Para editar, el usuario debe mantener apretado el turno (long press) por 500ms.

    const handleTouchStart = useCallback(() => {
        setIsTouch(true)
        // Cierra todos los otros tooltips que puedan estar abiertos
        window.dispatchEvent(new CustomEvent('closeAllTooltips'))
        
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
        
        // Inicia el temporizador para detectar el "long press"
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null // Limpiar ref
            // Si pasan 500ms sin soltar el dedo: es un "long press"
            if (navigator.vibrate) navigator.vibrate(50) // Vibración de feedback táctil
            
            // Ignorar el evento nativo de react-big-calendar que pueda dispararse
            ;(window as any).__ignoreNextSelectUntil = Date.now() + 1000;

            // Se dispara el evento global para abrir el modal de edición
            window.dispatchEvent(new CustomEvent('editAppointment', { detail: event }))
            setTooltip(null) // Oculta el tooltip si estaba visible
        }, 500)
    }, [event])

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        // Si el usuario suelta el dedo antes de los 500ms, se cancela la edición (fue solo un "tap")
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
            
            // Bloquear el onSelectEvent nativo de react-big-calendar (click sintético)
            ;(window as any).__ignoreNextSelectUntil = Date.now() + 1000;

            // Extraemos las coordenadas del toque para mostrar el tooltip
            const touch = e.changedTouches[0]
            if (touch) {
                const paymentInfo = getPaymentStatusInfo()
                setTooltip({
                    names,
                    service: service?.name || '—',
                    professional: professionalsFullLabel(professionalList, professional),
                    status: event.status,
                    time: format(event.start, 'HH:mm') + ' – ' + format(event.end, 'HH:mm'),
                    notes: event.raw.app?.notes || '',
                    paymentStatus: paymentInfo.status,
                    paymentLabel: paymentInfo.label,
                    x: touch.clientX,
                    y: touch.clientY,
                })
                
                // Ocultamos el tooltip automáticamente después de 2.5 segundos
                if (hideTimer.current) clearTimeout(hideTimer.current)
                hideTimer.current = setTimeout(() => setTooltip(null), 2500)
            }
        }
    }, [names, service, professional, professionalList, event.status, event.start, event.end, event.raw.app?.notes, getPaymentStatusInfo])

    const handleTouchMove = useCallback(() => {
        // Si el usuario mueve el dedo (está haciendo scroll), también se cancela la edición
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    useEffect(() => { 
        const handleCloseAll = () => {
            setTooltip(null)
            if (hideTimer.current) clearTimeout(hideTimer.current)
        }
        window.addEventListener('closeAllTooltips', handleCloseAll)
        
        return () => {
            window.removeEventListener('closeAllTooltips', handleCloseAll)
            if (hideTimer.current) clearTimeout(hideTimer.current) 
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
        }
    }, [])

    return (
        <div
            className="flex flex-col h-full overflow-hidden leading-snug px-0.5 pt-0.5 gap-0.5 relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
        >
            {tooltip && <AppointmentTooltip data={tooltip} />}
            <span className="font-semibold text-[11px] truncate">{names}</span>
            <span className="text-[10px] truncate opacity-90">
                {service?.name || '—'}
                {event.raw.cuponera && (
                    event.raw.cuponera.cuponera_type === 'months'
                        ? ` (Mes ${monthsProgress(event.raw.cuponera.start_date, event.raw.cuponera.total_months).transcurridos}/${event.raw.cuponera.total_months})`
                        : ` (${event.raw.cuponeraSessionNumber ?? event.raw.cuponera.used_sessions}/${event.raw.cuponera.total_sessions})`
                )}
            </span>
            <span className="text-[10px] truncate opacity-75">
                {professionalsShortLabel(professionalList, professional)}
            </span>
            <div className="absolute bottom-1 right-1 flex items-center gap-1">
                {event.raw.app?.is_unpaid && (
                    <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50 px-1 rounded-sm border border-red-200 dark:border-red-900 shadow-sm leading-tight">
                        DEUDA
                    </span>
                )}
                <div
                    className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white shadow-sm"
                    style={{ backgroundColor: getStatusColor(event.status) }}
                />
            </div>
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
            const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""
            const haystack = normalize(`${p.first_name} ${p.last_name} ${p.document_id || ''}`)
            const searchTerms = normalize(query).split(' ').filter(Boolean)
            return searchTerms.every(term => haystack.includes(term))
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

// ─── Sin cargo + Gift Card ─────────────────────────────────────────────────────
// Reemplaza a la vieja convención de escribir "regalo"/"voucher" en las notas: el turno se
// marca explícitamente como sin cargo y, opcionalmente, se le vincula el código de una
// tarjeta de regalo. La tarjeta se canjea sola cuando el turno queda confirmado.
// Con una cuponera activa el bloque no se muestra (igual que el check de deuda): la sesión ya
// la paga la cuponera, y marcarla sin cargo la descontaría igual y le sacaría la etiqueta
// "Cup. 3/8" al turno en el calendario.

// Una tarjeta no puede pagar dos turnos: la base tiene un índice único sobre gift_card_id y
// rechaza el segundo turno que la intente vincular. El error crudo de Postgres no le dice nada
// a nadie, así que acá se traduce (y devuelve null si el error es cualquier otro).
const giftCardLinkConflictMessage = (error: { code?: string; message?: string } | null, code?: string | null) =>
    error?.code === '23505' && (error.message ?? '').includes('gift_card_id')
        ? `La gift card${code ? ` ${code}` : ''} ya está vinculada a otro turno y una tarjeta no puede pagar dos. El turno no se guardó: desvinculala de ese turno o usá otra.`
        : null

function GiftCardField({
    idSuffix,
    isGift,
    onToggleGift,
    code,
    onCodeChange,
    card,
    message,
    searching,
    onSearch,
    onUnlink,
    serviceName,
}: {
    idSuffix: string
    isGift: boolean
    onToggleGift: (checked: boolean) => void
    code: string
    onCodeChange: (value: string) => void
    card: GiftCardRow | null
    message: string
    searching: boolean
    onSearch: () => void
    onUnlink: () => void
    serviceName: (id: string | null) => string | null
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <input
                    type="checkbox"
                    id={`is_gift_${idSuffix}`}
                    checked={isGift}
                    onChange={e => onToggleGift(e.target.checked)}
                    className="w-4 h-4 rounded border-primary/50 text-primary focus:ring-primary/20 accent-primary"
                />
                <label htmlFor={`is_gift_${idSuffix}`} className="text-sm font-medium text-foreground cursor-pointer select-none">
                    Sin cargo (regalo / cortesía)
                </label>
            </div>

            {isGift && (card ? (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-start gap-3">
                    <Gift className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-600 dark:text-green-500">
                            Gift Card <span className="font-mono">{card.code}</span>
                        </p>
                        <p className="text-xs text-green-600/80 dark:text-green-500/80">
                            {formatMoney(card.amount, card.currency)} · {serviceName(card.service_id) || 'Sin tratamiento asignado'}
                        </p>
                        <p className="text-xs text-green-600/80 dark:text-green-500/80">
                            {card.status === 'usada'
                                ? 'Ya canjeada por este turno.'
                                : 'Se marca como canjeada al confirmar el turno.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onUnlink}
                        title="Desvincular tarjeta"
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex justify-between">
                        Código de la tarjeta de regalo <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="MAG-XXXXXX"
                            className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
                            value={code}
                            onChange={e => onCodeChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearch() } }}
                        />
                        <button
                            type="button"
                            onClick={onSearch}
                            disabled={searching}
                            className="px-3 py-2 text-sm font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 cursor-pointer disabled:opacity-50"
                        >
                            {searching ? 'Buscando...' : 'Vincular'}
                        </button>
                    </div>
                    {message ? (
                        <p className="text-xs text-destructive">{message}</p>
                    ) : (
                        <p className="text-xs text-muted-foreground">Si es cortesía de la casa (sin tarjeta), dejalo vacío.</p>
                    )}
                </div>
            ))}
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

    // patient_ids / professional_ids: listas de IDs (mínimo 1 entrada vacía al abrir el form).
    // La primera profesional de la lista es la principal (la que queda en professional_id).
    const [formData, setFormData] = useState({
        patient_ids: [''],
        service_id: '',
        professional_ids: [''],
        room_id: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(roundToNearest30(new Date()), 'HH:mm'),
        status: 'pendiente',
        notes: '',
        is_unpaid: false,
        is_gift: false,
        duration: 0,
    })

    const [activeCuponera, setActiveCuponera] = useState<any>(null)

    // ── Gift card vinculada al turno ──
    const [giftCard, setGiftCard] = useState<GiftCardRow | null>(null)  // tarjeta vinculada / encontrada
    const [giftCardCode, setGiftCardCode] = useState('')     // texto del buscador
    const [giftCardMsg, setGiftCardMsg] = useState('')       // mensaje de error de la búsqueda
    const [giftCardSearching, setGiftCardSearching] = useState(false)

    useEffect(() => {
        const fetchCuponera = async () => {
            if (!isModalOpen) return

            // Si estamos editando y YA tiene una cuponera vinculada
            if (selectedEvent?.raw?.cuponera) {
                setActiveCuponera({ ...selectedEvent.raw.cuponera, is_linked: true })
                return
            }

            const pid = formData.patient_ids[0]
            const sid = formData.service_id

            if (!pid || !sid) {
                setActiveCuponera(null)
                return
            }

            // Si es un turno nuevo o uno sin cuponera vinculada, buscar si hay una activa.
            // Se descartan los pases mensuales vencidos por fecha (su is_active queda en true).
            const { data } = await supabase
                .from('cuponeras')
                .select('id, total_sessions, used_sessions, is_paid, cuponera_type, total_months, start_date, is_active')
                .eq('patient_id', pid)
                .eq('service_id', sid)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(10)

            const active = data?.find(isCuponeraActive)
            setActiveCuponera(active ? { ...active, is_linked: false } : null)
        }

        fetchCuponera()
    }, [formData.patient_ids[0], formData.service_id, isModalOpen, selectedEvent])

    // Al abrir el modal, precargar la gift card que ya tenga vinculada el turno (si edita)
    useEffect(() => {
        if (!isModalOpen) return
        const linked = selectedEvent?.raw?.giftCard ?? null
        setGiftCard(linked)
        setGiftCardCode(linked?.code ?? '')
        setGiftCardMsg('')
        setGiftCardSearching(false)
    }, [isModalOpen, selectedEvent])


    // Solo se traen los turnos del mes visible ± 7 días (cubre las semanas que cruzan de mes).
    // Antes se traían TODOS, y PostgREST corta en 1000 filas: pasado ese número la agenda
    // dejaba de mostrar turnos sin avisar. Se vuelve a pedir al cambiar de mes.
    const monthKey = format(date, 'yyyy-MM')
    const fetchSeq = useRef(0)

    useEffect(() => { fetchData() }, [monthKey]) // eslint-disable-line react-hooks/exhaustive-deps

    async function fetchData() {
        const seq = ++fetchSeq.current
        const { start: rangeStart, end: rangeEnd } = agendaFetchRange(date)

        const { data: appts } = await supabase
            .from('appointments')
            .select(`
                id, start_time, end_time, status, room_id, cuponera_id, notes, is_unpaid, cuponera_session_index, is_gift, gift_card_id,
                appointment_patients(patients(id, first_name, last_name)),
                appointment_professionals(created_at, professionals(id, first_name, last_name, color)),
                services(id, name, duration_minutes),
                professionals(id, first_name, last_name, color),
                rooms(id, name),
                cuponeras(id, total_sessions, used_sessions, is_paid, cuponera_type, total_months, start_date),
                gift_cards(id, code, status, amount, currency, service_id, redeemed_at)
            `)
            .lt('start_time', rangeEnd.toISOString())
            .gt('end_time', rangeStart.toISOString())

        if (appts) {
            // Número de sesión REAL por turno (cuponeras por sesiones): ver projectCuponeraSessions
            const cuponeraById: Record<string, { used_sessions?: number | null }> = {}
            const pendingCuponeraIds = new Set<string>()
            appts.forEach(a => {
                const cup = Array.isArray(a.cuponeras) ? a.cuponeras[0] : a.cuponeras
                if (cup && cup.id && cup.cuponera_type !== 'months' && a.status !== 'cancelado') {
                    cuponeraById[cup.id] = cup
                    if (a.cuponera_session_index == null) pendingCuponeraIds.add(cup.id)
                }
            })
            // La proyección de los pendientes depende de TODOS los pendientes de la cuponera, no
            // solo los del rango visible: se traen aparte (columnas mínimas) para no correr la cuenta.
            let cuponeraAppts: CuponeraApptRow[] = appts.filter(a => a.cuponera_id && cuponeraById[a.cuponera_id] && a.status !== 'cancelado')
            if (pendingCuponeraIds.size) {
                const { data: allCupAppts } = await supabase
                    .from('appointments')
                    .select('id, start_time, status, cuponera_id, cuponera_session_index')
                    .in('cuponera_id', [...pendingCuponeraIds])
                    .neq('status', 'cancelado')
                if (allCupAppts) {
                    cuponeraAppts = [
                        ...cuponeraAppts.filter(a => !pendingCuponeraIds.has(a.cuponera_id)),
                        ...allCupAppts,
                    ]
                }
            }
            const sessionInfoByAppt = projectCuponeraSessions(
                cuponeraAppts,
                Object.fromEntries(Object.entries(cuponeraById).map(([id, c]) => [id, c.used_sessions])),
            )

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

                // Equipo del turno: la principal (professional_id) primero y el resto en orden
                // de alta. Un turno de una sola profesional queda igual que siempre.
                const profRows = Array.isArray(app.appointment_professionals) ? app.appointment_professionals : []
                const teamProfessionals = profRows
                    .slice()
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map(r => Array.isArray(r.professionals) ? r.professionals[0] : r.professionals)
                    .filter(Boolean)
                const professionalList = professional
                    ? [professional, ...teamProfessionals.filter(pr => pr.id !== professional.id)]
                    : teamProfessionals

                const cuponera = Array.isArray(app.cuponeras) ? app.cuponeras[0] : app.cuponeras
                const giftCardRow = Array.isArray(app.gift_cards) ? app.gift_cards[0] : app.gift_cards

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
                    raw: { app, patientList, patient: patientList[0] ?? null, service, professional, professionalList, room, cuponera, giftCard: giftCardRow ?? null, cuponeraSessionNumber: sessionInfoByAppt[app.id]?.number, cuponeraSessionProjected: sessionInfoByAppt[app.id]?.projected ?? false },
                }
            })
            // Si mientras tanto se navegó a otro mes, esta respuesta ya no corresponde
            if (seq !== fetchSeq.current) return
            setEvents(formatted)
        }

        const [{ data: pData }, { data: sData }, { data: profData }, { data: rData }] = await Promise.all([
            fetchAllRows(
                (from, to) => supabase.from('patients').select('id, first_name, last_name, document_id')
                    .order('last_name').order('id').range(from, to)
            ),
            supabase.from('services').select('id, name, duration_minutes'),
            supabase.from('professionals').select('id, first_name, last_name').eq('is_active', true),
            supabase.from('rooms').select('id, name').eq('is_active', true).order('name'),
        ])

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
            professional_ids: [''],
            room_id: resourceId ?? '',
            date: format(targetDate, 'yyyy-MM-dd'),
            time: format(targetDate, 'HH:mm'),
            status: 'pendiente',
            notes: '',
            is_unpaid: false,
            is_gift: false,
            duration: 0,
        })
        setIsModalOpen(true)
    }

    const handleSelectSlot = (slotInfo: { start: Date; resourceId?: string | number }) => {
        openNewModal(slotInfo.start, slotInfo.resourceId as string | undefined)
    }

    const handleSelectEvent = useCallback((event: any) => {
        // Si estamos bloqueando la selección (por un "tap" o "long-press" en celular), no hacemos nada
        if ((window as any).__ignoreNextSelectUntil && (window as any).__ignoreNextSelectUntil > Date.now()) return

        setSelectedEvent(event)
        const existingIds = event.raw.patientList?.map((p: any) => p.id) ?? ['']
        const profId = event.raw.professional?.id ?? event.raw.app?.professional_id ?? ''
        const existingProfIds: string[] = event.raw.professionalList?.map((pr: ProfessionalRef) => pr.id) ?? []
        const roomId = event.raw.room?.id ?? event.raw.app?.room_id ?? ''
        const srvId = event.raw.service?.id ?? event.raw.app?.service_id ?? ''
        const durationMin = Math.max(5, Math.round((event.end.getTime() - event.start.getTime()) / 60000))
        setFormData(f => ({
            ...f,
            status: event.status,
            professional_ids: existingProfIds.length ? existingProfIds : [profId],
            room_id: roomId,
            service_id: srvId,
            patient_ids: existingIds.length ? existingIds : [''],
            notes: event.raw.app?.notes || '',
            is_unpaid: event.raw.app?.is_unpaid || false,
            is_gift: event.raw.app?.is_gift || false,
            duration: durationMin,
        }))
        setIsModalOpen(true)
    }, [])

    useEffect(() => {
        const handleCustomEdit = (e: any) => {
            // Permitir explícitamente este evento saltándose el bloqueo temporal
            const prev = (window as any).__ignoreNextSelectUntil
            ;(window as any).__ignoreNextSelectUntil = 0
            handleSelectEvent(e.detail)
            ;(window as any).__ignoreNextSelectUntil = prev
        }
        window.addEventListener('editAppointment', handleCustomEdit)
        return () => window.removeEventListener('editAppointment', handleCustomEdit)
    }, [handleSelectEvent])

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

    // ── Helpers para el selector de profesionales ──
    // Hasta MAX_PROFESSIONALS por turno (masaje en pareja, cuatro manos): la primera de la
    // lista es la principal y es la que queda en appointments.professional_id.
    const addProfessionalSlot = () => {
        setFormData(f => f.professional_ids.length >= MAX_PROFESSIONALS
            ? f
            : { ...f, professional_ids: [...f.professional_ids, ''] })
    }

    const removeProfessionalSlot = (idx: number) => {
        setFormData(f => ({
            ...f,
            professional_ids: f.professional_ids.length > 1
                ? f.professional_ids.filter((_, i) => i !== idx)
                : ['']
        }))
    }

    const updateProfessionalSlot = (idx: number, value: string) => {
        setFormData(f => {
            const ids = [...f.professional_ids]
            ids[idx] = value
            return { ...f, professional_ids: ids }
        })
    }

    // Una misma profesional no se puede elegir dos veces en el mismo turno (la tabla puente
    // tiene un único por turno + profesional), así que se sacan del resto de los selectores.
    const availableProfessionals = (currentId: string) =>
        professionals.filter(p => p.id === currentId || !formData.professional_ids.includes(p.id))

    // ── Helpers de la gift card ──
    const serviceName = (id: string | null) => services.find(s => s.id === id)?.name || null

    // Marcar/desmarcar "sin cargo". Sin cargo y deuda son incompatibles: al marcarlo se
    // limpia el "no pagó" y, al desmarcarlo, se suelta la tarjeta que estuviera cargada.
    const handleToggleGift = (checked: boolean) => {
        setFormData(f => ({ ...f, is_gift: checked, is_unpaid: checked ? false : f.is_unpaid }))
        if (!checked) setGiftCardMsg('')
    }

    const handleSearchGiftCard = async () => {
        const code = giftCardCode.trim()
        if (!code) {
            setGiftCard(null)
            setGiftCardMsg('Ingresá el código de la tarjeta.')
            return
        }

        setGiftCardSearching(true)
        const card = await findGiftCardByCode(code)
        setGiftCardSearching(false)

        if (!card) {
            setGiftCard(null)
            setGiftCardMsg('No existe ninguna tarjeta de regalo con ese código.')
            return
        }

        // Una tarjeta ya canjeada solo se acepta si es la que este mismo turno tiene vinculada
        const linkedId = selectedEvent?.raw?.app?.gift_card_id ?? null
        if (card.status === 'usada' && card.id !== linkedId) {
            setGiftCard(null)
            setGiftCardMsg(
                card.redeemed_at
                    ? `Esa tarjeta ya fue canjeada el ${format(new Date(card.redeemed_at + 'T12:00:00'), 'dd/MM/yyyy')}.`
                    : 'Esa tarjeta ya fue canjeada.'
            )
            return
        }

        setGiftCard(card)
        setGiftCardMsg('')
    }

    // Solo desvincula en el formulario; el canje se revierte en la base al guardar.
    const handleUnlinkGiftCard = () => {
        setGiftCard(null)
        setGiftCardCode('')
        setGiftCardMsg('')
    }

    // ── Profesionales del turno en la tabla puente ──
    // Mismo criterio que con los pacientes: se sincroniza la lista completa (se borran las que
    // ya no están y se insertan las nuevas). La principal, además, queda en professional_id.
    const syncAppointmentProfessionals = async (appointmentId: string, professionalIds: string[]) => {
        await supabase.from('appointment_professionals').delete().eq('appointment_id', appointmentId)
        if (!professionalIds.length) return
        const { error } = await supabase.from('appointment_professionals').insert(
            professionalIds.map(prid => ({ appointment_id: appointmentId, professional_id: prid }))
        )
        if (error) {
            console.error('Error guardando las profesionales del turno:', error)
            alert(`El turno se guardó, pero no se pudieron asignar todas las profesionales: ${error.message}`)
        }
    }

    // ── Bloqueo de agenda (anti doble reserva) ──
    // Devuelve el mensaje del choque (diciendo QUIÉN está ocupada) o null si el horario está libre.
    //
    // Una profesional puede estar en un turno por dos vías: la columna appointments.professional_id
    // (la principal) o una fila en appointment_professionals (la segunda masajista del masaje en
    // pareja). Un solo .or() no alcanza, porque PostgREST no filtra por columnas de una tabla
    // embebida dentro de un or(); y un !inner sobre el puente dejaría afuera a los turnos que
    // todavía no tienen filas ahí. Así que se traen los turnos que pisan esa franja horaria —son
    // un puñado, como mucho uno por consultorio— y el cruce se resuelve acá uniendo las dos fuentes.
    const findScheduleConflict = async (
        startDateTime: Date,
        endDateTime: Date,
        professionalIds: string[],
        roomId: string,
        ignoreAppointmentId?: string,
    ): Promise<string | null> => {
        let query = supabase
            .from('appointments')
            .select('id, room_id, professional_id, appointment_professionals(professional_id)')
            .neq('status', 'cancelado')
            .neq('status', 'cancelado_tarde')
            .lt('start_time', endDateTime.toISOString())
            .gt('end_time', startDateTime.toISOString())

        // Al editar, el propio turno no cuenta como conflicto consigo mismo
        if (ignoreAppointmentId) query = query.neq('id', ignoreAppointmentId)

        const { data: overlapping, error: overlapError } = await query

        // Si no se pudo verificar, no se guarda: dejarlo pasar es la forma de que se cuele un doble turno
        if (overlapError) {
            console.error('Overlap check failed:', overlapError)
            return 'No se pudo comprobar si el horario está libre. Revisá la conexión e intentá de nuevo.'
        }
        if (!overlapping?.length) return null

        // Primero las profesionales: es el choque que pidió avisar la clínica
        for (const appt of overlapping) {
            const busyIds = new Set<string>([
                ...(appt.professional_id ? [appt.professional_id] : []),
                ...(Array.isArray(appt.appointment_professionals) ? appt.appointment_professionals : [])
                    .map(r => r.professional_id)
                    .filter(Boolean),
            ])
            const takenId = professionalIds.find(id => busyIds.has(id))
            if (takenId) {
                const prof = professionals.find(pr => pr.id === takenId)
                const name = prof ? `${prof.first_name} ${prof.last_name}` : 'La profesional seleccionada'
                return `${name} ya tiene un turno asignado en ese horario.`
            }
        }

        const roomTaken = roomId && overlapping.some(appt => appt.room_id === roomId)
        if (roomTaken) {
            const room = rooms.find(r => r.id === roomId)
            return room
                ? `El consultorio ${room.name} ya tiene un turno asignado en ese horario.`
                : 'El consultorio ya tiene un turno asignado en ese horario.'
        }

        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // ── Edit existing ──
        if (selectedEvent) {
            const prevStatus = selectedEvent.status
            const newStatus = formData.status
            const validProfessionalIds = [...new Set(formData.professional_ids.filter(Boolean))]
            const newGiftCardId = formData.is_gift ? (giftCard?.id ?? null) : null
            const updatePayload: Record<string, any> = {
                status: newStatus,
                notes: formData.notes,
                is_unpaid: newStatus === 'confirmado' ? formData.is_unpaid : false,
                is_gift: formData.is_gift,
                gift_card_id: newGiftCardId,
            }
            // La primera de la lista es la principal y es la que se guarda en la columna
            if (validProfessionalIds.length) updatePayload.professional_id = validProfessionalIds[0]
            if (formData.room_id) updatePayload.room_id = formData.room_id
            // Permitir acortar/ajustar manualmente la duración del turno (recalcula end_time).
            const newEnd = formData.duration && formData.duration > 0
                ? new Date(selectedEvent.start.getTime() + formData.duration * 60000)
                : selectedEvent.end
            if (formData.duration && formData.duration > 0) {
                updatePayload.end_time = newEnd.toISOString()
            }

            // Bloqueo de agenda: solo se revisa si cambió algo de lo que ocupa la agenda
            // (equipo, consultorio u horario) y el turno sigue vigente. Un cambio de estado o
            // de notas no se valida, para no trabar turnos viejos que ya vienen superpuestos.
            const CANCELADOS = ['cancelado', 'cancelado_tarde']
            const prevProfessionalIds: string[] = selectedEvent.raw.professionalList?.map((pr: ProfessionalRef) => pr.id) ?? []
            // Reactivar un turno cancelado SÍ vuelve a ocupar la agenda: mientras estuvo
            // cancelado su hueco pudo revenderse, así que hay que revalidar aunque no haya
            // cambiado ni el equipo ni la sala ni el horario.
            const seReactiva = CANCELADOS.includes(selectedEvent.status) && !CANCELADOS.includes(newStatus)
            const occupancyChanged =
                seReactiva
                || formData.room_id !== (selectedEvent.raw.room?.id ?? '')
                || validProfessionalIds.length !== prevProfessionalIds.length
                || validProfessionalIds.some(id => !prevProfessionalIds.includes(id))
                || newEnd.getTime() !== selectedEvent.end.getTime()

            if (occupancyChanged && !CANCELADOS.includes(newStatus)) {
                const conflict = await findScheduleConflict(
                    selectedEvent.start,
                    newEnd,
                    validProfessionalIds,
                    formData.room_id,
                    selectedEvent.id,
                )
                if (conflict) {
                    alert(conflict)
                    return
                }
            }

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

                // Update professionals in junction table
                if (validProfessionalIds.length > 0) {
                    await syncAppointmentProfessionals(selectedEvent.id, validProfessionalIds)
                }

                // Cuponera Update Logic
                const wasConsumed = isConsumedStatus(prevStatus)
                const isNowConsumed = isConsumedStatus(newStatus)

                if (prevStatus !== newStatus && selectedEvent.raw.cuponera && selectedEvent.raw.cuponera.cuponera_type !== 'months' && wasConsumed !== isNowConsumed) {
                    const cuponera = selectedEvent.raw.cuponera
                    const sessionDelta = isNowConsumed ? 1 : -1
                    const newUsed = cuponera.used_sessions + sessionDelta
                    const isNowActive = newUsed < cuponera.total_sessions

                    await supabase.from('cuponeras').update({
                        used_sessions: newUsed,
                        is_active: isNowActive
                    }).eq('id', cuponera.id)

                    // Sella (o libera) el número de sesión que consumió ESTE turno
                    const prevIdx = selectedEvent.raw.app?.cuponera_session_index
                    await supabase.from('appointments').update({
                        cuponera_session_index: isNowConsumed ? newUsed : null
                    }).eq('id', selectedEvent.id)

                    // Al liberar (cancelar) hay que bajar 1 a los canjes posteriores: si no,
                    // queda un hueco y el próximo turno reusa un número que ya existe.
                    if (!isNowConsumed && prevIdx != null) {
                        await shiftCuponeraSessionIndexes(cuponera.id, prevIdx)
                    }
                }

                // Gift Card Update Logic — mismo criterio de "consumido" que la cuponera (más
                // 'completado'): se canjea al confirmar y se libera solo si el canje lo había
                // hecho ESTE turno, o sea si estaba consumido y dejó de estarlo.
                const wasGiftConsumed = GIFT_CARD_CONSUMED_STATUSES.includes(prevStatus)
                const isGiftConsumed = GIFT_CARD_CONSUMED_STATUSES.includes(newStatus)
                const prevGiftCardId = selectedEvent.raw.app?.gift_card_id ?? null
                const prevGiftCardCode = selectedEvent.raw.giftCard?.code ?? ''

                // Desvincular o cambiar de tarjeta solo deshace el canje si lo hizo este turno:
                // si nunca estuvo consumido, la tarjeta la canjeó alguien a mano desde Gift Cards.
                if (prevGiftCardId && prevGiftCardId !== newGiftCardId && wasGiftConsumed) {
                    const released = await releaseGiftCard(prevGiftCardId)
                    if (!released) alert(`El turno se guardó, pero no se pudo liberar la gift card ${prevGiftCardCode}: sigue figurando como usada. Revisala en Gift Cards.`)
                }
                if (newGiftCardId && giftCard) {
                    const alreadyRedeemed = giftCard.status === 'usada' && prevGiftCardId === newGiftCardId
                    if (isGiftConsumed && !alreadyRedeemed) {
                        const redeemed = await redeemGiftCard(giftCard, formData.service_id || selectedEvent.raw.service?.id || null)
                        if (redeemed === 'ya_canjeada') {
                            alert(`El turno se guardó, pero la gift card ${giftCard.code} ya estaba canjeada (por otro turno, o a mano desde Gift Cards), así que no se volvió a canjear.`)
                        } else if (redeemed === 'error') {
                            alert(`El turno se guardó, pero no se pudo marcar como usada la gift card ${giftCard.code}: sigue vigente. Revisala en Gift Cards.`)
                        }
                    } else if (prevStatus !== newStatus && wasGiftConsumed && !isGiftConsumed && alreadyRedeemed) {
                        const released = await releaseGiftCard(newGiftCardId)
                        if (!released) alert(`El turno se guardó, pero no se pudo liberar la gift card ${giftCard.code}: sigue figurando como usada. Revisala en Gift Cards.`)
                    }
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
                            professional: professionalsFullLabel(raw.professionalList, raw.professional),
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
                alert(giftCardLinkConflictMessage(error, giftCard?.code) ?? `Error al actualizar el turno: ${error.message}`)
            }
            return
        }

        // ── Create new ──
        const validPatientIds = formData.patient_ids.filter(Boolean)
        const validProfessionalIds = [...new Set(formData.professional_ids.filter(Boolean))]
        if (!validPatientIds.length || !formData.service_id || !validProfessionalIds.length || !formData.room_id) return

        const selectedService = services.find(s => s.id === formData.service_id)
        const duration = selectedService?.duration_minutes || 30

        const startDateTime = new Date(`${formData.date}T${formData.time}:00`)
        const endDateTime = new Date(startDateTime.getTime() + duration * 60000)

        // Anti-double-booking — de todas las profesionales elegidas y del consultorio
        const conflict = await findScheduleConflict(startDateTime, endDateTime, validProfessionalIds, formData.room_id)
        if (conflict) {
            alert(conflict)
            return
        }

        const { data: newAppt, error } = await supabase.from('appointments').insert([{
            patient_id: validPatientIds[0], // primer paciente como referencia legacy
            service_id: formData.service_id,
            professional_id: validProfessionalIds[0], // primera profesional como principal
            room_id: formData.room_id,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            status: formData.status,
            notes: formData.notes,
            cuponera_id: activeCuponera?.id || null,
            is_unpaid: formData.status === 'confirmado' ? formData.is_unpaid : false,
            is_gift: formData.is_gift,
            gift_card_id: formData.is_gift ? (giftCard?.id ?? null) : null,
        }]).select('id').single()

        if (!error && newAppt) {
            // Insertar todos los pacientes en la tabla de unión
            await supabase.from('appointment_patients').insert(
                validPatientIds.map(pid => ({ appointment_id: newAppt.id, patient_id: pid }))
            )

            // Ídem con las profesionales del turno
            await syncAppointmentProfessionals(newAppt.id, validProfessionalIds)

            // Obtener nombres para el log
            const { data: pData } = await supabase.from('patients').select('first_name, last_name').in('id', validPatientIds)
            const patientNames = pData?.map(p => `${p.first_name} ${p.last_name}`).join(' & ') ?? '—'
            const professionalNames = professionalsFullLabel(
                validProfessionalIds.map(id => professionals.find(p => p.id === id)).filter(Boolean),
                null,
            )

            await writeLog({
                action: 'turno_creado',
                userName: currentUserName,
                entityType: 'appointment',
                entityId: newAppt.id,
                details: {
                    label: `${currentUserName} agendó un turno a ${patientNames}`,
                    patient: patientNames,
                    service: selectedService?.name,
                    professional: professionalNames,
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
                        professional: professionalNames,
                        appointment_time: format(startDateTime, "EEEE dd 'de' MMM HH:mm", { locale: es }),
                    },
                })
            }


            // Increment cuponera sessions if created as consumed (solo cuponeras por sesiones; los pases mensuales no descuentan)
            if (activeCuponera && activeCuponera.cuponera_type !== 'months' && isConsumedStatus(formData.status)) {
                const newUsed = activeCuponera.used_sessions + 1
                const isNowActive = newUsed < activeCuponera.total_sessions

                await supabase.from('cuponeras').update({
                    used_sessions: newUsed,
                    is_active: isNowActive
                }).eq('id', activeCuponera.id)

                // Sella el número de sesión que consumió este turno nuevo
                await supabase.from('appointments').update({
                    cuponera_session_index: newUsed
                }).eq('id', newAppt.id)
            }

            // Canjear la gift card si el turno se dio de alta ya consumido
            if (formData.is_gift && giftCard && giftCard.status !== 'usada' && GIFT_CARD_CONSUMED_STATUSES.includes(formData.status)) {
                const redeemed = await redeemGiftCard(giftCard, formData.service_id || null)
                if (redeemed === 'ya_canjeada') {
                    alert(`El turno se guardó, pero la gift card ${giftCard.code} ya estaba canjeada (por otro turno, o a mano desde Gift Cards), así que no se volvió a canjear.`)
                } else if (redeemed === 'error') {
                    alert(`El turno se guardó, pero no se pudo marcar como usada la gift card ${giftCard.code}: sigue vigente. Revisala en Gift Cards.`)
                }
            }

            setIsModalOpen(false)
            fetchData()
        } else {
            console.error('Error saving appointment:', error)
            alert(giftCardLinkConflictMessage(error, giftCard?.code) ?? `Error al guardar el turno: ${error?.message ?? 'probá de nuevo.'}`)
        }
    }

    // ── Delete appointment ──
    const handleDeleteAppointment = async () => {
        if (!selectedEvent) return
        if (!window.confirm('¿Eliminar este turno? Esta acción no se puede deshacer.')) return

        const { raw } = selectedEvent
        const patientNames = raw.patientList?.map((p: any) => `${p.first_name} ${p.last_name}`).join(' & ') ?? '—'
        const appointmentTime = format(selectedEvent.start, "EEEE dd 'de' MMM HH:mm", { locale: es })

        // Borrar pacientes y profesionales de las tablas de unión primero
        await supabase.from('appointment_patients').delete().eq('appointment_id', selectedEvent.id)
        await supabase.from('appointment_professionals').delete().eq('appointment_id', selectedEvent.id)
        const { error } = await supabase.from('appointments').delete().eq('id', selectedEvent.id)

        if (!error) {
            // Restore cuponera session if deleted while consumed (solo por sesiones)
            if (raw.cuponera && raw.cuponera.cuponera_type !== 'months' && isConsumedStatus(selectedEvent.status)) {
                const newUsed = raw.cuponera.used_sessions - 1
                await supabase.from('cuponeras').update({
                    used_sessions: newUsed,
                    is_active: true
                }).eq('id', raw.cuponera.id)

                // Reacomodar índices: los canjes con sesión posterior a la borrada bajan 1
                // (evita huecos y mantiene el número más alto = used_sessions). Turnos y canjes
                // manuales de historia clínica comparten la secuencia, así que se tocan los dos.
                const deletedIdx = raw.app?.cuponera_session_index
                if (deletedIdx != null) {
                    await shiftCuponeraSessionIndexes(raw.cuponera.id, deletedIdx)
                }
            }

            // Liberar la gift card solo si este turno era el que la había canjeado: si estaba
            // pendiente, el canje lo hizo alguien a mano desde Gift Cards y no hay que deshacerlo.
            if (raw.giftCard && raw.giftCard.status === 'usada' && GIFT_CARD_CONSUMED_STATUSES.includes(selectedEvent.status)) {
                const released = await releaseGiftCard(raw.giftCard.id)
                if (!released) alert(`El turno se eliminó, pero no se pudo liberar la gift card ${raw.giftCard.code}: sigue figurando como usada. Revisala en Gift Cards.`)
            }

            await writeLog({
                action: 'turno_eliminado',
                userName: currentUserName,
                entityType: 'appointment',
                entityId: selectedEvent.id,
                details: {
                    label: `${currentUserName} eliminó el turno de ${patientNames}`,
                    patient: patientNames,
                    service: raw.service?.name,
                    professional: professionalsFullLabel(raw.professionalList, raw.professional),
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
        <div className="flex flex-col gap-4 animate-in fade-in duration-500 h-[calc(100dvh-8rem)] md:h-full">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0 gap-2">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Agenda</h1>
                    <p className="mt-1 text-xs md:text-sm text-muted-foreground hidden sm:block">
                        Gestión de turnos por consultorio en tiempo real.
                    </p>
                </div>
                <button
                    onClick={() => openNewModal()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 md:px-4 md:py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors cursor-pointer whitespace-nowrap"
                >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Nuevo Turno</span>
                    <span className="sm:hidden">Nuevo</span>
                </button>
            </div>

            {/* Calendar */}
            <div ref={calendarRef} className="flex-1 bg-card rounded-xl shadow-sm border border-border overflow-hidden min-h-[500px] md:min-h-0 flex flex-col">
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="min-w-[500px] md:min-w-0 h-full">
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
                </div>
            </div>

            {/* ── Modal ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 md:p-6">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 max-h-[100dvh] md:max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
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

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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
                                            {selectedEvent.raw.professional && ` — Dr/a. ${professionalsFullLabel(selectedEvent.raw.professionalList, selectedEvent.raw.professional)}`}
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
                                                    {activeCuponera.cuponera_type === 'months'
                                                        ? (() => {
                                                            const mp = monthsProgress(activeCuponera.start_date, activeCuponera.total_months)
                                                            return `Pase mensual · Mes ${mp.transcurridos} de ${activeCuponera.total_months}${mp.vence ? ` · vence ${mp.vence.toLocaleDateString('es-UY')}` : ''}`
                                                        })()
                                                        : (() => {
                                                            const turnoN = selectedEvent?.raw?.cuponeraSessionNumber
                                                            const proj = selectedEvent?.raw?.cuponeraSessionProjected
                                                            const base = `${activeCuponera.used_sessions} de ${activeCuponera.total_sessions} usadas`
                                                            return turnoN
                                                                ? `Este turno: sesión ${turnoN}${proj ? ' (a confirmar)' : ''} · ${base} en total`
                                                                : `Progreso: ${base}.`
                                                        })()}
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
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-sm font-medium text-foreground">
                                                    Profesional{formData.professional_ids.length > 1 ? 'es' : ''}
                                                </label>
                                                {formData.professional_ids.length < MAX_PROFESSIONALS && (
                                                    <button
                                                        type="button"
                                                        onClick={addProfessionalSlot}
                                                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer whitespace-nowrap"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5" /> Agregar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                {formData.professional_ids.map((prid, idx) => (
                                                    <div key={idx} className="flex gap-1 items-center">
                                                        <select
                                                            className="flex-1 min-w-0 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                            value={prid}
                                                            onChange={e => updateProfessionalSlot(idx, e.target.value)}
                                                        >
                                                            <option value="">Sin asignar</option>
                                                            {availableProfessionals(prid).map(p => (
                                                                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                                            ))}
                                                        </select>
                                                        {formData.professional_ids.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeProfessionalSlot(idx)}
                                                                className="p-1 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {formData.professional_ids.length > 1 && (
                                                <p className="text-xs text-muted-foreground">La primera es la principal.</p>
                                            )}
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
                                        <label className="text-sm font-medium text-foreground">Duración (min)</label>
                                        <input
                                            type="number"
                                            min="5"
                                            step="5"
                                            value={formData.duration}
                                            onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        />
                                        <p className="text-xs text-muted-foreground">Podés acortar el turno (ej. de 50 a 20 o 30 min) en membresías combinadas.</p>
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
                                            {/* Sin esta opción, un turno viejo 'completado' mostraba otro estado en el select */}
                                            {selectedEvent?.status === 'completado' && (
                                                <option value="completado">Completado (histórico)</option>
                                            )}
                                        </select>
                                    </div>
                                    
                                    {/* Con cuponera activa el bloque se oculta, salvo que el turno YA esté sin cargo:
                                        si no, una tarjeta vinculada quedaría imposible de desvincular (y el índice
                                        único la dejaría inutilizable para cualquier otro turno). */}
                                    {(!activeCuponera || formData.is_gift) && (
                                        <GiftCardField
                                            idSuffix="edit"
                                            isGift={formData.is_gift}
                                            onToggleGift={handleToggleGift}
                                            code={giftCardCode}
                                            onCodeChange={setGiftCardCode}
                                            card={giftCard}
                                            message={giftCardMsg}
                                            searching={giftCardSearching}
                                            onSearch={handleSearchGiftCard}
                                            onUnlink={handleUnlinkGiftCard}
                                            serviceName={serviceName}
                                        />
                                    )}

                                    {formData.status === 'confirmado' && !activeCuponera && !formData.is_gift && (
                                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                                            <input
                                                type="checkbox"
                                                id="is_unpaid_edit"
                                                checked={formData.is_unpaid}
                                                onChange={e => setFormData({ ...formData, is_unpaid: e.target.checked })}
                                                className="w-4 h-4 rounded border-red-500/50 text-red-600 focus:ring-red-500/20 accent-red-500"
                                            />
                                            <label htmlFor="is_unpaid_edit" className="text-sm font-medium text-red-600 dark:text-red-500 cursor-pointer select-none">
                                                El paciente no pagó esta sesión (Generar Deuda)
                                            </label>
                                        </div>
                                    )}
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

                                    {/* Profesionales + Consultorio */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-sm font-medium text-foreground">
                                                    Profesional{formData.professional_ids.length > 1 ? 'es' : ''}
                                                </label>
                                                {formData.professional_ids.length < MAX_PROFESSIONALS && (
                                                    <button
                                                        type="button"
                                                        onClick={addProfessionalSlot}
                                                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 cursor-pointer whitespace-nowrap"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5" /> Agregar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                {formData.professional_ids.map((prid, idx) => (
                                                    <div key={idx} className="flex gap-1 items-center">
                                                        <select
                                                            required={idx === 0}
                                                            className="flex-1 min-w-0 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                            value={prid}
                                                            onChange={e => updateProfessionalSlot(idx, e.target.value)}
                                                        >
                                                            <option value="" disabled>Elegir...</option>
                                                            {availableProfessionals(prid).map(p => (
                                                                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                                                            ))}
                                                        </select>
                                                        {formData.professional_ids.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeProfessionalSlot(idx)}
                                                                className="p-1 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {formData.professional_ids.length > 1 && (
                                                <p className="text-xs text-muted-foreground">La primera es la principal.</p>
                                            )}
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
                                                    {activeCuponera.cuponera_type === 'months'
                                                        ? (() => {
                                                            const mp = monthsProgress(activeCuponera.start_date, activeCuponera.total_months)
                                                            return `Pase mensual · Mes ${mp.transcurridos} de ${activeCuponera.total_months}${mp.vence ? ` · vence ${mp.vence.toLocaleDateString('es-UY')}` : ''}`
                                                        })()
                                                        : (() => {
                                                            const turnoN = selectedEvent?.raw?.cuponeraSessionNumber
                                                            const proj = selectedEvent?.raw?.cuponeraSessionProjected
                                                            const base = `${activeCuponera.used_sessions} de ${activeCuponera.total_sessions} usadas`
                                                            return turnoN
                                                                ? `Este turno: sesión ${turnoN}${proj ? ' (a confirmar)' : ''} · ${base} en total`
                                                                : `Progreso: ${base}.`
                                                        })()}
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

                                    {!activeCuponera && (
                                        <GiftCardField
                                            idSuffix="new"
                                            isGift={formData.is_gift}
                                            onToggleGift={handleToggleGift}
                                            code={giftCardCode}
                                            onCodeChange={setGiftCardCode}
                                            card={giftCard}
                                            message={giftCardMsg}
                                            searching={giftCardSearching}
                                            onSearch={handleSearchGiftCard}
                                            onUnlink={handleUnlinkGiftCard}
                                            serviceName={serviceName}
                                        />
                                    )}

                                    {formData.status === 'confirmado' && !activeCuponera && !formData.is_gift && (
                                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                                            <input
                                                type="checkbox"
                                                id="is_unpaid_new"
                                                checked={formData.is_unpaid}
                                                onChange={e => setFormData({ ...formData, is_unpaid: e.target.checked })}
                                                className="w-4 h-4 rounded border-red-500/50 text-red-600 focus:ring-red-500/20 accent-red-500"
                                            />
                                            <label htmlFor="is_unpaid_new" className="text-sm font-medium text-red-600 dark:text-red-500 cursor-pointer select-none">
                                                El paciente no pagó esta sesión (Generar Deuda)
                                            </label>
                                        </div>
                                    )}
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
                                <p className="text-xs text-muted-foreground">
                                    Si el cliente no tomó la sesión completa, dejá asentado acá qué tratamiento específico se realizó.
                                </p>
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
