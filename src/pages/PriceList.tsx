import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, X, Package, Search } from 'lucide-react'
import { cn } from '../lib/utils'

interface Service {
    id: string
    name: string
    is_active: boolean
}

interface PackPrice {
    id: string
    created_at: string
    service_id: string
    name: string
    sessions: number
    price: number
    notes: string | null
    is_active: boolean
    services?: Service
}

const emptyForm = {
    service_id: '',
    name: '',
    sessions: 1,
    price: 0,
    notes: '',
}

export function PriceList() {
    const [packs, setPacks] = useState<PackPrice[]>([])
    const [services, setServices] = useState<Service[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [editingPack, setEditingPack] = useState<PackPrice | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    async function fetchData() {
        setLoading(true)
        const [{ data: packsData }, { data: servicesData }] = await Promise.all([
            supabase
                .from('pack_prices')
                .select('*, services(id, name, is_active)')
                .order('created_at', { ascending: false }),
            supabase
                .from('services')
                .select('id, name, is_active')
                .eq('is_active', true)
                .order('name'),
        ])
        if (packsData) setPacks(packsData)
        if (servicesData) setServices(servicesData)
        setLoading(false)
    }

    useEffect(() => { void fetchData() }, [])

    function openCreate() {
        setEditingPack(null)
        setForm(emptyForm)
        setModalOpen(true)
    }

    function openEdit(pack: PackPrice) {
        setEditingPack(pack)
        setForm({
            service_id: pack.service_id,
            name: pack.name,
            sessions: pack.sessions,
            price: pack.price,
            notes: pack.notes || '',
        })
        setModalOpen(true)
    }

    function closeModal() {
        setModalOpen(false)
        setEditingPack(null)
        setForm(emptyForm)
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)

        const payload = {
            service_id: form.service_id,
            name: form.name.trim(),
            sessions: form.sessions,
            price: form.price,
            notes: form.notes.trim() || null,
        }

        if (editingPack) {
            await supabase.from('pack_prices').update(payload).eq('id', editingPack.id)
        } else {
            await supabase.from('pack_prices').insert(payload)
        }

        setSaving(false)
        closeModal()
        void fetchData()
    }

    async function handleDelete(id: string) {
        await supabase.from('pack_prices').delete().eq('id', id)
        setConfirmDelete(null)
        void fetchData()
    }

    async function handleToggleActive(pack: PackPrice) {
        await supabase.from('pack_prices').update({ is_active: !pack.is_active }).eq('id', pack.id)
        void fetchData()
    }

    const filtered = packs.filter(p => {
        const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""
        const searchTerms = normalize(search).split(' ').filter(Boolean)
        const haystack = normalize(`${p.name} ${p.services?.name || ''}`)
        return searchTerms.every(term => haystack.includes(term))
    })

    // Group by service
    const grouped = filtered.reduce<Record<string, PackPrice[]>>((acc, p) => {
        const key = p.services?.name || 'Sin servicio'
        if (!acc[key]) acc[key] = []
        acc[key].push(p)
        return acc
    }, {})

    const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Precios por Packs</h1>
                    <p className="text-muted-foreground mt-1">Guía de referencia interna de precios para paquetes de sesiones.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                >
                    <Plus className="w-4 h-4" /> Nuevo Pack
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o servicio..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                />
            </div>

            {/* Content */}
            {loading ? (
                <div className="p-12 text-center text-muted-foreground text-sm">Cargando precios...</div>
            ) : packs.length === 0 ? (
                <div className="p-12 border border-dashed border-border/50 rounded-xl text-center text-muted-foreground bg-muted/10">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No hay packs cargados todavía.</p>
                    <p className="text-xs mt-1">Hacé clic en "Nuevo Pack" para crear el primero.</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                    No se encontraron resultados para "{search}".
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedGroups.map(([serviceName, items]) => (
                        <div key={serviceName}>
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                <div className="h-px flex-1 bg-border/50" />
                                {serviceName}
                                <div className="h-px flex-1 bg-border/50" />
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {items.map(pack => (
                                    <div
                                        key={pack.id}
                                        className={cn(
                                            "group bg-card border rounded-xl p-4 transition-all hover:shadow-md hover:border-primary/30",
                                            pack.is_active ? "border-border/50" : "border-border/30 opacity-60"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-foreground truncate">{pack.name}</h3>
                                                <p className="text-xs text-muted-foreground mt-0.5">{pack.sessions} sesiones</p>
                                            </div>
                                            <span className="text-lg font-bold text-primary whitespace-nowrap">
                                                ${pack.price.toLocaleString('es-AR')}
                                            </span>
                                        </div>

                                        {pack.notes && (
                                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{pack.notes}</p>
                                        )}

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                ${(pack.price / pack.sessions).toFixed(0)}/sesión
                                            </span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleToggleActive(pack)}
                                                    className={cn(
                                                        "text-[10px] px-2 py-1 rounded-md border transition-colors cursor-pointer",
                                                        pack.is_active
                                                            ? "border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                                                            : "border-green-500/30 text-green-500 hover:bg-green-500/10"
                                                    )}
                                                >
                                                    {pack.is_active ? 'Desactivar' : 'Activar'}
                                                </button>
                                                <button
                                                    onClick={() => openEdit(pack)}
                                                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                {confirmDelete === pack.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleDelete(pack.id)}
                                                            className="text-[10px] px-2 py-1 rounded-md bg-destructive text-white font-bold cursor-pointer"
                                                        >
                                                            Sí
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDelete(null)}
                                                            className="text-[10px] px-2 py-1 text-muted-foreground cursor-pointer"
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDelete(pack.id)}
                                                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-border/50">
                            <h3 className="text-lg font-bold text-foreground">
                                {editingPack ? 'Editar Pack' : 'Nuevo Pack de Precios'}
                            </h3>
                            <button
                                onClick={closeModal}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-5 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Tratamiento</label>
                                <select
                                    required
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={form.service_id}
                                    onChange={e => setForm({ ...form, service_id: e.target.value })}
                                >
                                    <option value="" disabled>Seleccionar...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Nombre del Pack</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Pack de 8 sesiones"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Cant. Sesiones</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max="100"
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={form.sessions}
                                        onChange={e => setForm({ ...form, sessions: parseInt(e.target.value) || 1 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Precio</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            step="0.01"
                                            className="w-full pl-7 pr-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={form.price}
                                            onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Notas
                                    <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Ej: Promoción válida hasta fin de mes"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-none"
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>

                            {form.sessions > 0 && form.price > 0 && (
                                <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-center">
                                    <span className="text-xs text-muted-foreground">Precio por sesión: </span>
                                    <span className="text-sm font-bold text-primary">${(form.price / form.sessions).toFixed(2)}</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 py-2.5 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : editingPack ? 'Guardar Cambios' : 'Crear Pack'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
