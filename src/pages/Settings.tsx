import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, ShieldAlert, Check, Sparkles, X, KeyRound } from 'lucide-react'


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface Professional {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    color: string | null;
    is_active: boolean;
    auth_user_id?: string | null;
}

export interface Service {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price: number | string | null;
    type: string;
    is_active: boolean;
}

export function Settings() {
    const [activeTab, setActiveTab] = useState('professionals')

    // Professionals State
    const [professionals, setProfessionals] = useState<Professional[]>([])
    const [loadingProf, setLoadingProf] = useState(true)
    const [isProfModalOpen, setIsProfModalOpen] = useState(false)
    const [editingProfId, setEditingProfId] = useState<string | null>(null)
    const [profFormData, setProfFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        password: '',
        color: '#3b82f6', // Default color
        is_active: true
    })
    const [profSaving, setProfSaving] = useState(false)
    const [profError, setProfError] = useState('')

    // Services State
    const [services, setServices] = useState<Service[]>([])
    const [loadingServ, setLoadingServ] = useState(true)
    const [isServModalOpen, setIsServModalOpen] = useState(false)
    const [editingServId, setEditingServId] = useState<string | null>(null)
    const [servFormData, setServFormData] = useState({
        name: '',
        description: '',
        duration_minutes: 60,
        price: '',
        type: 'simple',
        is_active: true
    })


    // --- Professionals Logic ---
    async function fetchProfessionals() {
        setLoadingProf(true)
        const { data } = await supabase.from('professionals').select('*').order('first_name')
        if (data) setProfessionals(data)
        setLoadingProf(false)
    }

    const handleOpenProfModal = (prof: Professional | null = null) => {
        setProfError('')
        if (prof) {
            setEditingProfId(prof.id)
            setProfFormData({
                first_name: prof.first_name,
                last_name: prof.last_name,
                email: prof.email || '',
                phone: prof.phone || '',
                password: '',
                color: prof.color || '#3b82f6',
                is_active: prof.is_active
            })
        } else {
            setEditingProfId(null)
            setProfFormData({
                first_name: '',
                last_name: '',
                email: '',
                phone: '',
                password: '',
                color: '#3b82f6',
                is_active: true
            })
        }
        setIsProfModalOpen(true)
    }

    const handleSaveProf = async (e: React.FormEvent) => {
        e.preventDefault()
        setProfError('')
        setProfSaving(true)

        const { password, ...profData } = profFormData

        if (editingProfId) {
            // Edit: first update the row
            const { error } = await supabase
                .from('professionals')
                .update({ first_name: profData.first_name, last_name: profData.last_name, email: profData.email, phone: profData.phone, color: profData.color, is_active: profData.is_active })
                .eq('id', editingProfId)

            if (error) { setProfError(error.message); setProfSaving(false); return }

            // If a password was provided and this professional is linked to an auth user, update it
            if (password && password.length > 0) {
                const prof = professionals.find(p => p.id === editingProfId)
                if (prof && prof.auth_user_id) {
                    const { data: sessionData } = await supabase.auth.getSession()
                    const token = sessionData.session?.access_token
                    const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-staff-user`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ action: 'update_password', auth_user_id: prof.auth_user_id, password }),
                    })
                    const result = await resp.json()
                    if (!resp.ok) {
                        setProfError(result.error || 'Error al actualizar la contraseña')
                        setProfSaving(false)
                        return
                    }
                }
            }
        } else {
            // Create: first create the Supabase Auth user via Edge Function
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData.session?.access_token

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-staff-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    email: profData.email,
                    password,
                    nombre: `${profData.first_name} ${profData.last_name}`,
                }),
            })

            const result = await resp.json()
            if (!resp.ok) {
                setProfError(result.error || 'Error al crear el usuario')
                setProfSaving(false)
                return
            }

            // Then insert the professional row linked to the new auth user
            const { error } = await supabase.from('professionals').insert([{
                ...profData,
                auth_user_id: result.user_id,
            }])
            if (error) { setProfError(error.message); setProfSaving(false); return }
        }

        setIsProfModalOpen(false)
        setProfSaving(false)
        fetchProfessionals()
    }

    /** Calls the manage-staff-user edge function to ban/unban/delete auth users */
    const callManageStaff = async (action: 'enable' | 'disable' | 'delete', auth_user_id: string) => {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-staff-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action, auth_user_id }),
        })
        if (!resp.ok) {
            const err = await resp.json()
            console.error('manage-staff-user error:', err)
        }
    }

    const handleDeleteProf = async (id: string) => {
        if (window.confirm('¿Eliminar este profesional? No podrá acceder al sistema y sus datos quedarán registrados.')) {
            // Find auth_user_id before deleting
            const prof = professionals.find(p => p.id === id)
            const { error } = await supabase.from('professionals').delete().eq('id', id)
            if (error) { console.error('Error deleting:', error); return }
            // Delete the Supabase Auth user too (if linked)
            if (prof?.auth_user_id) {
                await callManageStaff('delete', prof.auth_user_id)
            }
            fetchProfessionals()
        }
    }

    const handleToggleProfActive = async (id: string, currentStatus: boolean) => {
        const prof = professionals.find(p => p.id === id)
        const newStatus = !currentStatus
        const { error } = await supabase.from('professionals').update({ is_active: newStatus }).eq('id', id)
        if (error) { console.error('Error toggling status:', error); return }
        // Sync with Supabase Auth: ban if deactivating, unban if activating
        if (prof?.auth_user_id) {
            await callManageStaff(newStatus ? 'enable' : 'disable', prof.auth_user_id)
        }
        fetchProfessionals()
    }

    // --- Services Logic ---
    async function fetchServices() {
        setLoadingServ(true)
        const { data } = await supabase.from('services').select('*').order('name')
        if (data) setServices(data)
        setLoadingServ(false)
    }

    useEffect(() => {
        if (activeTab === 'professionals') {
            void fetchProfessionals() // eslint-disable-line
        } else if (activeTab === 'services') {
            void fetchServices()
        }
    }, [activeTab])

    const handleOpenServModal = (serv: Service | null = null) => {
        if (serv) {
            setEditingServId(serv.id)
            setServFormData({
                name: serv.name,
                description: serv.description || '',
                duration_minutes: serv.duration_minutes || 60,
                price: serv.price != null ? String(serv.price) : '',
                type: serv.type || 'simple',
                is_active: serv.is_active
            })
        } else {
            setEditingServId(null)
            setServFormData({
                name: '',
                description: '',
                duration_minutes: 60,
                price: '',
                type: 'simple',
                is_active: true
            })
        }
        setIsServModalOpen(true)
    }

    const handleSaveServ = async (e: React.FormEvent) => {
        e.preventDefault()
        const payload = {
            ...servFormData,
            price: servFormData.price ? parseFloat(String(servFormData.price)) : null,
            duration_minutes: parseInt(String(servFormData.duration_minutes)) || 60
        }

        if (editingServId) {
            const { error } = await supabase.from('services').update(payload).eq('id', editingServId)
            if (error) console.error('Error updating service:', error)
        } else {
            const { error } = await supabase.from('services').insert([payload])
            if (error) console.error('Error creating service:', error)
        }
        setIsServModalOpen(false)
        fetchServices()
    }

    const handleDeleteServ = async (id: string) => {
        if (window.confirm('¿Seguro que deseas eliminar este servicio? Los turnos o cuponeras asociados podrían verse afectados.')) {
            const { error } = await supabase.from('services').delete().eq('id', id)
            if (error) console.error('Error deleting:', error)
            fetchServices()
        }
    }

    const handleToggleServActive = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase.from('services').update({ is_active: !currentStatus }).eq('id', id)
        if (error) console.error('Error toggling status:', error)
        fetchServices()
    }

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Configuración</h1>
                <p className="text-muted-foreground mt-1">Gestión del equipo médico, estético y parámetros del sistema.</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/50 gap-6">
                <button
                    onClick={() => setActiveTab('professionals')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'professionals' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Profesionales (Equipo)
                </button>
                <button
                    onClick={() => setActiveTab('services')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'services' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    Catálogo de Tratamientos
                </button>
            </div>



            {/* Tab Content: Profesionales */}
            {activeTab === 'professionals' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-card border border-border/50 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-base font-semibold text-foreground">Staff Clínica Magnolias</h2>
                        </div>
                        <button
                            onClick={() => handleOpenProfModal()}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Profesional
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loadingProf ? (
                            <div className="col-span-full p-8 text-center text-muted-foreground">Cargando profesionales...</div>
                        ) : professionals.length === 0 ? (
                            <div className="col-span-full p-8 border border-dashed border-border/50 rounded-lg text-center bg-muted/10 text-muted-foreground">
                                No hay profesionales cargados en el sistema.
                            </div>
                        ) : (
                            professionals.map(prof => (
                                <div key={prof.id} className="bg-card border border-border/60 shadow-sm rounded-xl p-5 flex flex-col justify-between group transition-all duration-200 hover:border-primary/30">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-foreground flex items-center gap-2">
                                                {prof.first_name} {prof.last_name}
                                            </h3>
                                            <button
                                                onClick={() => handleToggleProfActive(prof.id, prof.is_active)}
                                                className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${prof.is_active
                                                    ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20'
                                                    : 'bg-muted text-muted-foreground border-border/50 hover:bg-muted/80'
                                                    }`}
                                            >
                                                {prof.is_active ? 'Activo' : 'Inactivo'}
                                            </button>
                                        </div>
                                        <div className="text-sm text-muted-foreground space-y-1 mb-4">
                                            <p>{prof.email || 'Sin email configurado'}</p>
                                            <p>{prof.phone || 'Sin tel. configurado'}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-3 border-t border-border/40 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleOpenProfModal(prof)}
                                            className="p-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors shadow-sm cursor-pointer"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteProf(prof.id)}
                                            className="p-1.5 bg-destructive/10 text-destructive rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm cursor-pointer"
                                            title="Eliminar Profesional"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Tab Content: Servicios */}
            {activeTab === 'services' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-card border border-border/50 p-4 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-base font-semibold text-foreground">Catálogo de Tratamientos</h2>
                        </div>
                        <button
                            onClick={() => handleOpenServModal()}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors cursor-pointer shadow-sm"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Servicio
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loadingServ ? (
                            <div className="col-span-full p-8 text-center text-muted-foreground">Cargando servicios...</div>
                        ) : services.length === 0 ? (
                            <div className="col-span-full p-8 border border-dashed border-border/50 rounded-lg text-center bg-muted/10 text-muted-foreground">
                                No hay servicios cargados en el catálogo.
                            </div>
                        ) : (
                            services.map(serv => (
                                <div key={serv.id} className="bg-card border border-border/60 shadow-sm rounded-xl p-5 flex flex-col justify-between group transition-all duration-200 hover:border-primary/30">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-foreground flex items-center gap-2 leading-tight">
                                                {serv.name}
                                            </h3>
                                            <button
                                                onClick={() => handleToggleServActive(serv.id, serv.is_active)}
                                                className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ml-2 mt-1 ${serv.is_active
                                                    ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20'
                                                    : 'bg-muted text-muted-foreground border-border/50 hover:bg-muted/80'
                                                    }`}
                                            >
                                                {serv.is_active ? 'Activo' : 'Inactivo'}
                                            </button>
                                        </div>
                                        <div className="text-sm text-muted-foreground mb-4 line-clamp-2" title={serv.description || undefined}>
                                            {serv.description || 'Sin descripción'}
                                        </div>
                                        <div className="flex flex-col gap-1.5 mb-2 bg-background/50 rounded-lg border border-border/50 p-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Valor:</span>
                                                <span className="font-semibold text-foreground">
                                                    {serv.price ? `$ ${Number(serv.price).toLocaleString('es-AR')}` : 'Sin valor'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Duración:</span>
                                                <span className="text-foreground">{serv.duration_minutes} min</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Tipo:</span>
                                                <span className="text-foreground capitalize">{serv.type}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-3 border-t border-border/40 opacity-50 group-hover:opacity-100 transition-opacity mt-2">
                                        <button
                                            onClick={() => handleOpenServModal(serv)}
                                            className="p-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors shadow-sm cursor-pointer"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteServ(serv.id)}
                                            className="p-1.5 bg-destructive/10 text-destructive rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm cursor-pointer"
                                            title="Eliminar Servicio"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Modal de ABM de Profesional */}
            {isProfModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="text-xl font-bold text-foreground">
                                {editingProfId ? 'Editar Profesional' : 'Nuevo Profesional'}
                            </h3>
                            <button onClick={() => setIsProfModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-5">
                            {editingProfId ? 'Modifica los datos del personal existente.' : 'Registra un nuevo integrante en el equipo de Clínica Magnolias.'}
                        </p>

                        <form onSubmit={handleSaveProf} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={profFormData.first_name}
                                        onChange={e => setProfFormData({ ...profFormData, first_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Apellido</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={profFormData.last_name}
                                        onChange={e => setProfFormData({ ...profFormData, last_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">
                                    Correo Electrónico
                                    {!editingProfId && <span className="text-destructive ml-1">*</span>}
                                </label>
                                <input
                                    type="email"
                                    required={!editingProfId}
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={profFormData.email}
                                    onChange={e => setProfFormData({ ...profFormData, email: e.target.value })}
                                />
                            </div>

                            {/* Password — shown always, required when creating */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                                    {editingProfId ? 'Nueva contraseña' : 'Contraseña de acceso'}
                                    {!editingProfId && <span className="text-destructive">*</span>}
                                </label>
                                <input
                                    type="password"
                                    required={!editingProfId}
                                    minLength={6}
                                    placeholder={editingProfId ? "Dejá en blanco para no cambiarla" : "Mínimo 6 caracteres"}
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={profFormData.password}
                                    onChange={e => setProfFormData({ ...profFormData, password: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {editingProfId
                                        ? "Solo ingresá una si deseas cambiar la contraseña de acceso actual del profesional."
                                        : "Con esta contraseña el profesional podrá ingresar al sistema."}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Teléfono de Contacto <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                <input
                                    type="text"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={profFormData.phone}
                                    onChange={e => setProfFormData({ ...profFormData, phone: e.target.value })}
                                />
                            </div>

                            {/* Color Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Color de Agenda</label>
                                <div className="flex gap-2 lg:gap-3 flex-wrap">
                                    {[
                                        '#ef4444', // red
                                        '#f97316', // orange
                                        '#eab308', // yellow
                                        '#22c55e', // green
                                        '#14b8a6', // teal
                                        '#0ea5e9', // light blue
                                        '#3b82f6', // blue
                                        '#8b5cf6', // violet
                                        '#d946ef', // fuchsia
                                        '#f43f5e', // rose
                                    ].map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setProfFormData({ ...profFormData, color })}
                                            className={`w-8 h-8 rounded-full transition-transform cursor-pointer border-2 shadow-sm ${profFormData.color === color ? 'border-foreground scale-110' : 'border-transparent scale-100 hover:scale-110'}`}
                                            style={{ backgroundColor: color }}
                                            title="Elegir este color"
                                        />
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">Color identificador para los turnos en el calendario.</p>
                            </div>

                            <div className="pt-2 flex items-center justify-between border-t border-border/50">
                                <span className="text-sm font-medium text-foreground">Estado Activo</span>
                                <input
                                    type="checkbox"
                                    checked={profFormData.is_active}
                                    onChange={e => setProfFormData({ ...profFormData, is_active: e.currentTarget.checked })}
                                    className="w-4 h-4 accent-primary cursor-pointer"
                                />
                            </div>

                            {/* Error message */}
                            {profError && (
                                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                    {profError}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => setIsProfModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={profSaving}
                                    className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {profSaving ? (
                                        <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Creando...</>
                                    ) : (
                                        <><Check className="w-4 h-4" /> Guardar</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de ABM de Servicios */}
            {isServModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="text-xl font-bold text-foreground">
                                {editingServId ? 'Editar Servicio' : 'Nuevo Servicio'}
                            </h3>
                            <button onClick={() => setIsServModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-5">
                            {editingServId ? 'Actualiza el catálogo de tratamientos.' : 'Añade un nuevo tratamiento o servicio al catálogo.'}
                        </p>

                        <form onSubmit={handleSaveServ} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Nombre del Servicio</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Depilación Láser Pierna Completa"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={servFormData.name}
                                    onChange={e => setServFormData({ ...servFormData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Descripción <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                <textarea
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-none h-20"
                                    placeholder="Describe en qué consiste el servicio..."
                                    value={servFormData.description}
                                    onChange={e => setServFormData({ ...servFormData, description: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Valor (Precio) $</label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0.00"
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={servFormData.price}
                                        onChange={e => setServFormData({ ...servFormData, price: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Duración (minutos)</label>
                                    <input
                                        type="number"
                                        min="5"
                                        step="5"
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={servFormData.duration_minutes}
                                        onChange={e => setServFormData({ ...servFormData, duration_minutes: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 pt-1 relative">
                                <label className="text-sm font-medium text-foreground">Tipo de Servicio</label>
                                <select
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none appearance-none"
                                    value={servFormData.type}
                                    onChange={e => setServFormData({ ...servFormData, type: e.target.value })}
                                >
                                    <option value="simple">Simple (Asignable directo a agenda generica)</option>
                                    <option value="complejo">Complejo (Requiere aparatología o box especial)</option>
                                </select>
                            </div>

                            <div className="pt-2 flex items-center justify-between border-t border-border/50">
                                <span className="text-sm font-medium text-foreground">Estado Activo (Público)</span>
                                <input
                                    type="checkbox"
                                    checked={servFormData.is_active}
                                    onChange={e => setServFormData({ ...servFormData, is_active: e.currentTarget.checked })}
                                    className="w-4 h-4 accent-primary cursor-pointer"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => setIsServModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors flex items-center gap-2">
                                    <Check className="w-4 h-4" /> Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
