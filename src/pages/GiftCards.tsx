import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Gift, Search, CheckCircle2, X, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { cn, formatMoney } from '../lib/utils'
import { CurrencyToggle } from '../components/CuponeraFields'

// ─── Patient Search Input ───────────────────────────────────────────────────────
function PatientSearchInput({
    patients,
    value,
    onChange,
}: {
    patients: any[]
    value: string
    onChange: (id: string) => void
}) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const selected = patients.find(p => p.id === value)

    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : ""
    const filtered = query.trim()
        ? patients.filter(p => {
            const haystack = normalize(`${p.first_name} ${p.last_name} ${p.document_id || ''}`)
            return normalize(query).split(' ').filter(Boolean).every(t => haystack.includes(t))
        })
        : patients

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} className="relative">
            {selected ? (
                <div className="flex items-center justify-between bg-background border border-input rounded-md px-3 py-2 text-sm">
                    <span className="text-foreground">
                        <span className="font-medium">{selected.last_name}, {selected.first_name}</span>
                        {selected.document_id && <span className="text-muted-foreground ml-2">— Cédula {selected.document_id}</span>}
                    </span>
                    <button type="button" onClick={() => { onChange(''); setQuery('') }} className="ml-2 text-muted-foreground hover:text-foreground cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <input
                    type="text"
                    placeholder="Buscar por nombre o cédula..."
                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                />
            )}
            {open && !selected && (
                <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                    ) : (
                        filtered.slice(0, 30).map(p => (
                            <button key={p.id} type="button" onClick={() => { onChange(p.id); setQuery(''); setOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer">
                                <span className="font-medium text-foreground">{p.last_name}, {p.first_name}</span>
                                {p.document_id && <span className="text-muted-foreground ml-2">— Cédula {p.document_id}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
// ────────────────────────────────────────────────────────────────────────────────

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return `MAG-${s}`
}

const initialForm = {
    patient_id: '',
    recipient_name: '',
    service_id: '',
    amount: '',
    currency: 'UYU' as 'UYU' | 'USD',
    notes: '',
    code: '',
}

export function GiftCards() {
    const [cards, setCards] = useState<any[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'todas' | 'vigente' | 'usada'>('todas')

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({ ...initialForm })

    // Modal de canje
    const [redeemCard, setRedeemCard] = useState<any | null>(null)
    const [redeemServiceId, setRedeemServiceId] = useState('')

    const serviceName = (id: string | null) => services.find(s => s.id === id)?.name || null

    const fetchData = async () => {
        setLoading(true)
        const { data: gData } = await supabase
            .from('gift_cards')
            .select('*, patients(id, first_name, last_name, document_id)')
            .order('created_at', { ascending: false })
        if (gData) setCards(gData)

        const { data: pData } = await supabase.from('patients').select('id, first_name, last_name, document_id').order('last_name')
        if (pData) setPatients(pData)
        const { data: sData } = await supabase.from('services').select('id, name').eq('is_active', true).order('name')
        if (sData) setServices(sData)
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [])

    const openNew = () => {
        setEditingId(null)
        setFormData({ ...initialForm, code: genCode() })
        setIsModalOpen(true)
    }

    const closeModal = () => {
        setIsModalOpen(false)
        setEditingId(null)
        setFormData({ ...initialForm })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.code.trim()) return

        const payload: Record<string, any> = {
            code: formData.code.trim(),
            patient_id: formData.patient_id || null,
            recipient_name: formData.recipient_name.trim() || null,
            service_id: formData.service_id || null,
            amount: formData.amount ? parseFloat(formData.amount) : null,
            currency: formData.currency,
            notes: formData.notes.trim() || null,
        }

        let error
        if (editingId) {
            const { error: e2 } = await supabase.from('gift_cards').update(payload).eq('id', editingId)
            error = e2
        } else {
            const { error: e2 } = await supabase.from('gift_cards').insert([{ ...payload, status: 'vigente' }])
            error = e2
        }

        if (!error) {
            closeModal()
            fetchData()
        } else {
            console.error('Error guardando gift card:', error)
            alert(error.message?.includes('duplicate') ? 'Ese código ya existe, generá otro.' : 'Error al guardar la gift card.')
        }
    }

    const handleEdit = (c: any) => {
        setEditingId(c.id)
        setFormData({
            patient_id: c.patient_id || '',
            recipient_name: c.recipient_name || '',
            service_id: c.service_id || '',
            amount: c.amount?.toString() || '',
            currency: c.currency === 'USD' ? 'USD' : 'UYU',
            notes: c.notes || '',
            code: c.code || '',
        })
        setIsModalOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Eliminar esta gift card? Esta acción no se puede deshacer.')) return
        const { error } = await supabase.from('gift_cards').delete().eq('id', id)
        if (!error) fetchData()
        else alert('Error al eliminar.')
    }

    const openRedeem = (c: any) => {
        setRedeemCard(c)
        setRedeemServiceId(c.service_id || '')
    }

    const confirmRedeem = async () => {
        if (!redeemCard) return
        const { error } = await supabase.from('gift_cards').update({
            status: 'usada',
            redeemed_at: new Date().toISOString().split('T')[0],
            redeemed_service_id: redeemServiceId || redeemCard.service_id || null,
        }).eq('id', redeemCard.id)
        if (!error) { setRedeemCard(null); fetchData() }
        else alert('Error al marcar como usada.')
    }

    const reactivar = async (c: any) => {
        if (!window.confirm('¿Reactivar esta gift card (volver a Vigente)?')) return
        const { error } = await supabase.from('gift_cards').update({ status: 'vigente', redeemed_at: null, redeemed_service_id: null }).eq('id', c.id)
        if (!error) fetchData()
        else alert('Error al reactivar.')
    }

    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : ""
    const filtered = cards.filter(c => {
        if (statusFilter !== 'todas' && c.status !== statusFilter) return false
        if (!searchQuery.trim()) return true
        const patient = Array.isArray(c.patients) ? c.patients[0] : c.patients
        const haystack = normalize(`${c.code} ${patient?.first_name || ''} ${patient?.last_name || ''} ${patient?.document_id || ''} ${c.recipient_name || ''}`)
        return normalize(searchQuery).split(' ').filter(Boolean).every(t => haystack.includes(t))
    })

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Gift className="h-8 w-8 text-primary" />
                        Gift Cards
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Tarjetas de regalo: se cargan con un monto y un tratamiento, y se marcan como usadas al canjearse.
                    </p>
                </div>
                <button onClick={openNew} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors cursor-pointer">
                    <Plus className="mr-2 h-4 w-4" />
                    Cargar Gift Card
                </button>
            </div>

            <div className="flex-1 bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col">
                {/* Search + filtro */}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar por código, nombre o cédula..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="flex bg-muted rounded-lg p-1 gap-1">
                        {(['todas', 'vigente', 'usada'] as const).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)}
                                className={cn("px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all cursor-pointer",
                                    statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto -mx-4 md:mx-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                            <tr>
                                <th className="px-6 py-3 font-medium">Código</th>
                                <th className="px-6 py-3 font-medium">Paciente</th>
                                <th className="px-6 py-3 font-medium">Tratamiento</th>
                                <th className="px-6 py-3 font-medium">Monto</th>
                                <th className="px-6 py-3 font-medium text-center">Estado</th>
                                <th className="px-6 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.map((c) => {
                                const patient = Array.isArray(c.patients) ? c.patients[0] : c.patients
                                const usada = c.status === 'usada'
                                return (
                                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-mono font-medium text-foreground">{c.code}</span>
                                            <div className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy", { locale: es })}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {patient ? (
                                                <span className="text-foreground">{patient.first_name} {patient.last_name}</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">Sin asignar</span>
                                            )}
                                            {c.recipient_name && (
                                                <div className="text-xs text-muted-foreground">para: {c.recipient_name}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-primary font-medium">{serviceName(c.service_id) || '—'}</span>
                                            {usada && c.redeemed_service_id && c.redeemed_service_id !== c.service_id && (
                                                <div className="text-xs text-amber-600 dark:text-amber-400">canjeó: {serviceName(c.redeemed_service_id)}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-foreground">{formatMoney(c.amount, c.currency)}</td>
                                        <td className="px-6 py-4 text-center">
                                            {usada ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">Usada</span>
                                                    {c.redeemed_at && <span className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(c.redeemed_at + 'T12:00:00'), "dd/MM/yyyy", { locale: es })}</span>}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">Vigente</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!usada ? (
                                                    <button onClick={() => openRedeem(c)} className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 cursor-pointer">
                                                        Marcar usada
                                                    </button>
                                                ) : (
                                                    <button onClick={() => reactivar(c)} title="Reactivar" className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => handleEdit(c)} title="Editar" className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(c.id)} title="Eliminar" className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                        <Gift className="mx-auto h-12 w-12 opacity-20 mb-3" />
                                        <p>No hay gift cards con esos criterios.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal cargar/editar */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 max-h-[100dvh] md:max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Gift className="w-5 h-5 text-primary" />
                                {editingId ? 'Editar Gift Card' : 'Cargar Gift Card'}
                            </h2>
                            <button onClick={closeModal} className="text-muted-foreground hover:text-foreground cursor-pointer p-1">&times;</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Código</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        required
                                        value={formData.code}
                                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                                        className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm font-mono text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                    <button type="button" onClick={() => setFormData({ ...formData, code: genCode() })} className="px-3 py-2 text-sm font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 cursor-pointer">
                                        Generar
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Paciente que la compra <span className="text-xs text-muted-foreground font-normal">(quien regala, opcional)</span>
                                </label>
                                <PatientSearchInput patients={patients} value={formData.patient_id} onChange={(id) => setFormData(f => ({ ...f, patient_id: id }))} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Quién la recibe <span className="text-xs text-muted-foreground font-normal">(nombre, opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="Nombre de la persona que recibe el regalo"
                                    value={formData.recipient_name}
                                    onChange={e => setFormData({ ...formData, recipient_name: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">Suele ser alguien que todavía no es paciente.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Tratamiento que regala <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                                </label>
                                <select
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={formData.service_id}
                                    onChange={e => setFormData({ ...formData, service_id: e.target.value })}
                                >
                                    <option value="">Sin tratamiento específico</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Moneda</label>
                                <CurrencyToggle value={formData.currency} onChange={(c) => setFormData({ ...formData, currency: c })} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Monto</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{formData.currency === 'USD' ? 'US$' : '$'}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.amount}
                                        onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Nota <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Ej. quién la regala, ocasión, etc."
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-y"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">Cancelar</button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 flex items-center gap-2 cursor-pointer">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {editingId ? 'Guardar' : 'Cargar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal canje */}
            {redeemCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Marcar como usada</h2>
                            <button onClick={() => setRedeemCard(null)} className="text-muted-foreground hover:text-foreground cursor-pointer p-1">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Gift card <span className="font-mono font-medium text-foreground">{redeemCard.code}</span>. Se va a guardar la fecha de hoy como fecha de uso.
                            </p>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Tratamiento realizado</label>
                                <select
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={redeemServiceId}
                                    onChange={e => setRedeemServiceId(e.target.value)}
                                >
                                    <option value="">Sin especificar</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <p className="text-xs text-muted-foreground">Podés cambiarlo si la clienta usó otro tratamiento (ej. alergia, preferencia).</p>
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <button onClick={() => setRedeemCard(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">Cancelar</button>
                                <button onClick={confirmRedeem} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 flex items-center gap-2 cursor-pointer">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Confirmar canje
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
