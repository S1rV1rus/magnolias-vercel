import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Pin, PinOff, Pencil, Trash2, X, AlertTriangle, StickyNote, BookOpen, Clock, Filter, Eye, Users } from 'lucide-react'
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

interface BlogRead {
    id: string
    note_id: string
    user_id: string
    user_name: string
    read_at: string
}

const COLOR_OPTIONS = [
    { value: 'yellow', label: 'Protocolos',   category: 'Protocolos',                           bg: 'bg-yellow-100 dark:bg-yellow-900/40', border: 'border-t-yellow-400', dot: 'bg-yellow-400', text: 'text-yellow-900 dark:text-yellow-100' },
    { value: 'red',    label: 'Alerta',        category: 'Alerta en rojo',                        bg: 'bg-red-100 dark:bg-red-900/40',       border: 'border-t-red-500',    dot: 'bg-red-500',    text: 'text-red-900 dark:text-red-100' },
    { value: 'green',  label: 'Descuentos',    category: 'Información sobre descuentos',          bg: 'bg-green-100 dark:bg-green-900/40',   border: 'border-t-green-500',  dot: 'bg-green-500',  text: 'text-green-900 dark:text-green-100' },
    { value: 'blue',   label: 'Tratamientos',  category: 'Información sobre tratamientos',        bg: 'bg-blue-100 dark:bg-blue-900/40',     border: 'border-t-blue-500',   dot: 'bg-blue-500',   text: 'text-blue-900 dark:text-blue-100' },
    { value: 'purple', label: 'Para leer',     category: 'Información relevante para ir leyendo', bg: 'bg-violet-100 dark:bg-violet-900/40', border: 'border-t-violet-500', dot: 'bg-violet-500', text: 'text-violet-900 dark:text-violet-100' },
    { value: 'orange', label: 'General',       category: 'General',                               bg: 'bg-orange-100 dark:bg-orange-900/40', border: 'border-t-orange-500', dot: 'bg-orange-500', text: 'text-orange-900 dark:text-orange-100' },
]

function getColorClasses(color: string) {
    return COLOR_OPTIONS.find(c => c.value === color) || COLOR_OPTIONS[0]
}

const emptyForm = { title: '', content: '', color: 'yellow' }

const CONTENT_PREVIEW_LENGTH = 300
const CONTENT_MAX_LENGTH = 20000

export function Blog() {
    const { user } = useAuth()
    const [notes, setNotes] = useState<BlogNote[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [readingNote, setReadingNote] = useState<BlogNote | null>(null)
    const [editingNote, setEditingNote] = useState<BlogNote | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [activeFilter, setActiveFilter] = useState<string | null>(null)
    const [reads, setReads] = useState<Record<string, BlogRead[]>>({})

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

    async function fetchAllReads() {
        const { data } = await supabase
            .from('blog_reads')
            .select('*')
            .order('read_at', { ascending: true })
        if (data) {
            const grouped: Record<string, BlogRead[]> = {}
            for (const r of data) {
                if (!grouped[r.note_id]) grouped[r.note_id] = []
                grouped[r.note_id].push(r)
            }
            setReads(grouped)
        }
    }

    async function registerRead(noteId: string) {
        if (!currentUserId) return
        await supabase.from('blog_reads').upsert(
            {
                note_id: noteId,
                user_id: currentUserId,
                user_name: userName,
            },
            { onConflict: 'note_id,user_id' }
        )
        void fetchAllReads()
    }

    useEffect(() => {
        void fetchNotes()
        void fetchAllReads()
    }, [])

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
        setReadingNote(null)
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

    const readingColors = readingNote ? getColorClasses(readingNote.color) : null
    const readingIsAlert = readingNote?.color === 'red'
    const readingIsAuthor = readingNote?.auth_user_id === currentUserId

    function estimateReadingTime(text: string): string {
        const words = text.trim().split(/\s+/).length
        const minutes = Math.max(1, Math.round(words / 200))
        return `${minutes} min de lectura`
    }

    const filteredNotes = activeFilter
        ? notes.filter(n => n.color === activeFilter)
        : notes

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Blog Interno</h1>
                    <p className="text-muted-foreground mt-1">Notas y artículos para todo el equipo.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                >
                    <Plus className="w-4 h-4" /> Nueva Nota
                </button>
            </div>

            {/* Category filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                <button
                    onClick={() => setActiveFilter(null)}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border",
                        activeFilter === null
                            ? "bg-foreground text-background border-foreground shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                    )}
                >
                    Todas
                </button>
                {COLOR_OPTIONS.map(c => (
                    <button
                        key={c.value}
                        onClick={() => setActiveFilter(activeFilter === c.value ? null : c.value)}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border",
                            activeFilter === c.value
                                ? `${c.bg} ${c.text} border-current shadow-sm ring-1 ring-current/20`
                                : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted"
                        )}
                    >
                        <div className={cn("w-2 h-2 rounded-full shrink-0", c.dot)} />
                        {c.category}
                    </button>
                ))}
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
                    {filteredNotes.map(note => {
                        const colors = getColorClasses(note.color)
                        const isAuthor = note.auth_user_id === currentUserId
                        const isAlert = note.color === 'red'
                        const isLong = note.content.length > CONTENT_PREVIEW_LENGTH

                        return (
                            <div
                                key={note.id}
                                onClick={() => { setReadingNote(note); void registerRead(note.id) }}
                                className={cn(
                                    "break-inside-avoid group relative rounded-lg border-t-4 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer",
                                    colors.bg,
                                    colors.border,
                                    isAlert && "ring-1 ring-red-400/30",
                                    note.is_pinned && "ring-1 ring-primary/20"
                                )}
                                style={{ transform: `rotate(${(note.id.charCodeAt(0) % 3 - 1) * 0.5}deg)` }}
                            >
                                {note.is_pinned && (
                                    <div className="absolute -top-2 -right-1 z-10">
                                        <Pin className="w-4 h-4 text-primary fill-primary rotate-45" />
                                    </div>
                                )}

                                <div className="p-4">
                                    {/* Category badge */}
                                    <div className="flex items-center gap-1.5 mb-2">
                                        {isAlert && (
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                                        )}
                                        <span className={cn("text-[10px] font-bold uppercase tracking-wider opacity-60", colors.text)}>
                                            {colors.category}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h3 className={cn("font-bold text-sm leading-snug", colors.text)}>
                                        {note.title}
                                    </h3>

                                    {/* Content preview */}
                                    {note.content && (
                                        <p className={cn("text-xs mt-2 leading-relaxed opacity-80", colors.text)}>
                                            {isLong ? note.content.slice(0, CONTENT_PREVIEW_LENGTH) + '…' : note.content}
                                        </p>
                                    )}

                                    {isLong && (
                                        <div className={cn("flex items-center gap-1 mt-2 text-[10px] font-medium opacity-55", colors.text)}>
                                            <BookOpen className="w-3 h-3" />
                                            <span>Leer artículo completo</span>
                                        </div>
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
                                        {/* Read count */}
                                        {(reads[note.id]?.length ?? 0) > 0 && (
                                            <div className="flex items-center gap-1 opacity-45">
                                                <Eye className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">{reads[note.id].length}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action buttons (on hover) — stop propagation so they don't open the reader */}
                                    <div
                                        className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={e => e.stopPropagation()}
                                    >
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

            {/* Article Reading Modal */}
            {readingNote && readingColors && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
                    onClick={() => { setReadingNote(null); setConfirmDelete(null) }}
                >
                    <div
                        className={cn(
                            "w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl shadow-2xl border-t-4 overflow-hidden animate-in zoom-in-95 duration-200",
                            readingColors.bg,
                            readingColors.border
                        )}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Reading header */}
                        <div className="flex items-start justify-between p-6 pb-4 shrink-0">
                            <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2 mb-3">
                                    {readingIsAlert && (
                                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                    )}
                                    <span className={cn("text-xs font-bold uppercase tracking-wider opacity-60", readingColors.text)}>
                                        {readingColors.category}
                                    </span>
                                </div>
                                <h2 className={cn("text-xl font-bold leading-snug", readingColors.text)}>
                                    {readingNote.title}
                                </h2>
                                <div className="flex items-center gap-2 mt-3">
                                    <div className="w-5 h-5 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center">
                                        <span className="text-[9px] font-bold opacity-70">{readingNote.author_name.charAt(0).toUpperCase()}</span>
                                    </div>
                                    <span className={cn("text-xs opacity-50 font-medium", readingColors.text)}>{readingNote.author_name}</span>
                                    <span className={cn("text-xs opacity-30", readingColors.text)}>·</span>
                                    <span className={cn("text-xs opacity-40", readingColors.text)}>{timeAgo(readingNote.created_at)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                {readingIsAuthor && (
                                    <>
                                        <button
                                            onClick={() => { setReadingNote(null); openEdit(readingNote) }}
                                            className="p-2 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer"
                                            title="Editar"
                                        >
                                            <Pencil className="w-4 h-4 opacity-70" />
                                        </button>
                                        {confirmDelete === readingNote.id ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleDelete(readingNote.id)}
                                                    className="text-[10px] px-2 py-1.5 rounded bg-red-600 text-white font-bold cursor-pointer"
                                                >Sí</button>
                                                <button
                                                    onClick={() => setConfirmDelete(null)}
                                                    className="text-[10px] px-2 py-1.5 opacity-60 cursor-pointer"
                                                >No</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDelete(readingNote.id)}
                                                className="p-2 rounded-md bg-black/5 dark:bg-white/10 hover:bg-red-500/20 transition-colors cursor-pointer"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-4 h-4 opacity-70" />
                                            </button>
                                        )}
                                    </>
                                )}
                                <button
                                    onClick={() => { setReadingNote(null); setConfirmDelete(null) }}
                                    className="p-2 rounded-md bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors cursor-pointer ml-1"
                                >
                                    <X className="w-4 h-4 opacity-70" />
                                </button>
                            </div>
                        </div>

                        {/* Article content */}
                        <div className="flex-1 overflow-y-auto px-6 pb-8">
                            <div className={cn("border-t border-black/10 dark:border-white/10 pt-5", readingColors.text)}>
                                {readingNote.content && (
                                    <div className="flex items-center gap-2 mb-4 opacity-50">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-xs font-medium">{estimateReadingTime(readingNote.content)}</span>
                                        <span className="text-xs">·</span>
                                        <span className="text-xs">{readingNote.content.length.toLocaleString('es-AR')} caracteres</span>
                                    </div>
                                )}
                                {readingNote.content ? (
                                    <div className="prose-article">
                                        {readingNote.content.split('\n\n').map((paragraph, idx) => (
                                            paragraph.trim() && (
                                                <p key={idx} className="text-sm leading-[1.8] mb-4 opacity-90">
                                                    {paragraph.split('\n').map((line, lidx, arr) => (
                                                        <span key={lidx}>
                                                            {line}
                                                            {lidx < arr.length - 1 && <br />}
                                                        </span>
                                                    ))}
                                                </p>
                                            )
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm opacity-40 italic">Sin contenido adicional.</p>
                                )}
                            </div>

                            {/* Readers section */}
                            {(reads[readingNote.id]?.length ?? 0) > 0 && (
                                <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Users className={cn("w-4 h-4 opacity-50", readingColors.text)} />
                                        <span className={cn("text-xs font-semibold opacity-60", readingColors.text)}>
                                            Leído por {reads[readingNote.id].length} {reads[readingNote.id].length === 1 ? 'persona' : 'personas'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {reads[readingNote.id].map(r => (
                                            <div
                                                key={r.id}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10"
                                                title={`Leído ${new Date(r.read_at).toLocaleString('es-AR')}`}
                                            >
                                                <div className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center shrink-0">
                                                    <span className="text-[7px] font-bold opacity-70">{r.user_name.charAt(0).toUpperCase()}</span>
                                                </div>
                                                <span className={cn("text-[10px] font-medium opacity-70", readingColors.text)}>
                                                    {r.user_name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 pb-4 border-b border-border/50 shrink-0">
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

                        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
                            {/* Category / Color selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Categoría</label>
                                <div className="flex gap-2 flex-wrap">
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
                                            title={c.category}
                                        >
                                            {c.value === 'red' && form.color === 'red' && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-white" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span className={cn("w-2 h-2 rounded-full inline-block shrink-0", getColorClasses(form.color).dot)} />
                                    {getColorClasses(form.color).category}
                                    {form.color === 'red' && (
                                        <span className="text-red-500 font-medium flex items-center gap-0.5 ml-1">
                                            — <AlertTriangle className="w-3 h-3 mx-0.5" /> Se verá como alerta para todas.
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Título</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={300}
                                    placeholder="Ej: Nuevo protocolo de atención"
                                    className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground flex justify-between items-baseline">
                                    <span>Contenido del artículo</span>
                                    <span className={cn(
                                        "text-xs font-normal tabular-nums",
                                        form.content.length > CONTENT_MAX_LENGTH * 0.9 ? "text-red-500" : "text-muted-foreground"
                                    )}>
                                        {form.content.length.toLocaleString('es-AR')} / {CONTENT_MAX_LENGTH.toLocaleString('es-AR')}
                                    </span>
                                </label>
                                <textarea
                                    rows={14}
                                    maxLength={CONTENT_MAX_LENGTH}
                                    placeholder="Escribí el contenido del artículo. Podés desarrollar con todo el detalle que necesites.&#10;&#10;Usá doble Enter para separar párrafos. Al abrir la nota, se verá con formato de artículo estilo blog."
                                    className="w-full bg-background border border-input rounded-md px-3 py-2.5 text-sm text-foreground leading-relaxed focus:ring-1 focus:ring-primary outline-none resize-y min-h-[200px]"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    💡 Tip: Separá los párrafos con doble Enter para una mejor lectura.
                                </p>
                            </div>

                            {/* Preview */}
                            {form.title.trim() && (
                                <div className={cn(
                                    "rounded-lg border-t-4 p-3 shadow-sm",
                                    getColorClasses(form.color).bg,
                                    getColorClasses(form.color).border,
                                )}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        {form.color === 'red' && (
                                            <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                        )}
                                        <span className={cn("text-[9px] font-bold uppercase tracking-wider opacity-60", getColorClasses(form.color).text)}>
                                            {getColorClasses(form.color).category}
                                        </span>
                                    </div>
                                    <p className={cn("text-xs font-bold", getColorClasses(form.color).text)}>{form.title}</p>
                                    {form.content.trim() && (
                                        <p className={cn("text-[10px] mt-1 opacity-70 line-clamp-3", getColorClasses(form.color).text)}>
                                            {form.content}
                                        </p>
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
