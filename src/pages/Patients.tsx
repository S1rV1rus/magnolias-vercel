import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Search, FileText, Pencil, Trash2 } from 'lucide-react'

export function Patients() {
    const [patients, setPatients] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')

    // Modal ABM
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingPatient, setEditingPatient] = useState<any>(null) // null = crear, objeto = editar
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        document_id: '',
        phone: '',
        email: ''
    })

    useEffect(() => {
        fetchPatients()
    }, [])

    async function fetchPatients() {
        const { data } = await supabase.from('patients').select('*').order('created_at', { ascending: false })
        if (data) setPatients(data)
    }

    const openCreate = () => {
        setEditingPatient(null)
        setFormData({ first_name: '', last_name: '', document_id: '', phone: '', email: '' })
        setIsModalOpen(true)
    }

    const openEdit = (patient: any) => {
        setEditingPatient(patient)
        setFormData({
            first_name: patient.first_name,
            last_name: patient.last_name,
            document_id: patient.document_id,
            phone: patient.phone || '',
            email: patient.email || ''
        })
        setIsModalOpen(true)
    }

    const handleSavePatient = async (e: React.FormEvent) => {
        e.preventDefault()

        if (editingPatient) {
            // Actualizar
            const { error } = await supabase.from('patients').update({
                first_name: formData.first_name,
                last_name: formData.last_name,
                document_id: formData.document_id || null,
                phone: formData.phone || null,
                email: formData.email || null
            }).eq('id', editingPatient.id)
            if (error) { console.error('Error updating patient:', error); return }
        } else {
            // Crear
            const { error } = await supabase.from('patients').insert([{
                first_name: formData.first_name,
                last_name: formData.last_name,
                document_id: formData.document_id || null,
                phone: formData.phone || null,
                email: formData.email || null
            }])
            if (error) { console.error('Error creating patient:', error); return }
        }

        setIsModalOpen(false)
        setEditingPatient(null)
        setFormData({ first_name: '', last_name: '', document_id: '', phone: '', email: '' })
        fetchPatients()
    }

    const handleDeletePatient = async (patient: any) => {
        if (!window.confirm(`¿Seguro que deseas eliminar a ${patient.first_name} ${patient.last_name}? Esta acción eliminará también sus turnos, cuponeras e historia clínica.`)) return
        const { error } = await supabase.from('patients').delete().eq('id', patient.id)
        if (error) console.error('Error deleting patient:', error)
        else fetchPatients()
    }

    // Filter patients
    const filteredPatients = patients.filter(p => {
        const full = `${p.first_name} ${p.last_name} ${p.document_id}`.toLowerCase()
        return full.includes(searchTerm.toLowerCase())
    })

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 relative">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Pacientes</h1>
                    <p className="text-muted-foreground mt-1">Gestión integral de clientes e historias clínicas.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-md font-medium text-sm transition-colors cursor-pointer shadow-sm"
                >
                    <Plus className="w-4 h-4" /> Nuevo Paciente
                </button>
            </div>

            <div className="flex items-center border border-input bg-background/50 backdrop-blur-sm px-3 py-2 rounded-md shadow-sm xl:w-1/3 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <Search className="w-4 h-4 text-muted-foreground mr-2" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o cédula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-0 outline-none w-full text-sm text-foreground placeholder:text-muted-foreground focus:ring-0"
                />
            </div>

            {/* ── MOBILE: Cards ── */}
            <div className="flex flex-col gap-3 md:hidden">
                {filteredPatients.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12 bg-card border border-border/50 rounded-lg">
                        {searchTerm ? 'No se encontraron pacientes.' : 'No hay pacientes registrados aún.'}
                    </div>
                ) : (
                    filteredPatients.map(patient => (
                        <div key={patient.id} className="bg-card border border-border/50 rounded-lg p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-semibold text-card-foreground">{patient.first_name} {patient.last_name}</p>
                                    <p className="text-sm text-muted-foreground mt-0.5">CI: {patient.document_id}</p>
                                    {patient.phone && <p className="text-sm text-muted-foreground">{patient.phone}</p>}
                                    {patient.email && <p className="text-sm text-muted-foreground truncate">{patient.email}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openEdit(patient)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer" title="Editar">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeletePatient(patient)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer" title="Eliminar">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border/50">
                                <Link to={`/patients/${patient.id}`} className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors">
                                    <FileText className="w-4 h-4" /> Ver Historia Clínica
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── DESKTOP: Tabla ── */}
            <div className="hidden md:block border border-border/50 rounded-lg bg-card shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/30 text-muted-foreground border-b border-border/50">
                        <tr>
                            <th className="px-5 py-4 font-medium uppercase text-xs tracking-wider">Nombre Completo</th>
                            <th className="px-5 py-4 font-medium uppercase text-xs tracking-wider">Cédula</th>
                            <th className="px-5 py-4 font-medium uppercase text-xs tracking-wider">Teléfono</th>
                            <th className="px-5 py-4 font-medium uppercase text-xs tracking-wider">Email</th>
                            <th className="px-5 py-4 font-medium uppercase text-xs tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPatients.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground bg-card">
                                    {searchTerm ? 'No se encontraron pacientes que coincidan con la búsqueda.' : 'No hay pacientes registrados aún.'}
                                </td>
                            </tr>
                        ) : (
                            filteredPatients.map(patient => (
                                <tr key={patient.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors bg-card">
                                    <td className="px-5 py-4 font-medium text-card-foreground">
                                        {patient.first_name} {patient.last_name}
                                    </td>
                                    <td className="px-5 py-4 text-muted-foreground">{patient.document_id}</td>
                                    <td className="px-5 py-4 text-muted-foreground">{patient.phone || '-'}</td>
                                    <td className="px-5 py-4 text-muted-foreground">{patient.email || '-'}</td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link to={`/patients/${patient.id}`} className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer">
                                                <FileText className="w-4 h-4" /> Ver Historia
                                            </Link>
                                            <button onClick={() => openEdit(patient)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer" title="Editar paciente">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeletePatient(patient)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer" title="Eliminar paciente">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>


            {/* Modal de Nuevo / Editar Paciente */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6">
                        <h3 className="text-xl font-bold text-foreground mb-1">
                            {editingPatient ? 'Editar Paciente' : 'Nuevo Paciente'}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-5">
                            {editingPatient
                                ? 'Modificá los datos del paciente y guardá los cambios.'
                                : 'Ingresa los datos del cliente para registrar su ficha médica.'}
                        </p>

                        <form onSubmit={handleSavePatient} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={formData.first_name}
                                        onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Apellido</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        value={formData.last_name}
                                        onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Cédula de Identidad <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                <input
                                    type="text"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={formData.document_id}
                                    onChange={e => setFormData({ ...formData, document_id: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Teléfono de Contacto <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                <input
                                    type="text"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Correo Electrónico <span className="text-muted-foreground font-normal">(opcional)</span></label>
                                <input
                                    type="email"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); setEditingPatient(null) }}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors"
                                >
                                    {editingPatient ? 'Guardar Cambios' : 'Guardar Paciente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
