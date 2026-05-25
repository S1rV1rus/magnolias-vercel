import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Calendar, CalendarDays, FileText, CreditCard, Plus, Ticket, CheckCircle2, X, User, Pencil, Trash2, ImageIcon, ChevronLeft, ChevronRight, Play, Pause, Images, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
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
        cuponera_type: 'sessions' as 'sessions' | 'months',
        total_sessions: 8,
        total_months: 3,
        start_date: new Date().toISOString().split('T')[0],
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
    const [isVisualProgressCollapsed, setIsVisualProgressCollapsed] = useState(true)
    const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<any | null>(null)
    const [isEditingHistory, setIsEditingHistory] = useState(false)
    const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(false)
    const [editHistoryForm, setEditHistoryForm] = useState({
        service_type: '',
        professional_id: '',
        notes: '',
        date: ''
    })
    
    // Modal Cuponera Detalle/Editar
    const [selectedCuponera, setSelectedCuponera] = useState<any | null>(null)
    const [isEditingCuponera, setIsEditingCuponera] = useState(false)
    const [confirmDeleteCuponera, setConfirmDeleteCuponera] = useState(false)
    const [editCuponeraForm, setEditCuponeraForm] = useState({
        cuponera_type: 'sessions' as 'sessions' | 'months',
        total_sessions: 0,
        total_months: 0,
        start_date: '',
        invoice_number: '',
        amount_paid: '',
        is_active: true
    })
    
    // Modal Saldar Deuda
    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false)
    const [debtPaymentForm, setDebtPaymentForm] = useState({
        amount_paid: '',
        receipt_number: ''
    })

    const [historyForm, setHistoryForm] = useState({
        service_type: '',
        professional_id: '',
        notes: '',
        data: {}, // Parámetros específicos JSON
        date: new Date().toISOString().split('T')[0]
    })

    // Fotos de historia clínica
    const [historyPhotos, setHistoryPhotos] = useState<Record<string, string[]>>({}) // historyId → [url, url, url]
    const [pendingPhotos, setPendingPhotos] = useState<File[]>([])                    // fotos en el modal antes de guardar
    const [pendingPreviews, setPendingPreviews] = useState<string[]>([])              // object URLs para preview
    const [uploadingPhotos, setUploadingPhotos] = useState(false)
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)              // foto ampliada
    const [selectedCuponeraForConsuming, setSelectedCuponeraForConsuming] = useState<any | null>(null)
    const [editingHistoryPhotos, setEditingHistoryPhotos] = useState<any[]>([])      // fotos de la entrada en edición

    // Slideshow de progreso
    const [slideshowCuponeraId, setSlideshowCuponeraId] = useState<string | null>(null)
    const [slideshowIndex, setSlideshowIndex] = useState(0)
    const [slideshowPlaying, setSlideshowPlaying] = useState(true)
    const slideshowTimer = useRef<ReturnType<typeof setInterval> | null>(null)
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

        // Fetch photos and build URL map
        const { data: photosData } = await supabase
            .from('clinical_history_photos')
            .select('clinical_history_id, storage_path, photo_order')
            .eq('patient_id', id)
            .order('photo_order', { ascending: true })

        if (photosData) {
            const photoMap: Record<string, string[]> = {}
            photosData.forEach((p: any) => {
                const { data: urlData } = supabase.storage
                    .from('patient-photos')
                    .getPublicUrl(p.storage_path)
                if (!photoMap[p.clinical_history_id]) photoMap[p.clinical_history_id] = []
                photoMap[p.clinical_history_id].push(urlData.publicUrl)
            })
            setHistoryPhotos(photoMap)
        }

        // Fetch services for dropdown
        const { data: sData } = await supabase.from('services').select('id, name').eq('is_active', true)
        if (sData) setServices(sData)

        // Fetch professionals for dropdown
        const { data: profData } = await supabase.from('professionals').select('id, first_name, last_name').eq('is_deleted', false)
        if (profData) setProfessionals(profData)

        // Fetch Appointments
        const { data: aData } = await supabase
            .from('appointments')
            .select(`
                id, start_time, end_time, status, notes, cuponera_id, is_unpaid, payment_amount, receipt_number,
                appointment_patients!inner(patient_id),
                services(id, name),
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

        const isMonthly = cuponeraForm.cuponera_type === 'months'

        if (isMonthly) {
            // Monthly cuponera: no debt absorption
            const { error } = await supabase.from('cuponeras').insert([{
                patient_id: id,
                service_id: cuponeraForm.service_id,
                cuponera_type: 'months',
                total_months: cuponeraForm.total_months,
                used_months: 0,
                start_date: cuponeraForm.start_date,
                total_sessions: 0,
                used_sessions: 0,
                is_active: true,
                invoice_number: cuponeraForm.invoice_number || null,
                amount_paid: cuponeraForm.amount_paid ? parseFloat(cuponeraForm.amount_paid) : null
            }]).select().single()

            if (!error) {
                setIsCuponeraModalOpen(false)
                setCuponeraForm({ service_id: '', cuponera_type: 'sessions', total_sessions: 8, total_months: 3, start_date: new Date().toISOString().split('T')[0], invoice_number: '', amount_paid: '' })
                loadData()
            } else {
                console.error('Error creating monthly cuponera:', error)
            }
        } else {
            // Session cuponera: original logic with debt absorption
            const unpaidApptsForService = appointments.filter(a => a.is_unpaid && a.services?.id === cuponeraForm.service_id)
            const sessionsToUse = unpaidApptsForService.length

            const { data: newCuponera, error } = await supabase.from('cuponeras').insert([{
                patient_id: id,
                service_id: cuponeraForm.service_id,
                cuponera_type: 'sessions',
                total_sessions: cuponeraForm.total_sessions,
                used_sessions: sessionsToUse,
                is_active: true,
                invoice_number: cuponeraForm.invoice_number || null,
                amount_paid: cuponeraForm.amount_paid ? parseFloat(cuponeraForm.amount_paid) : null
            }]).select().single()

            if (!error && newCuponera) {
                if (unpaidApptsForService.length > 0) {
                    await supabase.from('appointments').update({
                        is_unpaid: false,
                        cuponera_id: newCuponera.id
                    }).in('id', unpaidApptsForService.map(a => a.id))
                }

                setIsCuponeraModalOpen(false)
                setCuponeraForm({ service_id: '', cuponera_type: 'sessions', total_sessions: 8, total_months: 3, start_date: new Date().toISOString().split('T')[0], invoice_number: '', amount_paid: '' })
                loadData()
            } else {
                console.error('Error creating cuponera:', error)
            }
        }
    }

    const handlePayDirectDebt = async (e: React.FormEvent) => {
        e.preventDefault()
        const unpaidAppts = appointments.filter(a => a.is_unpaid)
        if (unpaidAppts.length === 0) return

        const { error } = await supabase
            .from('appointments')
            .update({
                is_unpaid: false,
                payment_amount: debtPaymentForm.amount_paid ? parseFloat(debtPaymentForm.amount_paid) : null,
                receipt_number: debtPaymentForm.receipt_number || null
            })
            .in('id', unpaidAppts.map(a => a.id))

        if (!error) {
            setIsDebtModalOpen(false)
            setDebtPaymentForm({ amount_paid: '', receipt_number: '' })
            loadData()
        } else {
            console.error('Error paying debt:', error)
        }
    }


    const startConsumeSessionFlow = (cuponera: any) => {
        setSelectedCuponeraForConsuming(cuponera);
        const serviceName = Array.isArray(cuponera.services)
            ? cuponera.services[0]?.name
            : cuponera.services?.name;
        setHistoryForm({
            service_type: serviceName || 'Tratamiento',
            professional_id: '',
            notes: '',
            data: {},
            date: new Date().toISOString().split('T')[0]
        });
        setIsHistoryModalOpen(true);
    }

    const fetchEditingHistoryPhotos = async (entryId: string) => {
        const { data } = await supabase
            .from('clinical_history_photos')
            .select('*')
            .eq('clinical_history_id', entryId)
            .order('photo_order', { ascending: true })
        if (data) {
            setEditingHistoryPhotos(data)
        }
    }

    const handleDeletePhoto = async (photo: any) => {
        if (!confirm('¿Desea eliminar esta foto permanentemente?')) return
        const { error } = await supabase.from('clinical_history_photos').delete().eq('id', photo.id)
        if (!error) {
            await supabase.storage.from('patient-photos').remove([photo.storage_path])
            setEditingHistoryPhotos(prev => prev.filter(p => p.id !== photo.id))
            void loadData()
        }
    }

    const openEditHistoryEntryDirectly = (entry: any) => {
        setSelectedHistoryEntry(entry);
        const p = Array.isArray(entry.professionals) ? entry.professionals[0] : entry.professionals;
        setEditHistoryForm({
            service_type: entry.service_type || '',
            professional_id: p ? entry.professional_id || '' : '',
            notes: (entry.notes || '').replace(/\[CUPONERA:[^\]]+\]\s*/, ''),
            date: new Date(entry.created_at).toISOString().split('T')[0]
        });
        setIsEditingHistory(true);
        setConfirmDeleteHistory(false);
        void fetchEditingHistoryPhotos(entry.id);
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

        // If we are consuming a session, prefix the notes with the cuponera tag
        let finalNotes = historyForm.notes;
        
        // Auto-associate if the typed service matches an active session-based cuponera
        let activeCuponeraToConsume = selectedCuponeraForConsuming;
        if (!activeCuponeraToConsume && historyForm.service_type) {
            const trimmedServiceType = historyForm.service_type.trim().toLowerCase();
            const matchingCup = cuponeras.find(c => {
                if (c.cuponera_type === 'months') return false; // only sessions
                const available = c.total_sessions - c.used_sessions;
                if (available <= 0) return false;
                
                const sName = (Array.isArray(c.services) ? c.services[0] : c.services)?.name || '';
                return sName.trim().toLowerCase() === trimmedServiceType;
            });
            if (matchingCup) {
                activeCuponeraToConsume = matchingCup;
            }
        }

        if (activeCuponeraToConsume) {
            const serviceName = Array.isArray(activeCuponeraToConsume.services)
                ? activeCuponeraToConsume.services[0]?.name
                : activeCuponeraToConsume.services?.name;
            const fallbackNotes = `Se consumió manualmente la sesión ${activeCuponeraToConsume.used_sessions + 1} de la cuponera asignada de ${serviceName || 'Tratamiento'}.`;
            finalNotes = `[CUPONERA:${activeCuponeraToConsume.id}] ${historyForm.notes.trim() || fallbackNotes}`;
        }

        const { data: newEntry, error } = await supabase
            .from('clinical_history')
            .insert([{
                patient_id: id,
                professional_id: historyForm.professional_id || null,
                service_type: historyForm.service_type,
                notes: finalNotes,
                data: historyForm.data,
                created_at: createdAt
            }])
            .select('id')
            .single()

        if (!error && newEntry) {
            // Upload pending photos
            if (pendingPhotos.length > 0) {
                setUploadingPhotos(true)
                for (let i = 0; i < pendingPhotos.length; i++) {
                    const file = pendingPhotos[i]
                    const ext = file.name.split('.').pop() || 'jpg'
                    const path = `${id}/${newEntry.id}/${crypto.randomUUID()}.${ext}`
                    const { error: uploadError } = await supabase.storage
                        .from('patient-photos')
                        .upload(path, file, { upsert: false })
                    if (!uploadError) {
                        await supabase.from('clinical_history_photos').insert({
                            clinical_history_id: newEntry.id,
                            patient_id: id,
                            storage_path: path,
                            photo_order: i + 1
                        })
                    }
                }
                setUploadingPhotos(false)
            }

            // If we are consuming a session, increment used_sessions!
            if (activeCuponeraToConsume) {
                await supabase
                    .from('cuponeras')
                    .update({ used_sessions: activeCuponeraToConsume.used_sessions + 1 })
                    .eq('id', activeCuponeraToConsume.id);
            }

            setIsHistoryModalOpen(false)
            setPendingPhotos([])
            setPendingPreviews([])
            setHistoryForm({ service_type: '', professional_id: '', notes: '', data: {}, date: new Date().toISOString().split('T')[0] })
            setSelectedCuponeraForConsuming(null)
            loadData()
        } else {
            console.error('Error creating history entry:', error)
        }
    }

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        const remaining = 3 - pendingPhotos.length
        const toAdd = files.slice(0, remaining)
        setPendingPhotos(prev => [...prev, ...toAdd])
        setPendingPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
        e.target.value = '' // reset so same file can be re-selected
    }

    const removePendingPhoto = (idx: number) => {
        URL.revokeObjectURL(pendingPreviews[idx])
        setPendingPhotos(prev => prev.filter((_, i) => i !== idx))
        setPendingPreviews(prev => prev.filter((_, i) => i !== idx))
    }

    const handleUpdateHistory = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedHistoryEntry) return

        setUploadingPhotos(true)
        try {
            let createdAt = selectedHistoryEntry.created_at
            const todayStr = new Date().toISOString().split('T')[0]
            if (editHistoryForm.date && editHistoryForm.date !== todayStr) {
                const existing = new Date(selectedHistoryEntry.created_at)
                const time = `${String(existing.getUTCHours()).padStart(2,'0')}:${String(existing.getUTCMinutes()).padStart(2,'0')}:00`
                createdAt = new Date(`${editHistoryForm.date}T${time}Z`).toISOString()
            }

            const { error } = await supabase
                .from('clinical_history')
                .update({
                    service_type: editHistoryForm.service_type,
                    professional_id: editHistoryForm.professional_id || null,
                    notes: (() => {
                        const originalNotes = selectedHistoryEntry.notes || '';
                        const match = originalNotes.match(/\[CUPONERA:[^\]]+\]/);
                        const cuponeraTag = match ? `${match[0]} ` : '';
                        return cuponeraTag + editHistoryForm.notes;
                    })(),
                    created_at: createdAt
                })
                .eq('id', selectedHistoryEntry.id)

            if (error) throw error

            // Upload any new pending photos
            if (pendingPhotos.length > 0) {
                const currentCount = editingHistoryPhotos.length;
                for (let i = 0; i < pendingPhotos.length; i++) {
                    const file = pendingPhotos[i]
                    const ext = file.name.split('.').pop() || 'jpg'
                    const path = `${id}/${selectedHistoryEntry.id}/${crypto.randomUUID()}.${ext}`
                    const { error: uploadError } = await supabase.storage
                        .from('patient-photos')
                        .upload(path, file, { upsert: false })
                    if (!uploadError) {
                        await supabase.from('clinical_history_photos').insert({
                            clinical_history_id: selectedHistoryEntry.id,
                            patient_id: id,
                            storage_path: path,
                            photo_order: currentCount + i + 1
                        })
                    }
                }
            }

            setSelectedHistoryEntry(null)
            setIsEditingHistory(false)
            setPendingPhotos([])
            setPendingPreviews([])
            setEditingHistoryPhotos([])
            loadData()
        } catch (error) {
            console.error('Error updating history entry:', error)
            alert('Error al guardar los cambios.')
        } finally {
            setUploadingPhotos(false)
        }
    }

    const handleDeleteHistory = async () => {
        if (!selectedHistoryEntry) return

        const { error } = await supabase
            .from('clinical_history')
            .delete()
            .eq('id', selectedHistoryEntry.id)

        if (!error) {
            setSelectedHistoryEntry(null)
            setIsEditingHistory(false)
            setConfirmDeleteHistory(false)
            loadData()
        } else {
            console.error('Error deleting history entry:', error)
        }
    }

    const handleUpdateCuponera = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedCuponera) return

        const isMonthly = editCuponeraForm.cuponera_type === 'months'
        const updateData: any = {
            invoice_number: editCuponeraForm.invoice_number || null,
            amount_paid: editCuponeraForm.amount_paid ? parseFloat(editCuponeraForm.amount_paid) : null,
            is_active: editCuponeraForm.is_active
        }
        if (isMonthly) {
            updateData.total_months = editCuponeraForm.total_months
            updateData.start_date = editCuponeraForm.start_date
        } else {
            updateData.total_sessions = editCuponeraForm.total_sessions
        }

        const { error } = await supabase
            .from('cuponeras')
            .update(updateData)
            .eq('id', selectedCuponera.id)

        if (!error) {
            setSelectedCuponera(null)
            setIsEditingCuponera(false)
            loadData()
        } else {
            console.error('Error updating cuponera:', error)
        }
    }

    const handleDeleteCuponera = async () => {
        if (!selectedCuponera) return

        const { error } = await supabase
            .from('cuponeras')
            .delete()
            .eq('id', selectedCuponera.id)

        if (!error) {
            setSelectedCuponera(null)
            setIsEditingCuponera(false)
            setConfirmDeleteCuponera(false)
            loadData()
        } else {
            console.error('Error deleting cuponera:', error)
        }
    }

    // ---- Slideshow auto-advance ----
    useEffect(() => {
        if (slideshowTimer.current) clearInterval(slideshowTimer.current)
        if (!slideshowCuponeraId || !slideshowPlaying) return

        const cuponera = cuponeras.find(c => c.id === slideshowCuponeraId)
        if (!cuponera) return

        const sessionEntries = historyEntries
            .filter(h => h.notes?.includes(`[CUPONERA:${slideshowCuponeraId}]`))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        const frames = sessionEntries.flatMap((h, idx) => {
            const photos = historyPhotos[h.id] || []
            return photos.map(url => ({ url, sessionIdx: idx + 1, date: h.created_at }))
        })

        if (frames.length <= 1) return

        slideshowTimer.current = setInterval(() => {
            setSlideshowIndex(prev => (prev + 1) % frames.length)
        }, 3500)

        return () => { if (slideshowTimer.current) clearInterval(slideshowTimer.current) }
    }, [slideshowCuponeraId, slideshowPlaying, historyEntries, historyPhotos])

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

    const unpaidAppointments = appointments.filter(a => a.is_unpaid)
    const hasDebt = unpaidAppointments.length > 0

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 relative">
            {/* Debt Banner */}
            {hasDebt && (
                <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-destructive/20 p-2 rounded-full">
                            <CreditCard className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                            <h3 className="text-destructive font-bold text-sm tracking-tight">ATENCIÓN: Paciente con Deuda</h3>
                            <p className="text-destructive/80 text-xs mt-0.5">
                                Este paciente tiene {unpaidAppointments.length} sesión(es) impaga(s).
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsDebtModalOpen(true)}
                        className="w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm cursor-pointer whitespace-nowrap"
                    >
                        Saldar Deuda
                    </button>
                </div>
            )}

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
                                onClick={() => {
                                    setSelectedCuponeraForConsuming(null);
                                    setIsHistoryModalOpen(true);
                                }}
                                className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" /> Agregar Entrada
                            </button>
                        </div>

                        {/* --- Galería de Progreso por Tratamiento --- */}
                        {(() => {
                            const cuponerasWithPhotos = cuponeras.filter(c => {
                                const entries = historyEntries.filter(h => h.notes?.includes(`[CUPONERA:${c.id}]`))
                                return entries.some(h => (historyPhotos[h.id]?.length ?? 0) > 0)
                            })
                            if (cuponerasWithPhotos.length === 0) return null

                            const activeCuponera = cuponerasWithPhotos.find(c => c.id === slideshowCuponeraId) || cuponerasWithPhotos[0]

                            // Build frames for active cuponera
                            const sessionEntries = historyEntries
                                .filter(h => h.notes?.includes(`[CUPONERA:${activeCuponera.id}]`))
                                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

                            const frames = sessionEntries.flatMap((h, idx) => {
                                const photos = historyPhotos[h.id] || []
                                return photos.map(url => ({
                                    url,
                                    sessionIdx: idx + 1,
                                    date: h.created_at
                                }))
                            })

                            const activeFrame = frames[slideshowIndex % Math.max(1, frames.length)]
                            const serviceLabel = (Array.isArray(activeCuponera.services) ? activeCuponera.services[0] : activeCuponera.services)?.name || 'Tratamiento'

                            return (
                                <div className="border border-border/60 rounded-xl overflow-hidden bg-card shadow-sm">
                                    {/* Clickable Header bar */}
                                    <div 
                                        onClick={() => setIsVisualProgressCollapsed(prev => !prev)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30 select-none transition-colors",
                                            !isVisualProgressCollapsed && "border-b border-border/40"
                                        )}
                                    >
                                        <Images className="w-4 h-4 text-primary" />
                                        <span className="text-sm font-semibold text-foreground">Progreso Visual — {serviceLabel}</span>
                                        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground font-medium">
                                            {frames.length} foto{frames.length !== 1 ? 's' : ''}
                                            {isVisualProgressCollapsed ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronUp className="w-4 h-4 text-primary" />}
                                        </span>
                                    </div>

                                    {!isVisualProgressCollapsed && (
                                        <div className="bg-card">
                                            {/* Treatment selector tabs */}
                                            {cuponerasWithPhotos.length > 1 && (
                                                <div className="flex gap-1 px-4 pt-4 pb-0 border-b border-border/40">
                                                    {cuponerasWithPhotos.map(c => {
                                                        const label = (Array.isArray(c.services) ? c.services[0] : c.services)?.name || 'Tratamiento'
                                                        const isActive = c.id === (slideshowCuponeraId || cuponerasWithPhotos[0].id)
                                                        return (
                                                            <button
                                                                key={c.id}
                                                                onClick={() => { setSlideshowCuponeraId(c.id); setSlideshowIndex(0) }}
                                                                className={cn(
                                                                    'px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer -mb-px',
                                                                    isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                                                                )}
                                                            >{label}</button>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {frames.length === 0 ? (
                                                <div className="p-8 text-center text-sm text-muted-foreground">No hay fotos en este tratamiento aún.</div>
                                            ) : (
                                                <div className="relative">
                                                    {/* Main photo */}
                                                    <div className="relative h-72 bg-black/90 overflow-hidden">
                                                        {frames.map((frame, fi) => (
                                                            <img
                                                                key={fi}
                                                                src={frame.url}
                                                                alt={`Sesión ${frame.sessionIdx}`}
                                                                onClick={() => setLightboxUrl(frame.url)}
                                                                className={cn(
                                                                    'absolute inset-0 w-full h-full object-contain transition-opacity duration-700 cursor-zoom-in',
                                                                    fi === (slideshowIndex % frames.length) ? 'opacity-100' : 'opacity-0'
                                                                )}
                                                            />
                                                        ))}

                                                        {/* Session label overlay */}
                                                        {activeFrame && (
                                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                                                                <p className="text-white text-sm font-semibold">
                                                                    Sesión {activeFrame.sessionIdx}
                                                                </p>
                                                                <p className="text-white/70 text-xs">
                                                                    {new Date(activeFrame.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Prev / Next */}
                                                        {frames.length > 1 && (
                                                            <>
                                                                <button
                                                                    onClick={() => setSlideshowIndex(prev => (prev - 1 + frames.length) % frames.length)}
                                                                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors cursor-pointer"
                                                                ><ChevronLeft className="w-5 h-5" /></button>
                                                                <button
                                                                    onClick={() => setSlideshowIndex(prev => (prev + 1) % frames.length)}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors cursor-pointer"
                                                                ><ChevronRight className="w-5 h-5" /></button>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Controls bar */}
                                                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-card">
                                                        {/* Dots */}
                                                        <div className="flex gap-1.5">
                                                            {frames.map((_, fi) => (
                                                                <button
                                                                    key={fi}
                                                                    onClick={() => setSlideshowIndex(fi)}
                                                                    className={cn(
                                                                        'w-2 h-2 rounded-full transition-all cursor-pointer',
                                                                        fi === (slideshowIndex % frames.length)
                                                                            ? 'bg-primary scale-125'
                                                                            : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>

                                                        {/* Play / Pause */}
                                                        <button
                                                            onClick={() => setSlideshowPlaying(p => !p)}
                                                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                        >
                                                            {slideshowPlaying
                                                                ? <><Pause className="w-3.5 h-3.5" /> Pausar</>
                                                                : <><Play className="w-3.5 h-3.5" /> Reproducir</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {historyEntries.length === 0 && appointments.filter(a => a.notes?.trim() && !a.cuponera_id).length === 0 ? (
                            <div className="text-sm text-muted-foreground border border-border/50 border-dashed rounded-lg p-8 text-center bg-muted/20">
                                No hay evoluciones clínicas ni notas registradas aún.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {[
                                    ...historyEntries
                                        .map(h => ({ 
                                            ...h, 
                                            type: 'history', 
                                            sortDate: h.created_at,
                                            notes: h.notes
                                        })),
                                    ...appointments.filter(a => a.notes?.trim() && !a.cuponera_id).map(a => ({ ...a, type: 'appointment', sortDate: a.start_time }))
                                ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).map(item => {
                                    if (item.type === 'history') {
                                        const prof = Array.isArray(item.professionals) ? item.professionals[0] : item.professionals;
                                        
                                        // Match cuponera info if notes contain [CUPONERA:uuid]
                                        let cuponeraInfo = null;
                                        let serviceName = '';
                                        const originalNotes = item.notes || '';
                                        const match = originalNotes.match(/\[CUPONERA:([^\]]+)\]/);
                                        if (match && match[1]) {
                                            const cupId = match[1];
                                            const matchedCup = cuponeras.find(c => c.id === cupId);
                                            if (matchedCup) {
                                                cuponeraInfo = matchedCup;
                                                const s = Array.isArray(matchedCup.services) ? matchedCup.services[0] : matchedCup.services;
                                                serviceName = s?.name || 'Tratamiento';
                                            }
                                        }
                                        
                                        const cleanNotesText = originalNotes.replace(/\[CUPONERA:[^\]]+\]\s*/, '') || 'Sin evolución descriptiva.';

                                        return (
                                            <div
                                                key={`hist-${item.id}`}
                                                onClick={() => setSelectedHistoryEntry(item)}
                                                className="border border-border/60 shadow-sm rounded-lg p-5 bg-card relative overflow-hidden cursor-pointer hover:border-primary shadow-md transition-all group hover:scale-[1.01]"
                                            >
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                    <div className="bg-primary/10 p-1.5 rounded-full text-primary">
                                                        <Pencil className="w-4 h-4" />
                                                    </div>
                                                </div>
                                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 rounded-l-lg group-hover:bg-primary transition-colors"></div>
                                                <div className="flex justify-between items-start text-sm mb-3">
                                                    <div>
                                                        <span className="font-semibold text-foreground text-base group-hover:text-primary transition-colors block">
                                                            {item.service_type || 'Visita General'}
                                                        </span>
                                                        {cuponeraInfo && (
                                                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase tracking-wider mt-1.5">
                                                                <CreditCard className="w-3 h-3" />
                                                                Sesión de {serviceName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/50 text-[13px]">
                                                        {new Date(item.created_at).toLocaleDateString('es-AR') + ' ' + new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - {prof ? `Dr / a.${prof.first_name} ${prof.last_name}` : 'Sin profesional asignado'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-3">
                                                    {cleanNotesText}
                                                </p>
                                                {cleanNotesText && cleanNotesText.length > 150 && (
                                                    <div className="text-xs text-primary mt-2 font-medium">Ver detalles completos...</div>
                                                )}
                                                {/* Photo thumbnails */}
                                                {historyPhotos[item.id]?.length > 0 && (
                                                    <div className="flex gap-1.5 mt-3 pt-3 border-t border-border/40" onClick={e => e.stopPropagation()}>
                                                        {historyPhotos[item.id].map((url, pi) => (
                                                            <img
                                                                key={pi}
                                                                src={url}
                                                                alt={`Foto ${pi + 1}`}
                                                                onClick={() => setLightboxUrl(url)}
                                                                className="w-14 h-14 object-cover rounded-md border border-border hover:opacity-90 cursor-zoom-in transition-opacity"
                                                            />
                                                        ))}
                                                        <div className="flex items-center ml-1">
                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                <ImageIcon className="w-3 h-3" />
                                                                {historyPhotos[item.id].length} foto{historyPhotos[item.id].length > 1 ? 's' : ''}
                                                            </span>
                                                        </div>
                                                    </div>
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
                                    const isMonthly = cup.cuponera_type === 'months'
                                    const available = isMonthly ? (cup.total_months || 0) - (cup.used_months || 0) : cup.total_sessions - cup.used_sessions
                                    const isExhausted = available <= 0

                                    const cuponeraRedemptions = isMonthly ? [] : [
                                        ...appointments.filter(a => a.cuponera_id === cup.id).map(a => ({
                                            id: a.id,
                                            date: new Date(a.start_time),
                                            professional: Array.isArray(a.professionals) ? a.professionals[0] : a.professionals,
                                            note: a.notes,
                                            type: 'Turno',
                                            rawEntry: null
                                        })),
                                        ...historyEntries.filter(h => h.notes && h.notes.includes(`[CUPONERA:${cup.id}]`)).map(h => ({
                                            id: h.id,
                                            date: new Date(h.created_at),
                                            professional: Array.isArray(h.professionals) ? h.professionals[0] : h.professionals,
                                            note: h.notes?.replace(`[CUPONERA:${cup.id}] `, ''),
                                            type: 'Canje Manual',
                                            rawEntry: h
                                        }))
                                    ].sort((a, b) => a.date.getTime() - b.date.getTime());

                                    // Calculate end date for monthly cuponeras
                                    const endDate = isMonthly && cup.start_date ? (() => {
                                        const d = new Date(cup.start_date + 'T12:00:00')
                                        d.setMonth(d.getMonth() + (cup.total_months || 0))
                                        return d
                                    })() : null
                                    const daysLeft = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

                                    return (
                                        <div key={cup.id} className={cn(
                                            "border rounded-xl p-5 flex flex-col justify-between transition-opacity",
                                            isExhausted ? "opacity-60 bg-muted/30 border-border/50" : "bg-card border-border shadow-sm hover:border-primary/50"
                                        )}>
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {isMonthly && <CalendarDays className="w-4 h-4 text-primary flex-shrink-0" />}
                                                        <h4 className="font-semibold text-foreground truncate">{service?.name || "Servicio Genérico"}</h4>
                                                    </div>
                                                    {isExhausted ? (
                                                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-red-500/10 text-red-500 rounded border border-red-500/20">{isMonthly ? 'Vencida' : 'Agotada'}</span>
                                                    ) : (
                                                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-green-500/10 text-green-500 rounded border border-green-500/20">{isMonthly ? 'Pase Mensual' : 'Activa'}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mb-4 pl-1">
                                                    {isMonthly
                                                        ? `Inicio: ${new Date(cup.start_date + 'T12:00:00').toLocaleDateString('es-AR')}`
                                                        : `Adquirida el ${new Date(cup.created_at).toLocaleDateString('es-AR')}`
                                                    }
                                                </p>

                                                {/* Aviso vencimiento próximo (mensual) */}
                                                {isMonthly && daysLeft !== null && daysLeft > 0 && daysLeft <= 7 && (
                                                    <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-center gap-2">
                                                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                            ¡Vence en {daysLeft} día{daysLeft !== 1 ? 's' : ''}!
                                                        </span>
                                                    </div>
                                                )}

                                                {isMonthly ? (
                                                    /* Monthly stats display */
                                                    <div className="bg-muted p-3 flex items-center justify-between rounded-lg">
                                                        <div className="text-center w-full">
                                                            <span className="block text-2xl font-bold text-foreground leading-none">{available}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Meses Restantes</span>
                                                        </div>
                                                        <div className="w-px h-8 bg-border"></div>
                                                        <div className="text-center w-full">
                                                            <span className="block text-2xl font-bold text-foreground leading-none">{cup.used_months || 0}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Transcurridos</span>
                                                        </div>
                                                        <div className="w-px h-8 bg-border"></div>
                                                        <div className="text-center w-full">
                                                            <span className="block text-xl font-medium text-muted-foreground/50 leading-none">{cup.total_months}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 block">Total</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* Session stats display */
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
                                                )}

                                                {/* Progress bar */}
                                                {(() => {
                                                    const used = isMonthly ? (cup.used_months || 0) : cup.used_sessions
                                                    const total = isMonthly ? (cup.total_months || 1) : cup.total_sessions
                                                    const pct = total > 0 ? used / total : 0
                                                    return (
                                                        <div className="mt-3">
                                                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                                                <span>{used} de {total} {isMonthly ? 'meses' : 'sesiones'}</span>
                                                                <span>{Math.round(pct * 100)}%</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-full rounded-full transition-all duration-500",
                                                                        isExhausted || pct > 0.75
                                                                            ? "bg-red-500"
                                                                            : pct > 0.5
                                                                                ? "bg-amber-500"
                                                                                : "bg-green-500"
                                                                    )}
                                                                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                                                                />
                                                            </div>
                                                            {isMonthly && endDate && (
                                                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                                                    Vence: {endDate.toLocaleDateString('es-AR')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )
                                                })()}

                                                {!isMonthly && cuponeraRedemptions.length > 0 && (
                                                    <div className="mt-4 pt-4 border-t border-border/50">
                                                        <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Sesiones Consumidas ({cuponeraRedemptions.length})</p>
                                                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                                            {cuponeraRedemptions.map((r, i, arr) => {
                                                                const sessionNumber = Math.max(1, cup.used_sessions - (arr.length - 1 - i));
                                                                return (
                                                                <div key={r.id} className="bg-muted/50 p-2.5 rounded-md border border-border/50">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="text-[10px] font-medium text-foreground">
                                                                            Sesión {sessionNumber} - {r.date.toLocaleDateString('es-AR') + ' ' + r.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                            {r.rawEntry && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        openEditHistoryEntryDirectly(r.rawEntry);
                                                                                    }}
                                                                                    className="text-primary hover:underline hover:text-primary/80 transition-colors ml-2 font-bold cursor-pointer inline-flex items-center gap-0.5"
                                                                                    title="Editar notas o fotos de esta sesión"
                                                                                >
                                                                                    <Pencil className="w-2.5 h-2.5" /> Editar
                                                                                </button>
                                                                            )}
                                                                        </span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] px-1 py-0.5 rounded-sm bg-background border border-border text-muted-foreground">{r.type}</span>
                                                                            {r.professional && (
                                                                                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{r.professional.first_name} {r.professional.last_name}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {r.note && <p className="text-xs text-foreground line-clamp-2 mt-1 whitespace-pre-wrap">{r.note}</p>}
                                                                    {historyPhotos[r.id]?.length > 0 && (
                                                                        <div className="flex gap-1.5 mt-1.5 pb-1">
                                                                            {historyPhotos[r.id].map((url, pi) => (
                                                                                <img
                                                                                    key={pi}
                                                                                    src={url}
                                                                                    alt={`Foto ${pi + 1}`}
                                                                                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                                                                                    className="w-10 h-10 object-cover rounded border border-border hover:opacity-90 cursor-zoom-in transition-opacity"
                                                                                />
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Only show "Consumir Sesión" button for session-type cuponeras */}
                                            {!isMonthly && (
                                                <button
                                                    onClick={() => startConsumeSessionFlow(cup)}
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
                                            )}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 flex flex-col max-h-[100dvh] md:max-h-[90vh]">
                        <div className="p-6 overflow-y-auto">
                            <h3 className="text-lg font-bold text-foreground mb-1">Vender Cuponera</h3>
                            <p className="text-sm text-muted-foreground mb-5">Asigna un paquete de sesiones o un pase mensual al cliente.</p>

                            <form onSubmit={handleCreateCuponera} className="space-y-4">

                            {/* Type toggle */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Tipo de Cuponera</label>
                                <div className="flex bg-muted rounded-lg p-1 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCuponeraForm({ ...cuponeraForm, cuponera_type: 'sessions' })}
                                        className={cn(
                                            "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all cursor-pointer",
                                            cuponeraForm.cuponera_type === 'sessions'
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Por Sesiones
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCuponeraForm({ ...cuponeraForm, cuponera_type: 'months' })}
                                        className={cn(
                                            "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all cursor-pointer",
                                            cuponeraForm.cuponera_type === 'months'
                                                ? "bg-background text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Por Meses
                                    </button>
                                </div>
                            </div>

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

                            {cuponeraForm.cuponera_type === 'sessions' ? (
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
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Cant. Meses</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            max="24"
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={cuponeraForm.total_months}
                                            onChange={e => setCuponeraForm({ ...cuponeraForm, total_months: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Fecha de Inicio</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={cuponeraForm.start_date}
                                            onChange={e => setCuponeraForm({ ...cuponeraForm, start_date: e.target.value })}
                                        />
                                    </div>
                                </>
                            )}
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
                </div>
            )}

            {/* Modal Editar Paciente */}
            {
                isEditModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 flex flex-col max-h-[100dvh] md:max-h-[90vh]">
                            <div className="p-6 overflow-y-auto">
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
                    </div>
                )
            }

            {/* Modal de Nueva Hoja de Historia Clínica */}
            {
                isHistoryModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 flex flex-col max-h-[100dvh] md:max-h-[90vh]">
                            <div className="p-6 overflow-y-auto">
                                <h3 className="text-xl font-bold text-foreground mb-1">
                                    {selectedCuponeraForConsuming
                                        ? `Registrar Sesión: ${historyForm.service_type}`
                                        : 'Cargar Evolución Clínica'
                                    }
                                </h3>
                                <p className="text-sm text-muted-foreground mb-5">
                                    {selectedCuponeraForConsuming
                                        ? `Completá los datos y subí fotos para la Sesión ${selectedCuponeraForConsuming.used_sessions + 1} de este tratamiento.`
                                        : 'Añade una nueva entrada al registro del paciente.'
                                    }
                                </p>

                                <form onSubmit={handleCreateHistory} className="space-y-4">
                                     {/* ¿Asociar a un Tratamiento Activo? */}
                                     {!selectedCuponeraForConsuming && cuponeras.filter(c => c.cuponera_type !== 'months' && c.total_sessions - c.used_sessions > 0).length > 0 && (
                                         <div className="space-y-2">
                                             <label className="text-sm font-medium text-foreground block">
                                                 ¿Asociar y Consumir Sesión de Tratamiento Activo?
                                             </label>
                                             <select
                                                 className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                                                 value={selectedCuponeraForConsuming ? selectedCuponeraForConsuming.id : ''}
                                                 onChange={e => {
                                                     const val = e.target.value;
                                                     if (val === '') {
                                                         setSelectedCuponeraForConsuming(null);
                                                     } else {
                                                         const activeSessionCuponeras = cuponeras.filter(c => c.cuponera_type !== 'months' && c.total_sessions - c.used_sessions > 0);
                                                         const selected = activeSessionCuponeras.find(c => c.id === val);
                                                         if (selected) {
                                                             setSelectedCuponeraForConsuming(selected);
                                                             const sName = (Array.isArray(selected.services) ? selected.services[0] : selected.services)?.name;
                                                             setHistoryForm(prev => ({
                                                                 ...prev,
                                                                 service_type: sName || 'Tratamiento'
                                                             }));
                                                         }
                                                     }
                                                 }}
                                             >
                                                 <option value="">-- No asociar (Visita General sin consumir sesión) --</option>
                                                 {cuponeras.filter(c => c.cuponera_type !== 'months' && c.total_sessions - c.used_sessions > 0).map(c => {
                                                     const sName = (Array.isArray(c.services) ? c.services[0] : c.services)?.name || 'Tratamiento';
                                                     return (
                                                         <option key={c.id} value={c.id}>
                                                             {sName} (Disponible: {c.total_sessions - c.used_sessions} de {c.total_sessions} ses.)
                                                         </option>
                                                     )
                                                 })}
                                             </select>
                                         </div>
                                     )}
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

                                {/* Fotos de la sesión */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                            Fotos de la sesión
                                            <span className="text-muted-foreground font-normal">(máx. 3, opcional)</span>
                                        </label>
                                        <span className="text-xs text-muted-foreground">{pendingPhotos.length}/3</span>
                                    </div>

                                    {pendingPreviews.length > 0 && (
                                        <div className="flex gap-2 flex-wrap">
                                            {pendingPreviews.map((url, idx) => (
                                                <div key={idx} className="relative group w-24 h-24">
                                                    <img
                                                        src={url}
                                                        alt={`Foto ${idx + 1}`}
                                                        className="w-24 h-24 object-cover rounded-lg border border-border"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removePendingPhoto(idx)}
                                                        className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {pendingPhotos.length < 3 && (
                                        <label className="flex items-center gap-2 w-full border border-dashed border-border/70 hover:border-primary/50 rounded-lg p-3 cursor-pointer transition-colors bg-muted/30 hover:bg-primary/5">
                                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">
                                                {pendingPhotos.length === 0 ? 'Agregar foto(s)...' : 'Agregar otra foto...'}
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/heic"
                                                multiple
                                                className="hidden"
                                                onChange={handlePhotoSelect}
                                            />
                                        </label>
                                    )}
                                </div>

                                <div className="pt-4 flex justify-end gap-3">
                                    <button type="button" onClick={() => { setIsHistoryModalOpen(false); setPendingPhotos([]); setPendingPreviews([]); setSelectedCuponeraForConsuming(null); }} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={uploadingPhotos} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
                                        {uploadingPhotos ? (
                                            <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Subiendo fotos...</>
                                        ) : 'Guardar Archivo'}
                                    </button>
                                </div>
                            </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Modal de Lectura / Edición de Historia Clínica */}
            {
                selectedHistoryEntry && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6 flex flex-col max-h-[100dvh] md:max-h-[90vh]">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-4 pb-4 border-b border-border/50">
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">
                                        {isEditingHistory ? 'Editar Entrada Clínica' : (selectedHistoryEntry.service_type || 'Visita General')}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {isEditingHistory
                                            ? 'Modificá los datos de esta entrada clínica.'
                                            : `Evolución del ${new Date(selectedHistoryEntry.created_at).toLocaleDateString('es-AR')} a las ${new Date(selectedHistoryEntry.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                                        }
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedHistoryEntry(null)
                                        setIsEditingHistory(false)
                                        setConfirmDeleteHistory(false)
                                    }}
                                    className="p-2 mb-auto hover:bg-muted rounded-full text-muted-foreground transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* READ MODE */}
                            {!isEditingHistory && (() => {
                                const originalNotes = selectedHistoryEntry.notes || '';
                                let cuponeraInfo = null;
                                let serviceName = '';
                                const match = originalNotes.match(/\[CUPONERA:([^\]]+)\]/);
                                if (match && match[1]) {
                                    const cupId = match[1];
                                    const matchedCup = cuponeras.find(c => c.id === cupId);
                                    if (matchedCup) {
                                        cuponeraInfo = matchedCup;
                                        const s = Array.isArray(matchedCup.services) ? matchedCup.services[0] : matchedCup.services;
                                        serviceName = s?.name || 'Tratamiento';
                                    }
                                }
                                const cleanNotesText = originalNotes.replace(/\[CUPONERA:[^\]]+\]\s*/, '') || 'No se registraron notas en esta evolución.';
                                
                                return (
                                    <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                                        {cuponeraInfo && (
                                            <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <CreditCard className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Sesión de Tratamiento</h4>
                                                        <p className="text-sm text-foreground font-semibold mt-0.5">{serviceName}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-medium">
                                                    Sesiones: {cuponeraInfo.used_sessions} / {cuponeraInfo.total_sessions}
                                                </span>
                                            </div>
                                        )}

                                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Profesional a Cargo</h4>
                                            <p className="text-sm text-foreground font-medium">
                                                {(() => {
                                                    const p = Array.isArray(selectedHistoryEntry.professionals) ? selectedHistoryEntry.professionals[0] : selectedHistoryEntry.professionals
                                                    return p ? `Dr / a. ${p.first_name} ${p.last_name}` : 'Sin registro de profesional'
                                                })()}
                                            </p>
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notas y Evolución</h4>
                                            <div className="bg-background border border-border/50 p-4 rounded-lg text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed min-h-[150px]">
                                                {cleanNotesText}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* EDIT MODE */}
                            {isEditingHistory && (
                                <form onSubmit={handleUpdateHistory} className="overflow-y-auto flex-1 pr-2 space-y-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Fecha de la Visita</label>
                                            <input
                                                type="date"
                                                required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={editHistoryForm.date}
                                                onChange={e => setEditHistoryForm({ ...editHistoryForm, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-sm font-medium text-foreground">Tipo de Visita / Tratamiento</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={editHistoryForm.service_type}
                                                onChange={e => setEditHistoryForm({ ...editHistoryForm, service_type: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Profesional a cargo</label>
                                        <select
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={editHistoryForm.professional_id}
                                            onChange={e => setEditHistoryForm({ ...editHistoryForm, professional_id: e.target.value })}
                                        >
                                            <option value="">-- Sin profesional --</option>
                                            {professionals.map(p => (
                                                <option key={p.id} value={p.id}>Dr/a. {p.first_name} {p.last_name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Notas de la Evolución</label>
                                        <textarea
                                            required
                                            rows={5}
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-y"
                                            value={editHistoryForm.notes}
                                            onChange={e => setEditHistoryForm({ ...editHistoryForm, notes: e.target.value })}
                                        />
                                    </div>

                                    {/* Fotos de la sesión (Edición) */}
                                    <div className="space-y-3 pt-2">
                                        {/* Fotos ya subidas */}
                                        {editingHistoryPhotos.length > 0 && (
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Fotos Subidas</label>
                                                <div className="flex gap-2 flex-wrap">
                                                    {editingHistoryPhotos.map((photo, pidx) => {
                                                        const { data: urlData } = supabase.storage.from('patient-photos').getPublicUrl(photo.storage_path);
                                                        return (
                                                            <div key={photo.id} className="relative group w-24 h-24">
                                                                <img
                                                                    src={urlData.publicUrl}
                                                                    alt={`Foto ${pidx + 1}`}
                                                                    className="w-24 h-24 object-cover rounded-lg border border-border"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeletePhoto(photo)}
                                                                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                                                                    title="Eliminar Foto"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Nuevas fotos pendientes */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                                    Agregar nuevas fotos
                                                    <span className="text-muted-foreground font-normal">(máx. {3 - editingHistoryPhotos.length} más)</span>
                                                </label>
                                                <span className="text-xs text-muted-foreground">{pendingPhotos.length}/{3 - editingHistoryPhotos.length}</span>
                                            </div>

                                            {pendingPreviews.length > 0 && (
                                                <div className="flex gap-2 flex-wrap">
                                                    {pendingPreviews.map((url, idx) => (
                                                        <div key={idx} className="relative group w-24 h-24">
                                                            <img
                                                                src={url}
                                                                alt={`Nueva Foto ${idx + 1}`}
                                                                className="w-24 h-24 object-cover rounded-lg border border-border"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => removePendingPhoto(idx)}
                                                                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {editingHistoryPhotos.length + pendingPhotos.length < 3 && (
                                                <label className="flex items-center gap-2 w-full border border-dashed border-border/70 hover:border-primary/50 rounded-lg p-3 cursor-pointer transition-colors bg-muted/30 hover:bg-primary/5">
                                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                                    <span className="text-sm text-muted-foreground">
                                                        {pendingPhotos.length === 0 ? 'Agregar foto(s)...' : 'Agregar otra foto...'}
                                                    </span>
                                                    <input
                                                        type="file"
                                                        accept="image/jpeg,image/png,image/webp,image/heic"
                                                        multiple
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const files = Array.from(e.target.files || [])
                                                            const remaining = 3 - editingHistoryPhotos.length - pendingPhotos.length
                                                            const toAdd = files.slice(0, remaining)
                                                            setPendingPhotos(prev => [...prev, ...toAdd])
                                                            setPendingPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
                                                            e.target.value = ''
                                                        }}
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-2 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setIsEditingHistory(false); setConfirmDeleteHistory(false); setPendingPhotos([]); setPendingPreviews([]); setEditingHistoryPhotos([]); }}
                                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={uploadingPhotos}
                                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {uploadingPhotos ? (
                                                <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Subiendo fotos...</>
                                            ) : 'Guardar Cambios'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Footer actions (read mode) */}
                            {!isEditingHistory && (
                                <div className="pt-4 mt-4 border-t border-border/50 flex justify-between items-center gap-3">
                                    {/* Delete zone */}
                                    <div className="flex items-center gap-2">
                                        {!confirmDeleteHistory ? (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteHistory(true)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                                            >
                                                <Trash2 className="w-4 h-4" /> Eliminar
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-destructive font-medium">¿Confirmar eliminación?</span>
                                                <button
                                                    type="button"
                                                    onClick={handleDeleteHistory}
                                                    className="px-3 py-1.5 text-sm font-semibold bg-destructive text-white rounded-md hover:bg-destructive/90 transition-colors cursor-pointer"
                                                >
                                                    Sí, eliminar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteHistory(false)}
                                                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                >
                                                    No
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Edit / Close */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const p = Array.isArray(selectedHistoryEntry.professionals) ? selectedHistoryEntry.professionals[0] : selectedHistoryEntry.professionals
                                                setEditHistoryForm({
                                                    service_type: selectedHistoryEntry.service_type || '',
                                                    professional_id: p ? selectedHistoryEntry.professional_id || '' : '',
                                                    notes: (selectedHistoryEntry.notes || '').replace(/\[CUPONERA:[^\]]+\]\s*/, ''),
                                                    date: new Date(selectedHistoryEntry.created_at).toISOString().split('T')[0]
                                                })
                                                setIsEditingHistory(true)
                                                setConfirmDeleteHistory(false)
                                            }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors shadow-sm cursor-pointer"
                                        >
                                            <Pencil className="w-4 h-4" /> Editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedHistoryEntry(null)
                                                setConfirmDeleteHistory(false)
                                            }}
                                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors shadow-sm cursor-pointer"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Modal de Lectura / Edición de Cuponera */}
            {
                selectedCuponera && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 text-left">
                        <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 p-6 flex flex-col max-h-[100dvh] md:max-h-[90vh]">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-4 pb-4 border-b border-border/50">
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">
                                        {isEditingCuponera ? 'Editar Cuponera' : `Detalle de Cuponera`}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {Array.isArray(selectedCuponera.services) ? selectedCuponera.services[0]?.name : selectedCuponera.services?.name}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedCuponera(null)
                                        setIsEditingCuponera(false)
                                        setConfirmDeleteCuponera(false)
                                    }}
                                    className="p-2 mb-auto hover:bg-muted rounded-full text-muted-foreground transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* READ MODE */}
                            {!isEditingCuponera && (
                                <div className="space-y-6 overflow-y-auto flex-1">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                                {(selectedCuponera.cuponera_type === 'months') ? 'Meses' : 'Sesiones'}
                                            </h4>
                                            <p className="text-lg font-bold text-foreground">
                                                {(selectedCuponera.cuponera_type === 'months')
                                                    ? `${selectedCuponera.used_months || 0} / ${selectedCuponera.total_months}`
                                                    : `${selectedCuponera.used_sessions} / ${selectedCuponera.total_sessions}`
                                                }
                                            </p>
                                        </div>
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Número de Factura</h4>
                                            <p className="text-lg font-bold text-foreground text-primary">
                                                {selectedCuponera.invoice_number || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Monto Abonado</h4>
                                            <p className="text-lg font-bold text-foreground">
                                                {selectedCuponera.amount_paid ? `$${selectedCuponera.amount_paid}` : 'N/A'}
                                            </p>
                                        </div>
                                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Estado</h4>
                                            <span className={cn(
                                                "inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide",
                                                selectedCuponera.is_active ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                                            )}>
                                                {selectedCuponera.is_active ? 'Activa' : 'Inactiva'}
                                            </span>
                                        </div>
                                        {selectedCuponera.cuponera_type === 'months' && selectedCuponera.start_date && (
                                            <>
                                                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Fecha Inicio</h4>
                                                    <p className="text-lg font-bold text-foreground">
                                                        {new Date(selectedCuponera.start_date + 'T12:00:00').toLocaleDateString('es-AR')}
                                                    </p>
                                                </div>
                                                <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Fecha Vencimiento</h4>
                                                    <p className="text-lg font-bold text-foreground">
                                                        {(() => {
                                                            const d = new Date(selectedCuponera.start_date + 'T12:00:00')
                                                            d.setMonth(d.getMonth() + (selectedCuponera.total_months || 0))
                                                            return d.toLocaleDateString('es-AR')
                                                        })()}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                                        <div className="flex-1 flex items-center gap-2">
                                            {!confirmDeleteCuponera ? (
                                                <button
                                                    onClick={() => setConfirmDeleteCuponera(true)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Eliminar Cuponera
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-destructive font-bold">¿Borrar definitivamente?</span>
                                                    <button onClick={handleDeleteCuponera} className="bg-destructive text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm hover:bg-destructive/90 transition-colors">Sí, borrar</button>
                                                    <button onClick={() => setConfirmDeleteCuponera(false)} className="text-muted-foreground text-xs hover:text-foreground">Cerrar</button>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <button
                                            onClick={() => setIsEditingCuponera(true)}
                                            className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-shadow shadow-sm cursor-pointer"
                                        >
                                            Editar Datos
                                        </button>
                                        <button
                                            onClick={() => setSelectedCuponera(null)}
                                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shadow-sm cursor-pointer"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* EDIT MODE */}
                            {isEditingCuponera && (
                                <form onSubmit={handleUpdateCuponera} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        {editCuponeraForm.cuponera_type === 'months' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-foreground">Total de Meses</label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="1"
                                                        max="24"
                                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                        value={editCuponeraForm.total_months}
                                                        onChange={e => setEditCuponeraForm({...editCuponeraForm, total_months: parseInt(e.target.value)})}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-foreground">Fecha de Inicio</label>
                                                    <input
                                                        type="date"
                                                        required
                                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                        value={editCuponeraForm.start_date}
                                                        onChange={e => setEditCuponeraForm({...editCuponeraForm, start_date: e.target.value})}
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-foreground">Total de Sesiones</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                    value={editCuponeraForm.total_sessions}
                                                    onChange={e => setEditCuponeraForm({...editCuponeraForm, total_sessions: parseInt(e.target.value)})}
                                                />
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Factura #</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={editCuponeraForm.invoice_number}
                                                onChange={e => setEditCuponeraForm({...editCuponeraForm, invoice_number: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-foreground">Monto Abonado</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                value={editCuponeraForm.amount_paid}
                                                onChange={e => setEditCuponeraForm({...editCuponeraForm, amount_paid: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex items-end pb-2">
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                    checked={editCuponeraForm.is_active}
                                                    onChange={e => setEditCuponeraForm({...editCuponeraForm, is_active: e.target.checked})}
                                                />
                                                <span className="text-sm font-medium text-foreground">Cuponera Activa</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingCuponera(false)}
                                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                        >
                                            Atrás
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer transition-colors"
                                        >
                                            Guardar Cambios
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Modal Saldar Deuda */}
            {isDebtModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-4 border-b border-border/50 bg-muted/30">
                            <h3 className="font-semibold text-foreground flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-primary" /> Saldar Deuda
                            </h3>
                            <button
                                onClick={() => setIsDebtModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-5 space-y-5">
                            <div className="bg-muted p-4 rounded-lg">
                                <p className="text-sm text-foreground">
                                    El paciente registra <strong>{unpaidAppointments.length} sesión(es) impaga(s)</strong>.
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Puedes registrar el pago directo de la deuda, o generar una nueva cuponera que automáticamente absorberá las sesiones correspondientes al mismo servicio.
                                </p>
                            </div>

                            <form onSubmit={handlePayDirectDebt} className="space-y-4">
                                <h4 className="text-sm font-semibold text-foreground pb-2 border-b border-border/40">Pago Directo</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-foreground">Monto Abonado (opcional)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={debtPaymentForm.amount_paid}
                                            onChange={e => setDebtPaymentForm({...debtPaymentForm, amount_paid: e.target.value})}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-foreground">N° Comprobante (opcional)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                            value={debtPaymentForm.receipt_number}
                                            onChange={e => setDebtPaymentForm({...debtPaymentForm, receipt_number: e.target.value})}
                                            placeholder="Opcional"
                                        />
                                    </div>
                                </div>
                                
                                <button
                                    type="submit"
                                    className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                                >
                                    Registrar Pago
                                </button>
                            </form>

                            <div className="pt-4 border-t border-border/40">
                                <h4 className="text-sm font-semibold text-foreground mb-3">Saldar con Nueva Cuponera</h4>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsDebtModalOpen(false);
                                        setIsCuponeraModalOpen(true);
                                    }}
                                    className="w-full py-2.5 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground rounded-md shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Ticket className="w-4 h-4" /> Crear Cuponera
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- Lightbox ---- */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setLightboxUrl(null)}
                >
                    <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="Foto ampliada"
                        onClick={e => e.stopPropagation()}
                        className="max-w-[92vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    />
                </div>
            )}
        </div>
    )
}
