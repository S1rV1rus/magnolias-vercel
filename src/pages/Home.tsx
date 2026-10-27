import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, CalendarDays, CalendarClock, Clock, Package, Pin, RefreshCw, Ticket, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn, localDateStr, localDayRangeIso } from '../lib/utils'
import { STATUS_COLOR, STATUS_LABEL } from '../lib/appointments'
import { lowStock, passesExpiringSoon, summarizeDay, toDayAppt, type DayAppt, type DayApptRow } from '../lib/dashboard'

// Pantalla de inicio: qué pasa hoy en la clínica. Cada tarjeta depende de un solo pedido, así que
// si uno falla las demás se siguen viendo.

interface PassRow {
    id: string
    patient_id: string
    cuponera_type: string
    start_date: string | null
    total_months: number | null
    is_active: boolean | null
    patients: { first_name: string; last_name: string } | null
    services: { name: string } | null
}
interface StockRow { id: string; name: string; quantity: number; min_quantity: number; unit: string; is_active: boolean }
interface NoteRow { id: string; title: string; color: string }

interface Section<T> { data: T[]; error: boolean }
const empty = <T,>(): Section<T> => ({ data: [], error: false })

const NOTE_DOT: Record<string, string> = {
    yellow: 'bg-yellow-400', red: 'bg-red-500', green: 'bg-green-500',
    blue: 'bg-blue-500', purple: 'bg-violet-500', orange: 'bg-orange-500',
}

const hhmm = (iso: string) => format(new Date(iso), 'HH:mm')

interface TodayData {
    appts: Section<DayAppt>
    passes: Section<PassRow & { vence: Date }>
    stock: Section<StockRow>
    notes: Section<NoteRow>
}

// Los cuatro pedidos a la vez: la pantalla tarda lo que el más lento, no la suma.
async function fetchToday(): Promise<TodayData> {
    const hoy = localDateStr()
    const { startIso, endIso } = localDayRangeIso(hoy, hoy)

    const [a, p, s, n] = await Promise.all([
        supabase.from('appointments')
            .select(`id, start_time, end_time, status, is_unpaid, rooms(name), services(name),
                     appointment_patients(patients(first_name, last_name))`)
            .gte('start_time', startIso).lt('start_time', endIso)
            .order('start_time'),
        supabase.from('cuponeras')
            .select('id, patient_id, cuponera_type, start_date, total_months, is_active, patients(first_name, last_name), services(name)')
            .eq('cuponera_type', 'months').eq('is_active', true),
        supabase.from('stock_items').select('id, name, quantity, min_quantity, unit, is_active'),
        supabase.from('blog_notes').select('id, title, color').eq('is_pinned', true).order('created_at', { ascending: false }),
    ])

    if (a.error) console.error('Error al cargar los turnos de hoy:', a.error)
    if (p.error) console.error('Error al cargar los pases:', p.error)
    if (s.error) console.error('Error al cargar el stock:', s.error)
    if (n.error) console.error('Error al cargar las notas:', n.error)

    return {
        appts: { data: ((a.data ?? []) as DayApptRow[]).map(toDayAppt), error: !!a.error },
        passes: { data: passesExpiringSoon((p.data ?? []) as unknown as PassRow[], 7), error: !!p.error },
        stock: { data: lowStock((s.data ?? []) as StockRow[]), error: !!s.error },
        notes: { data: (n.data ?? []) as NoteRow[], error: !!n.error },
    }
}

export function Home() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<TodayData>(() => ({ appts: empty(), passes: empty(), stock: empty(), notes: empty() }))
    const [reloadKey, setReloadKey] = useState(0)
    // "Ahora" se actualiza cada minuto para que el turno en curso y el próximo no queden viejos
    const [now, setNow] = useState(() => new Date())
    const { appts, passes, stock, notes } = data

    useEffect(() => {
        let vigente = true // si se sale de la pantalla antes de que llegue la respuesta, se descarta
        fetchToday().then(result => {
            if (!vigente) return
            setData(result)
            setNow(new Date())
            setLoading(false)
        })
        return () => { vigente = false }
    }, [reloadKey])

    const refresh = () => {
        setLoading(true)
        setReloadKey(k => k + 1)
    }

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000)
        return () => clearInterval(t)
    }, [])

    const day = summarizeDay(appts.data, now)
    const cancelados = (day.porEstado.cancelado ?? 0) + (day.porEstado.cancelado_tarde ?? 0)
    const enCursoIds = new Set(day.enCurso.map(a => a.id))

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Hoy</h1>
                    <p className="text-muted-foreground mt-1 first-letter:uppercase">
                        {format(now, "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Actualizar
                    </button>
                    <Link
                        to="/appointments"
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <CalendarDays className="w-4 h-4" />
                        Ir a la agenda
                    </Link>
                </div>
            </div>

            {/* Números del día */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Turnos" value={day.total} hint="sin contar cancelados" />
                <Kpi label="Confirmados" value={day.porEstado.confirmado ?? 0} color={STATUS_COLOR.confirmado} />
                <Kpi label="Sin confirmar" value={day.sinConfirmar.length} color={STATUS_COLOR.pendiente} />
                <Kpi label="Cancelados" value={cancelados} color={STATUS_COLOR.cancelado} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Turnos del día */}
                <div className="xl:col-span-2 bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
                    <div className="border-b border-border/50 p-4 bg-muted/20 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Turnos del día</h2>
                        </div>
                        {day.proximo && (
                            <span className="text-sm text-muted-foreground">
                                Próximo: <span className="font-medium text-foreground">{hhmm(day.proximo.start_time)}</span>
                            </span>
                        )}
                    </div>
                    {appts.error ? (
                        <ErrorNote text="No se pudieron cargar los turnos de hoy." />
                    ) : loading && appts.data.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
                    ) : day.lista.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">No hay turnos para hoy.</p>
                    ) : (
                        <ul className="divide-y divide-border/50">
                            {day.lista.map(a => {
                                const cancelado = a.status === 'cancelado' || a.status === 'cancelado_tarde'
                                const esProximo = day.proximo?.id === a.id
                                return (
                                    <li
                                        key={a.id}
                                        className={cn(
                                            'flex items-start sm:items-center gap-3 sm:gap-4 px-4 py-3',
                                            enCursoIds.has(a.id) && 'bg-primary/5',
                                            cancelado && 'opacity-50'
                                        )}
                                    >
                                        <div className="w-24 shrink-0 text-sm tabular-nums">
                                            <span className="font-semibold text-foreground">{hhmm(a.start_time)}</span>
                                            <span className="text-muted-foreground"> – {hhmm(a.end_time)}</span>
                                        </div>
                                        {/* En celular las etiquetas bajan debajo del nombre para no taparlo */}
                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-sm font-medium text-foreground truncate', cancelado && 'line-through')}>
                                                    {a.patients.join(' & ') || 'Sin paciente'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {[a.service, a.room].filter(Boolean).join(' · ') || '—'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:shrink-0">
                                                {enCursoIds.has(a.id) && <Badge className="bg-primary/10 text-primary">En curso</Badge>}
                                                {esProximo && <Badge className="bg-muted text-foreground">Próximo</Badge>}
                                                {a.is_unpaid && !cancelado && <Badge className="bg-red-500/10 text-red-600 dark:text-red-400">Debe</Badge>}
                                                <span
                                                    className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                                                    style={{ backgroundColor: STATUS_COLOR[a.status] ?? '#94a3b8' }}
                                                >
                                                    {STATUS_LABEL[a.status] ?? a.status}
                                                </span>
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                {/* Alertas */}
                <div className="flex flex-col gap-4">
                    <AlertCard
                        icon={<Wallet className="w-4 h-4" />}
                        title="Impagos de hoy"
                        error={appts.error}
                        emptyText="Nadie quedó debiendo hoy."
                        items={day.impagos.map(a => ({
                            key: a.id,
                            main: a.patients.join(' & ') || 'Sin paciente',
                            sub: `${hhmm(a.start_time)} · ${a.service ?? '—'}`,
                        }))}
                    />
                    <AlertCard
                        icon={<Ticket className="w-4 h-4" />}
                        title="Pases que vencen esta semana"
                        error={passes.error}
                        emptyText="Ningún pase mensual vence en los próximos 7 días."
                        items={passes.data.map(c => ({
                            key: c.id,
                            main: c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : 'Paciente',
                            sub: `${c.services?.name ?? 'Pase mensual'} · vence ${format(c.vence, "EEE d/MM", { locale: es })}`,
                            to: `/patients/${c.patient_id}`,
                        }))}
                    />
                    <AlertCard
                        icon={<Package className="w-4 h-4" />}
                        title="Stock bajo"
                        error={stock.error}
                        emptyText="Todos los insumos están por encima del mínimo."
                        items={stock.data.map(i => ({
                            key: i.id,
                            main: i.name,
                            sub: `Quedan ${Number(i.quantity)} ${i.unit} (mínimo ${Number(i.min_quantity)})`,
                            to: '/stock',
                        }))}
                    />
                    <AlertCard
                        icon={<Pin className="w-4 h-4" />}
                        title="Notas fijadas"
                        error={notes.error}
                        emptyText="No hay notas fijadas en el blog."
                        items={notes.data.map(n => ({
                            key: n.id,
                            main: n.title,
                            dot: NOTE_DOT[n.color] ?? NOTE_DOT.yellow,
                            to: '/blog',
                        }))}
                    />
                    <Link
                        to="/horarios"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <CalendarClock className="w-4 h-4" />
                        Horarios de las profesionales
                    </Link>
                </div>
            </div>
        </div>
    )
}

function Kpi({ label, value, color, hint }: { label: string; value: number; color?: string; hint?: string }) {
    return (
        <div className="bg-card border border-border/60 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
                {label}
            </div>
            <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
    )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
    return <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', className)}>{children}</span>
}

function ErrorNote({ text }: { text: string }) {
    return (
        <p className="flex items-center gap-2 p-4 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {text} Probá con "Actualizar".
        </p>
    )
}

interface AlertItem { key: string; main: string; sub?: string; dot?: string; to?: string }

function AlertCard({ icon, title, items, emptyText, error }: {
    icon: React.ReactNode
    title: string
    items: AlertItem[]
    emptyText: string
    error: boolean
}) {
    return (
        <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
                <span className="text-primary">{icon}</span>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {items.length > 0 && (
                    <span className="ml-auto text-xs font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">{items.length}</span>
                )}
            </div>
            {error ? (
                <ErrorNote text="No se pudo cargar." />
            ) : items.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
                <ul className="divide-y divide-border/50">
                    {items.map(it => {
                        const content = (
                            <div className="flex items-center gap-2 px-4 py-2.5">
                                {it.dot && <span className={cn('w-2 h-2 rounded-full shrink-0', it.dot)} />}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{it.main}</p>
                                    {it.sub && <p className="text-xs text-muted-foreground truncate">{it.sub}</p>}
                                </div>
                            </div>
                        )
                        return (
                            <li key={it.key}>
                                {it.to ? <Link to={it.to} className="block hover:bg-muted/40 transition-colors">{content}</Link> : content}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
