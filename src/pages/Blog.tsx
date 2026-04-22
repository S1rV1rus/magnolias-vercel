import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Pin, PinOff, Pencil, Trash2, X, AlertTriangle, StickyNote } from 'lucide-react'
import { cn } from '../lib/utils'

interface BlogNote {
    id: string
    created_at: string
    author_name: string
    auth_user_id: string | null
    title: string
    content: string
    color: string
    is_pinned: boolean
}

const COLOR_OPTIONS = [
    { value: 'yellow',  label: 'Amarillo', bg: 'bg-yellow-100 dark:bg-yellow-900/40', border: 'border-t-yellow-400',   dot: 'bg-yellow-400',  text: 'text-yellow-900 dark:text-yellow-100' },
    { value: 'red',     label: 'Rojo',     bg: 'bg-red-100 dark:bg-red-900/40',       border: 'border-t-red-500',      dot: 'bg-red-500',     text: 'text-red-900 dark:text-red-100' },
    { value: 'green',   label: 'Verde',    bg: 'bg-green-100 dark:bg-green-900/40',   border: 'border-t-green-500',    dot: 'bg-green-500',   text: 'text-green-900 dark:text-green-100' },
    { value: 'blue',    label: 'Azul',     bg: 'bg-blue-100 dark:bg-blue-900/40',     border: 'border-t-blue-500',     dot: 'bg-blue-500',    text: 'text-blue-900 dark:text-blue-100' },
    { value: 'purple',  label: 'Violeta',  bg: 'bg-violet-100 dark:bg-violet-900/40', border: 'border-t-violet-500',   dot: 'bg-violet-500',  text: 'text-violet-900 dark:text-violet-100' },
    { value: 'orange',  label: 'Naranja',  bg: 'bg-orange-100 dark:bg-orange-900/40', border: 'border-t-orange-500',   dot: 'bg-orange-500',  text: 'text-orange-900 dark:text-orange-100' },
]

function getColorClasses(color: string) {
    return COLOR_OPTIONS.find(c => c.value === color) || COLOR_OPTIONS[0]
}

const emptyForm = { title: '', content: '', color: 'yellow' }

export function Blog() {
    const { user } = useAuth()
    const [notes, setNotes] = useState<BlogNote[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingNote, setEditingNote] = useState<BlogNote | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    const currentUserId = user?.id

    const userName = (() => {
        const nombre: string = user?.user_metadata?.nombre || user?.email || 'Anónimo'
        return nombre.split(' ')[0]
    })()

    async function fetchNotes() {
        setLoading(true)
        const { data } = await supabase
            .from('blog_notes')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
        if (data) setNotes(data)
        setLoading(false)
    }

    useEffect(() => { void fetchNotes() }, [])

    function openCreate() {
        setEditingNote(null)
        setForm(emptyForm)
        setModalOpen(true)
    }

    function openEdit(note: BlogNote) {
        setEditingNote(note)
        setForm({ title: note.title, content: note.content, color: note.color })
        setModalOpen(true)
    }

    function closeModal() {
        setModalOpen(false)
        setEditingNote(null)
        setForm(emptyForm)
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)

        if (editingNote) {
            await supabase.from('blog_notes').update({
                title: form.title.trim(),
                content: form.content.trim(),
                color: form.color,
            }).eq('id', editingNote.id)
        } else {
            await supabase.from('blog_notes').insert({
                title: form.title.trim(),
                content: form.content.trim(),
                color: form.color,
                author_name: userName,
                auth_user_id: currentUserId,
            })
        }

        setSaving(false)
        closeModal()
        void fetchNotes()
    }

    async function handleTogglePin(note: BlogNote) {
        await supabase.from('blog_notes').update({ is_pinned: !note.is_pinned }).eq('id', note.id)
        void fetchNotes()
    }

    async function handleDelete(id: string) {
        await supabase.from('blog_notes').delete().eq('id', id)
        setConfirmDelete(null)
        void fetchNotes()
    }

    function timeAgo(dateStr: string) {
        const now = new Date()
        const d = new Date(dateStr)
        const diffMs = now.getTime() - d.getTime()
        const mins = Math.floor(diffMs / 60000)
        if (mins < 1) return 'Justo ahora'
        if (mins < 60) return `Hace ${mins}m`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `Hace ${hours}h`
        const days = Math.floor(hours / 24)
        if (days < 7) return `Hace ${days}d`
        return d.toLocaleDateString('es-AR')
    }

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Blog Interno</h1>
                    <p className="text-muted-foreground mt-1">Notas y alertas para todo el equipo.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                >
                    <Plus className="w-4 h-4" /> Nueva Nota
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="p-12 text-center text-muted-foreground text-sm">Cargando notas...</div>
            ) : notes.length === 0 ? (
                <div className="p-12 border border-dashed border-border/50 rounded-xl text-center text-muted-foreground bg-muted/10">
                    <StickyNote className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No hay notas todavía.</p>
                    <p className="text-xs mt-1">Creá la primera haciendo clic en "Nueva Nota".</p>
                </div>
            ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
                    {notes.map(note => {
                        const colors = getColorClasses(note.color)
                        const isAuthor = note.auth_user_id === currentUserId
                        const isAlert = note.color === 'red'

                        return (
                            <div
                                key={note.id}
                                className={cn(
                                    "break-inside-avoid group relative rounded-lg border-t-4 shadow-md hover:shadow-lg transition-all duration-200",
                                    colors.bg,
                                    colors.border,
                                    isAlert && "ring-1 ring-red-400/30",
                                    note.is_pinned && "ring-1 ring-primary/20"
                                )}
                                style={{ transform: `rotate(${(note.id.charCodeAt(0) % 3 - 1) * 0.5}deg)` }}
                            >
                                {/* Pin indicator */}
                                {note.is_pinned && (
                                    <div className="absolute -top-2 -right-1 z-10">
                                        <Pin className="w-4 h-4 text-primary fill-primary rotate-45" />
                                    </div>
                                )}

                                <div className="p-4">
                                    {/* Alert icon for red notes */}
                                    {isAlert && (
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Alerta</span>
                                        </div>
                                    )}

                                    {/* Title */}
                                    <h3 className={cn("font-bold text-sm leading-snug", colors.text)}>
                                        {note.title}
                                    </h3>

                                    {/* Content */}
                                    {note.content && (
                                        <p className={cn("text-xs mt-2 whitespace-pre-wrap leading-relaxed opacity-80", colors.text)}>
                                            {note.content}
                                        </p>
                                    )}

                                    {/* Footer */}
                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center">
                                                <span className="text-[8px] font-bold opacity-70">{note.author_name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <span className="text-[10px] opacity-50 font-medium">{note.author_name}</span>
                                            <span className="text-[10px] opacity-30">·</span>
                                            <span className="text-[10px] opacity-40">{timeAgo(note.created_at)}</span>
                                        </div>
                                    </div>

                                    {/* Action buttons (on hover) */}
                                    <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleTogglePin(note)}
                                            className="p-1.5 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer"
                                            title={note.is_pinned ? 'Despinear' : 'Pinear'}
                                        >
                                            {note.is_pinned
                                                ? <PinOff className="w-3 h-3 opacity-70" />
                                                : <Pin className="w-3 h-3 opacity-70" />
                                            }
                                        </button>
                                        {isAuthor && (
                                            <>
                                                <button
                                                    onClick={() => openEdit(note)}
                                                    className="p-1.5 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-3 h-3 opacity-70" />
                                                </button>
                                                {confirmDelete === note.id ? (
                                                    <div className="flex items-center gap-1 ml-1">
                                                        <button
                                                            onClick={() => handleDelete(note.id)}
                                                            className="text-[9px] px-1.5 py-1 rounded bg-red-600 text-white font-bold cursor-pointer"
                                                        >Sí</button>
                                                        <button
                                                            onClick={() => setConfirmDelete(null)}
                                                            className="text-[9px] px-1.5 py-1 opacity-60 cursor-pointer"
                                                        >No</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDelete(note.id)}
                                                        className="p-1.5 rounded-md bg-black/5 dark:bg-white/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-3 h-3 opacity-70" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-border/50">
                            <h3 className="text-lg font-bold text-foreground">
                                {editingNote ? 'Editar Nota' : 'Nueva Nota'}
                            </h3>
                            <button
                                onClick={closeModal}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-5 space-y-4">
                            {/* Color selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Color</label>
                                <div className="flex gap-2">
                                    {COLOR_OPTIONS.map(c => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => setForm({ ...form, color: c.value })}
                                            className={cn(
                                                "w-8 h-8 rounded-full transition-all cursor-pointer flex items-center justify-center",
                                                c.dot,
                                                form.color === c.value
                                                    ? "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110"
                                                    : "opacity-60 hover:opacity-100"
                                            )}
                                            title={c.label}
                                        >
                                            {c.value === 'red' && form.color === 'red' && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-white" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {form.color === 'red' && (
                                    <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                                        <AlertTriangle className="w-3 h-3" /> Esta nota se verá como alerta para todos.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Título</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={100}
                                    placeholder="Ej: Ojo con Pili"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between">
                                    Contenido
                                    <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                </label>
                                <textarea
                                    rows={4}
                                    maxLength={500}
                                    placeholder="Detalles de la nota..."
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-none"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                />
                            </div>

                            {/* Preview */}
                            {form.title.trim() && (
                                <div className={cn(
                                    "rounded-lg border-t-4 p-3 shadow-sm",
                                    getColorClasses(form.color).bg,
                                    getColorClasses(form.color).border,
                                )}>
                                    {form.color === 'red' && (
                                        <div className="flex items-center gap-1 mb-1">
                                            <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                            <span className="text-[9px] font-bold uppercase text-red-600 dark:text-red-400">Alerta</span>
                                        </div>
                                    )}
                                    <p className={cn("text-xs font-bold", getColorClasses(form.color).text)}>{form.title}</p>
                                    {form.content.trim() && (
                                        <p className={cn("text-[10px] mt-1 opacity-70", getColorClasses(form.color).text)}>{form.content}</p>
                                    )}
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
                                    {saving ? 'Guardando...' : editingNote ? 'Guardar Cambios' : 'Publicar Nota'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
