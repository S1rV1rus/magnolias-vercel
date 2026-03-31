import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Ticket, Search, CheckCircle2, X, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

// ─── Patient Search Input Helper ────────────────────────────────────────────────
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
// ────────────────────────────────────────────────────────────────────────────────


export function Coupons() {
    const [cuponeras, setCuponeras] = useState<any[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        patient_id: '',
        service_id: '',
        total_sessions: 8,
        used_sessions: 0,
        invoice_number: '',
        amount_paid: ''
    })


    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)

        // 1. Fetch Cuponeras with joins
        const { data: cData, error: cError } = await supabase
            .from('cuponeras')
            .select(`
                *,
                patients!inner(id, first_name, last_name, document_id),
                services!inner(id, name)
            `)
            .order('created_at', { ascending: false })

        if (cData) {
            setCuponeras(cData)
        } else if (cError) {
            console.error('Error fetching cuponeras:', cError)
        }

        // 2. Fetch Patients for Dropdown
        const { data: pData } = await supabase
            .from('patients')
            .select('id, first_name, last_name, document_id')
            .order('last_name', { ascending: true })
        if (pData) setPatients(pData)

        // 3. Fetch Services for Dropdown
        const { data: sData } = await supabase
            .from('services')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true })
        if (sData) setServices(sData)

        setLoading(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.patient_id || !formData.service_id) return

        const payload = {
            patient_id: formData.patient_id,
            service_id: formData.service_id,
            total_sessions: formData.total_sessions,
            used_sessions: formData.used_sessions,
            is_active: formData.used_sessions < formData.total_sessions,
            invoice_number: formData.invoice_number || null,
            amount_paid: formData.amount_paid ? parseFloat(formData.amount_paid) : null
        }

        let error
        if (editingId) {
            const { error: updateError } = await supabase
                .from('cuponeras')
                .update(payload)
                .eq('id', editingId)
            error = updateError
        } else {
            const { error: insertError } = await supabase
                .from('cuponeras')
                .insert([payload])
            error = insertError
        }

        if (!error) {
            setIsModalOpen(false)
            setEditingId(null)
            setFormData({ patient_id: '', service_id: '', total_sessions: 8, used_sessions: 0, invoice_number: '', amount_paid: '' })
            fetchData()
        } else {
            console.error('Error saving cuponera:', error)
            alert('Error al guardar la cuponera. Intente nuevamente.')
        }
    }

    const handleEdit = (c: any) => {
        setEditingId(c.id)
        setFormData({
            patient_id: c.patient_id,
            service_id: c.service_id,
            total_sessions: c.total_sessions,
            used_sessions: c.used_sessions,
            invoice_number: c.invoice_number || '',
            amount_paid: c.amount_paid?.toString() || ''
        })
        setIsModalOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar esta cuponera? Esta acción no se puede deshacer.')) return

        const { error } = await supabase
            .from('cuponeras')
            .delete()
            .eq('id', id)

        if (!error) {
            fetchData()
        } else {
            console.error('Error deleting cuponera:', error)
            alert('Error al eliminar la cuponera.')
        }
    }


    const filteredCuponeras = cuponeras.filter(c => {
        const patientName = `${c.patients?.first_name} ${c.patients?.last_name}`.toLowerCase()
        const patientDoc = c.patients?.document_id?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()
        return patientName.includes(query) || patientDoc.includes(query)
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
                        <Ticket className="h-8 w-8 text-primary" />
                        Cuponeras
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Administración central de paquetes de sesiones adquiridos por los clientes.
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors cursor-pointer"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Vender Cuponera
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col">

                {/* Search Bar */}
                <div className="mb-6 relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o Cédula del paciente..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                    />
                </div>

                {/* Table */}
                <div className="overflow-x-auto -mx-4 md:mx-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                            <tr>
                                <th className="px-6 py-3 font-medium">Paciente</th>
                                <th className="px-6 py-3 font-medium">Tratamiento</th>
                                <th className="px-6 py-3 font-medium">Fecha de Compra</th>
                                <th className="px-6 py-3 font-medium">Facturación</th>
                                <th className="px-6 py-3 font-medium">Progreso Sesiones</th>
                                <th className="px-6 py-3 font-medium text-center">Estado</th>
                                <th className="px-6 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredCuponeras.map((c) => {
                                const patient = Array.isArray(c.patients) ? c.patients[0] : c.patients
                                const service = Array.isArray(c.services) ? c.services[0] : c.services
                                const pct = (c.used_sessions / c.total_sessions) * 100

                                return (
                                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-foreground">
                                                    {patient?.first_name} {patient?.last_name}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    Cédula: {patient?.document_id}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-medium text-primary">
                                                {service?.name || 'Servicio Desconocido'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">
                                            {format(new Date(c.created_at), "dd 'de' MMMM, yyyy", { locale: es })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {c.amount_paid ? (
                                                    <span className="font-medium text-foreground">
                                                        $ {Number(c.amount_paid).toLocaleString('es-AR')}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Sin monto</span>
                                                )}
                                                {c.invoice_number ? (
                                                    <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={c.invoice_number}>
                                                        Fact: {c.invoice_number}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Sin comprobante</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 min-w-[200px]">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">Usadas: {c.used_sessions}</span>
                                                    <span className="font-medium">Total: {c.total_sessions}</span>
                                                </div>
                                                <div className="w-full bg-background rounded-full h-2 border border-border overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${c.is_active ? 'bg-primary' : 'bg-muted-foreground'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {c.is_active ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                                    Activa
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                                    Consumida
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 text-sm">
                                                <button
                                                    onClick={() => handleEdit(c)}
                                                    className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(c.id)}
                                                    className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <Link
                                                    to={`/patients/${c.patient_id}`}
                                                    className="ml-2 text-primary hover:text-primary/80 font-medium transition-colors"
                                                >
                                                    Ver Perfil
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}


                            {filteredCuponeras.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                        <Ticket className="mx-auto h-12 w-12 opacity-20 mb-3" />
                                        <p>No se encontraron cuponeras con esos criterios.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Cuponera */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Ticket className="w-5 h-5 text-primary" />
                                {editingId ? 'Editar Cuponera' : 'Vender Nueva Cuponera'}
                            </h2>
                            <button onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ patient_id: '', service_id: '', total_sessions: 8, used_sessions: 0, invoice_number: '', amount_paid: '' }) }} className="text-muted-foreground hover:text-foreground cursor-pointer p-1">
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">


                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Paciente</label>
                                <PatientSearchInput
                                    patients={patients}
                                    value={formData.patient_id}
                                    onChange={(id) => setFormData(f => ({ ...f, patient_id: id }))}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Servicio Médico</label>
                                    <select
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={formData.service_id}
                                        onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                                    >
                                        <option value="" disabled>Seleccionar tratamiento...</option>
                                        {services.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Cant. Sesiones Totales</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max="50"
                                        value={formData.total_sessions}
                                        onChange={(e) => setFormData({ ...formData, total_sessions: parseInt(e.target.value) })}
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>

                            {editingId && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Sesiones Ya Usadas</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        max={formData.total_sessions}
                                        value={formData.used_sessions}
                                        onChange={(e) => setFormData({ ...formData, used_sessions: parseInt(e.target.value) })}
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none text-primary font-bold"
                                    />
                                </div>
                            )}

                            <div className="pt-2 border-t border-border mt-6"></div>


                            <div className="grid grid-cols-2 gap-4 mt-4">
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
                                            value={formData.amount_paid}
                                            onChange={(e) => setFormData({ ...formData, amount_paid: e.target.value })}
                                            className="w-full pl-7 pr-3 py-2 bg-background border border-input rounded-md text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground flex justify-between">
                                        Núm. Factura
                                        <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej. B-0001-00000012"
                                        value={formData.invoice_number}
                                        onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ patient_id: '', service_id: '', total_sessions: 8, used_sessions: 0, invoice_number: '', amount_paid: '' }) }} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 flex items-center gap-2 cursor-pointer">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {editingId ? 'Guardar Cambios' : 'Confirmar Venta'}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
