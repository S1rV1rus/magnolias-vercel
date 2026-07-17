import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { 
    Package, Plus, Pencil, Trash2, X, AlertTriangle, 
    ArrowUpRight, ArrowDownRight, History, Search, Filter, 
    RefreshCw, User, Calendar, FileText, CheckCircle2 
} from 'lucide-react'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface StockItem {
    id: string
    created_at: string
    name: string
    quantity: number
    unit: string
    description: string | null
    min_quantity: number
    is_active: boolean
}

interface StockTransaction {
    id: string
    created_at: string
    item_id: string
    type: 'addition' | 'usage'
    quantity: number
    user_id: string
    user_name: string
    note: string | null
    stock_items?: {
        name: string
        unit: string
    }
}

const emptyItemForm = {
    name: '',
    unit: 'unidades',
    description: '',
    min_quantity: 0 as number | string,
    initial_stock: 0 as number | string
}

const emptyTransactionForm = {
    type: 'usage' as 'addition' | 'usage',
    quantity: 1 as number | string,
    note: ''
}

export function Stock() {
    const { user } = useAuth()
    const [items, setItems] = useState<StockItem[]>([])
    const [transactions, setTransactions] = useState<StockTransaction[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory')
    
    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('')
    const [filterMode, setFilterMode] = useState<'all' | 'low_stock'>('all')
    
    // Modal states
    const [itemModalOpen, setItemModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<StockItem | null>(null)
    const [itemForm, setItemForm] = useState(emptyItemForm)
    
    const [transactionModalOpen, setTransactionModalOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
    const [transactionForm, setTransactionForm] = useState(emptyTransactionForm)
    
    const [itemHistoryOpen, setItemHistoryOpen] = useState(false)
    const [itemHistoryTransactions, setItemHistoryTransactions] = useState<StockTransaction[]>([])
    
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const currentUserId = user?.id
    const defaultStaffName = (() => {
        const nombre: string = user?.user_metadata?.nombre || user?.email || 'Anónimo'
        return nombre
    })()

    // Load data
    async function fetchData() {
        setLoading(true)
        try {
            // Load Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('stock_items')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true })
            
            if (itemsError) throw itemsError
            if (itemsData) setItems(itemsData)

            // Load Transactions (last 150 entries)
            const { data: txData, error: txError } = await supabase
                .from('stock_transactions')
                .select('*, stock_items(name, unit)')
                .order('created_at', { ascending: false })
                .limit(150)

            if (txError) throw txError
            if (txData) setTransactions(txData as StockTransaction[])
        } catch (error) {
            console.error('Error fetching inventory data:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void fetchData()
    }, [])

    // Show temporary success messages
    function triggerSuccess(msg: string) {
        setSuccessMessage(msg)
        setTimeout(() => setSuccessMessage(null), 3000)
    }

    // Handles Stock Item Create or Update
    async function handleSaveItem(e: React.FormEvent) {
        e.preventDefault()
        if (!itemForm.name.trim()) return

        setSaving(true)
        try {
            if (editingItem) {
                // Update
                const { error } = await supabase
                    .from('stock_items')
                    .update({
                        name: itemForm.name.trim(),
                        unit: itemForm.unit.trim(),
                        description: itemForm.description.trim() || null,
                        min_quantity: Number(itemForm.min_quantity)
                    })
                    .eq('id', editingItem.id)

                if (error) throw error
                triggerSuccess('Insumo actualizado exitosamente')
            } else {
                // Create new item
                const { data: newItem, error: createError } = await supabase
                    .from('stock_items')
                    .insert({
                        name: itemForm.name.trim(),
                        unit: itemForm.unit.trim(),
                        description: itemForm.description.trim() || null,
                        min_quantity: Number(itemForm.min_quantity),
                        quantity: Number(itemForm.initial_stock)
                    })
                    .select()
                    .single()

                if (createError) throw createError

                // If initial stock is > 0, register a transaction for auditing
                if (newItem && Number(itemForm.initial_stock) > 0 && currentUserId) {
                    await supabase
                        .from('stock_transactions')
                        .insert({
                            item_id: newItem.id,
                            type: 'addition',
                            quantity: Number(itemForm.initial_stock),
                            user_id: currentUserId,
                            user_name: defaultStaffName,
                            note: 'Stock inicial cargado al registrar el producto'
                        })
                }
                triggerSuccess('Insumo creado exitosamente')
            }
            
            setItemModalOpen(false)
            setEditingItem(null)
            setItemForm(emptyItemForm)
            void fetchData()
        } catch (error) {
            console.error('Error saving stock item:', error)
            alert('Error al guardar el insumo. Por favor, intente de nuevo.')
        } finally {
            setSaving(false)
        }
    }

    // Opens modal for editing an item
    function startEditItem(item: StockItem) {
        setEditingItem(item)
        setItemForm({
            name: item.name,
            unit: item.unit,
            description: item.description || '',
            min_quantity: item.min_quantity,
            initial_stock: item.quantity // Locked or just visual for edit
        })
        setItemModalOpen(true)
    }

    // Archives an item (logical delete): it leaves the inventory but its history is preserved
    async function handleDeleteItem(id: string) {
        try {
            const { error } = await supabase
                .from('stock_items')
                .update({ is_active: false })
                .eq('id', id)

            if (error) throw error
            triggerSuccess('Insumo archivado. Su historial de movimientos se conservó.')
            setConfirmDelete(null)
            void fetchData()
        } catch (error) {
            console.error('Error deleting stock item:', error)
            alert('Error al eliminar el insumo.')
        }
    }

    // Opens modal for registering a transaction (Usage or Addition)
    function startTransaction(item: StockItem, type: 'addition' | 'usage') {
        setSelectedItem(item)
        setTransactionForm({
            type,
            quantity: 1,
            note: ''
        })
        setTransactionModalOpen(true)
    }

    // Handles transaction registration
    async function handleSaveTransaction(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedItem || !currentUserId) return
        if (Number(transactionForm.quantity) <= 0) {
            alert('La cantidad debe ser mayor a 0')
            return
        }

        // For usages, verify if there is enough stock
        if (transactionForm.type === 'usage' && selectedItem.quantity < Number(transactionForm.quantity)) {
            const confirmOveruse = window.confirm(
                `El stock actual (${selectedItem.quantity} ${selectedItem.unit}) es menor que la cantidad que desea consumir (${transactionForm.quantity} ${selectedItem.unit}).\n¿Desea continuar de todos modos?`
            )
            if (!confirmOveruse) return
        }

        // For usages, require a note
        if (transactionForm.type === 'usage' && !transactionForm.note.trim()) {
            alert('Debe ingresar una nota explicando para qué se utilizó el producto (ej: "Utilizado para la Limpieza Facial de Natalia").')
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase
                .from('stock_transactions')
                .insert({
                    item_id: selectedItem.id,
                    type: transactionForm.type,
                    quantity: Number(transactionForm.quantity),
                    user_id: currentUserId,
                    user_name: defaultStaffName,
                    note: transactionForm.note.trim() || null
                })

            if (error) throw error

            triggerSuccess(
                transactionForm.type === 'addition'
                    ? `Se agregaron ${transactionForm.quantity} ${selectedItem.unit} a ${selectedItem.name}`
                    : `Se consumieron ${transactionForm.quantity} ${selectedItem.unit} de ${selectedItem.name}`
            )

            setTransactionModalOpen(false)
            setSelectedItem(null)
            setTransactionForm(emptyTransactionForm)
            void fetchData()
        } catch (error) {
            console.error('Error saving transaction:', error)
            alert('Error al registrar el movimiento.')
        } finally {
            setSaving(false)
        }
    }

    // Load and view transactions for a single item
    async function viewItemHistory(item: StockItem) {
        setSelectedItem(item)
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('stock_transactions')
                .select('*')
                .eq('item_id', item.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            if (data) {
                setItemHistoryTransactions(data as StockTransaction[])
                setItemHistoryOpen(true)
            }
        } catch (error) {
            console.error('Error fetching item history:', error)
        } finally {
            setLoading(false)
        }
    }

    // Filter items based on search and selected filter mode
    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
        
        const matchesFilter = filterMode === 'all' || (item.quantity <= item.min_quantity)
        
        return matchesSearch && matchesFilter
    })

    // Compute stats
    const totalItems = items.length
    const lowStockItemsCount = items.filter(i => i.quantity <= i.min_quantity).length
    
    // Transactions registered today
    const transactionsToday = transactions.filter(t => {
        const date = new Date(t.created_at)
        const today = new Date()
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
    }).length

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Success Toast */}
            {successMessage && (
                <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-semibold">{successMessage}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Package className="w-8 h-8 text-primary" />
                        Control de Stock e Insumos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gestioná el inventario de insumos clínicos, registrá consumos diarios y compras.
                    </p>
                </div>
                <div className="flex gap-2.5">
                    <button
                        onClick={() => {
                            setEditingItem(null)
                            setItemForm(emptyItemForm)
                            setItemModalOpen(true)
                        }}
                        className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Insumo
                    </button>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="inline-flex items-center justify-center p-2.5 text-muted-foreground hover:text-foreground border border-border/60 hover:bg-muted/50 rounded-lg transition-all cursor-pointer"
                        title="Actualizar Datos"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Package className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Insumos Totales</p>
                        <p className="text-2xl font-bold text-foreground mt-0.5">{totalItems}</p>
                    </div>
                </div>

                <div className={cn(
                    "bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4 transition-colors",
                    lowStockItemsCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border/60"
                )}>
                    <div className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center",
                        lowStockItemsCount > 0 ? "bg-red-500/20 text-red-500" : "bg-muted text-muted-foreground"
                    )}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Bajo Stock</p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className={cn("text-2xl font-bold", lowStockItemsCount > 0 ? "text-red-500" : "text-foreground")}>
                                {lowStockItemsCount}
                            </p>
                            {lowStockItemsCount > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-500 border border-red-500/30 px-1.5 py-0.5 rounded-full leading-none">
                                    ¡Alerta!
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <History className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Movimientos de Hoy</p>
                        <p className="text-2xl font-bold text-foreground mt-0.5">{transactionsToday}</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border/50 flex gap-4">
                <button
                    onClick={() => setActiveTab('inventory')}
                    className={cn(
                        "pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer",
                        activeTab === 'inventory' 
                            ? "border-primary text-primary" 
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    Inventario de Insumos
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={cn(
                        "pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer",
                        activeTab === 'history' 
                            ? "border-primary text-primary" 
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    Historial de Movimientos General
                </button>
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'inventory' ? (
                <div className="flex flex-col gap-5">
                    {/* Search & Filter bar */}
                    <div className="flex flex-col md:flex-row gap-3 justify-between">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar insumo..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-background border border-input rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterMode('all')}
                                className={cn(
                                    "px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5",
                                    filterMode === 'all'
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <Filter className="w-3.5 h-3.5" />
                                Todos
                            </button>
                            <button
                                onClick={() => setFilterMode('low_stock')}
                                className={cn(
                                    "px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5",
                                    filterMode === 'low_stock'
                                        ? "bg-red-500 text-white border-red-500 shadow-sm"
                                        : "bg-background border-border text-muted-foreground hover:text-red-500 hover:bg-red-500/5 hover:border-red-500/20"
                                )}
                            >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Bajo Stock
                                {lowStockItemsCount > 0 && (
                                    <span className="ml-1 bg-white/20 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                                        {lowStockItemsCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Inventory Grid */}
                    {loading ? (
                        <div className="p-12 text-center text-muted-foreground text-sm">Cargando inventario...</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="p-12 border border-dashed border-border/50 rounded-xl text-center text-muted-foreground text-sm bg-muted/10">
                            {searchQuery || filterMode !== 'all' 
                                ? 'No se encontraron insumos que coincidan con la búsqueda.' 
                                : 'No hay insumos registrados en el inventario. ¡Agregá uno nuevo para comenzar!'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {filteredItems.map(item => {
                                const isLow = item.quantity <= item.min_quantity
                                return (
                                    <div 
                                        key={item.id} 
                                        className={cn(
                                            "bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between",
                                            isLow ? "border-red-500/20 shadow-red-500/5" : "border-border/60"
                                        )}
                                    >
                                        {/* Card content */}
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="font-bold text-foreground text-lg leading-tight truncate" title={item.name}>
                                                    {item.name}
                                                </h3>
                                                <div className="flex gap-1 shrink-0">
                                                    <button
                                                        onClick={() => startEditItem(item)}
                                                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded transition-colors cursor-pointer"
                                                        title="Editar Insumo"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(item.id)}
                                                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                                                        title="Archivar Insumo"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <p className="text-xs text-muted-foreground mt-1.5 min-h-[2rem] line-clamp-2">
                                                {item.description || 'Sin descripción o especificaciones.'}
                                            </p>

                                            {/* Quantity Badge */}
                                            <div className="mt-4 flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Stock Actual</p>
                                                    <p className={cn(
                                                        "text-2xl font-black mt-0.5",
                                                        isLow ? "text-red-500" : "text-primary"
                                                    )}>
                                                        {item.quantity} <span className="text-sm font-medium text-muted-foreground">{item.unit}</span>
                                                    </p>
                                                </div>
                                                
                                                {isLow && (
                                                    <div className="bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg px-2.5 py-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        Stock Bajo
                                                    </div>
                                                )}
                                            </div>

                                            {/* Min quantity info */}
                                            <div className="mt-3.5 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                                                <span>Alerta a partir de:</span>
                                                <span className="font-semibold text-foreground">{item.min_quantity} {item.unit}</span>
                                            </div>
                                        </div>

                                        {/* Card footer actions */}
                                        <div className="bg-muted/30 border-t border-border/40 px-5 py-3 flex gap-2 justify-between">
                                            <button
                                                onClick={() => viewItemHistory(item)}
                                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold transition-colors cursor-pointer"
                                            >
                                                <History className="w-3.5 h-3.5" />
                                                Historial
                                            </button>
                                            
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => startTransaction(item, 'usage')}
                                                    className="inline-flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                >
                                                    <ArrowDownRight className="w-3.5 h-3.5" />
                                                    Consumir
                                                </button>
                                                <button
                                                    onClick={() => startTransaction(item, 'addition')}
                                                    className="inline-flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                >
                                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                                    Agregar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            ) : (
                /* TAB HISTORIAL GENERAL */
                <div className="flex flex-col gap-4">
                    {loading ? (
                        <div className="p-12 text-center text-muted-foreground text-sm">Cargando historial de movimientos...</div>
                    ) : transactions.length === 0 ? (
                        <div className="p-12 border border-dashed border-border/50 rounded-xl text-center text-muted-foreground text-sm bg-muted/10">
                            No hay movimientos registrados en el sistema aún.
                        </div>
                    ) : (
                        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                            <div className="p-4 bg-muted/20 border-b border-border/50 flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                    <History className="w-4 h-4 text-primary" />
                                    Últimas 150 Transacciones Realizadas
                                </span>
                            </div>
                            
                            <div className="divide-y divide-border/40">
                                {transactions.map((tx) => {
                                    const isAddition = tx.type === 'addition'
                                    const ts = new Date(tx.created_at)
                                    const itemName = tx.stock_items?.name || 'Insumo Eliminado'
                                    const itemUnit = tx.stock_items?.unit || 'unidades'

                                    return (
                                        <div 
                                            key={tx.id} 
                                            className="p-4 hover:bg-muted/10 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Direction indicator icon */}
                                                <div className={cn(
                                                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                                    isAddition ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                                )}>
                                                    {isAddition ? (
                                                        <ArrowUpRight className="w-5 h-5" />
                                                    ) : (
                                                        <ArrowDownRight className="w-5 h-5" />
                                                    )}
                                                </div>
                                                
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {isAddition ? 'Se agregaron' : 'Se consumieron'}{' '}
                                                        <span className={cn("font-bold", isAddition ? "text-emerald-500" : "text-red-500")}>
                                                            {tx.quantity} {itemUnit}
                                                        </span>{' '}
                                                        de <span className="underline decoration-primary/30 underline-offset-2">{itemName}</span>
                                                    </p>
                                                    
                                                    {tx.note && (
                                                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1 bg-muted/30 px-2 py-1 rounded border border-border/30 max-w-xl">
                                                            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60 mt-0.5" />
                                                            <span>Nota: "{tx.note}"</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Audit column: user + timestamp */}
                                            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto text-xs text-muted-foreground gap-2 shrink-0 sm:border-l sm:border-border/30 sm:pl-4">
                                                <span className="flex items-center gap-1 font-medium text-foreground bg-muted/40 px-2 py-0.5 rounded">
                                                    <User className="w-3.5 h-3.5 text-muted-foreground/80" />
                                                    {tx.user_name}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px]">
                                                    <Calendar className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                    {format(ts, "dd 'de' MMM, HH:mm", { locale: es })}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ============================================== */}
            {/* MODALS */}
            {/* ============================================== */}

            {/* MODAL 1: ADD / EDIT ITEM */}
            {itemModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border/80 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/20">
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary" />
                                {editingItem ? 'Editar Insumo' : 'Registrar Nuevo Insumo'}
                            </h2>
                            <button
                                onClick={() => setItemModalOpen(false)}
                                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveItem}>
                            <div className="p-6 space-y-4">
                                {/* Name */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Nombre del Insumo *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: Jeringas 5ml, Algodón, Gel Conductor..."
                                        value={itemForm.name}
                                        onChange={e => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>

                                {/* Unit */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Unidad de Medida *</label>
                                    <select
                                        value={itemForm.unit}
                                        onChange={e => setItemForm(prev => ({ ...prev, unit: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                                    >
                                        <option value="unidades">Unidades (u)</option>
                                        <option value="ml">Mililitros (ml)</option>
                                        <option value="cc">CC (cc)</option>
                                        <option value="cajas">Cajas</option>
                                        <option value="g">Gramos (g)</option>
                                        <option value="litros">Litros (L)</option>
                                    </select>
                                </div>

                                {/* Initial Stock (Only visible when creating) */}
                                {!editingItem && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Stock Inicial Disponible</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={itemForm.initial_stock}
                                            onChange={e => setItemForm(prev => ({ ...prev, initial_stock: e.target.value }))}
                                            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                )}

                                {/* Min quantity alert threshold */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                        Límite Mínimo de Alerta *
                                        <span className="text-[10px] lowercase font-normal text-muted-foreground">(gatilla la alerta de stock bajo)</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        required
                                        value={itemForm.min_quantity}
                                        onChange={e => setItemForm(prev => ({ ...prev, min_quantity: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Descripción o Especificaciones</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Detalles sobre marca, proveedor o uso particular..."
                                        value={itemForm.description}
                                        onChange={e => setItemForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-none"
                                    />
                                </div>
                            </div>

                            <div className="bg-muted/20 border-t border-border/50 px-6 py-4 flex justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setItemModalOpen(false)}
                                    className="px-4 py-2 border border-border/60 hover:bg-muted/50 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-75"
                                >
                                    {saving ? 'Guardando...' : 'Guardar Insumo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: REGISTER TRANSACTION (CONSUME / ADD) */}
            {transactionModalOpen && selectedItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border/80 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className={cn(
                            "flex items-center justify-between px-6 py-4 border-b border-border/50",
                            transactionForm.type === 'usage' ? "bg-red-500/10" : "bg-emerald-500/10"
                        )}>
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                {transactionForm.type === 'usage' ? (
                                    <>
                                        <ArrowDownRight className="w-5 h-5 text-red-500" />
                                        Consumir de: {selectedItem.name}
                                    </>
                                ) : (
                                    <>
                                        <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                                        Agregar Stock a: {selectedItem.name}
                                    </>
                                )}
                            </h2>
                            <button
                                onClick={() => {
                                    setTransactionModalOpen(false)
                                    setSelectedItem(null)
                                }}
                                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTransaction}>
                            <div className="p-6 space-y-4">
                                {/* Informative Stock Bar */}
                                <div className="bg-muted/20 border border-border/40 rounded-lg p-3 text-xs flex justify-between">
                                    <span>Stock actual:</span>
                                    <span className="font-bold text-foreground">{selectedItem.quantity} {selectedItem.unit}</span>
                                </div>

                                {/* Quantity */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                        Cantidad a {transactionForm.type === 'usage' ? 'retirar' : 'agregar'} ({selectedItem.unit}) *
                                    </label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="any"
                                        required
                                        value={transactionForm.quantity}
                                        onChange={e => setTransactionForm(prev => ({ ...prev, quantity: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                    />
                                </div>

                                {/* Operator/Staff Name — automatic, taken from the logged-in user */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Personal Responsable</label>
                                    <input
                                        type="text"
                                        readOnly
                                        disabled
                                        value={defaultStaffName}
                                        className="w-full bg-muted/40 border border-input rounded-lg px-3 py-2 text-sm text-muted-foreground cursor-not-allowed outline-none"
                                    />
                                    <p className="text-[11px] text-muted-foreground mt-1">Se registra automáticamente con tu usuario.</p>
                                </div>

                                {/* Note */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                        Nota / Justificación {transactionForm.type === 'usage' && '*'}
                                    </label>
                                    <textarea
                                        rows={3}
                                        required={transactionForm.type === 'usage'}
                                        placeholder={
                                            transactionForm.type === 'usage'
                                                ? 'Ej: "Utilizado para la Limpieza Facial de Natalia" (Obligatorio)'
                                                : 'Ej: "Compra de lote de insumos a Distribuidora" (Opcional)'
                                        }
                                        value={transactionForm.note}
                                        onChange={e => setTransactionForm(prev => ({ ...prev, note: e.target.value }))}
                                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none resize-none"
                                    />
                                </div>
                            </div>

                            <div className="bg-muted/20 border-t border-border/50 px-6 py-4 flex justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTransactionModalOpen(false)
                                        setSelectedItem(null)
                                    }}
                                    className="px-4 py-2 border border-border/60 hover:bg-muted/50 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className={cn(
                                        "px-5 py-2 text-white rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-75",
                                        transactionForm.type === 'usage' ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
                                    )}
                                >
                                    {saving ? 'Registrando...' : 'Registrar Movimiento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: INDIVIDUAL ITEM HISTORY */}
            {itemHistoryOpen && selectedItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border/80 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/20">
                            <div>
                                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                    <History className="w-5 h-5 text-primary" />
                                    Historial: {selectedItem.name}
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Stock actual: {selectedItem.quantity} {selectedItem.unit}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setItemHistoryOpen(false)
                                    setSelectedItem(null)
                                    setItemHistoryTransactions([])
                                }}
                                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {itemHistoryTransactions.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    No hay movimientos registrados para este insumo.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {itemHistoryTransactions.map(tx => {
                                        const isAddition = tx.type === 'addition'
                                        const ts = new Date(tx.created_at)
                                        return (
                                            <div 
                                                key={tx.id} 
                                                className="p-3 border border-border/40 rounded-lg flex flex-col gap-2 bg-background"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={cn(
                                                        "text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1",
                                                        isAddition ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {isAddition ? '+' : '-'}{tx.quantity} {selectedItem.unit}
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                        {format(ts, "dd 'de' MMM, HH:mm", { locale: es })}
                                                    </span>
                                                </div>
                                                
                                                {tx.note && (
                                                    <p className="text-xs text-foreground bg-muted/30 p-2 rounded italic">
                                                        "{tx.note}"
                                                    </p>
                                                )}

                                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-end">
                                                    <User className="w-3 h-3 text-muted-foreground/60" />
                                                    <span>Registrado por: <strong>{tx.user_name}</strong></span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-muted/20 border-t border-border/50 px-6 py-4 flex justify-end">
                            <button
                                onClick={() => {
                                    setItemHistoryOpen(false)
                                    setSelectedItem(null)
                                    setItemHistoryTransactions([])
                                }}
                                className="px-5 py-2 bg-muted hover:bg-muted/80 border border-border/60 rounded-lg text-sm font-semibold text-foreground transition-all cursor-pointer"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRM DELETE MODAL */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border/80 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-foreground">¿Archivar Insumo?</h3>
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                    El insumo dejará de aparecer en el inventario, pero su historial de movimientos se conserva para mantener la trazabilidad.
                                </p>
                            </div>
                        </div>
                        <div className="bg-muted/20 border-t border-border/50 px-6 py-4 flex justify-end gap-2.5">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 border border-border/60 hover:bg-muted/50 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDeleteItem(confirmDelete)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer"
                            >
                                Sí, Archivar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
