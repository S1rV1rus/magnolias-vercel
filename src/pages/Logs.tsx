import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ActivityLog {
    id: string;
    action: string;
    created_at: string;
    details?: {
        label?: string;
        service?: string;
        professional?: string;
        appointment_time?: string;
    };
}

export function Logs() {
    const [logs, setLogs] = useState<ActivityLog[]>([])
    const [loading, setLoading] = useState(true)

    async function fetchLogs() {
        setLoading(true)
        const { data } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200)
        if (data) setLogs(data)
        setLoading(false)
    }

    useEffect(() => { void fetchLogs() }, []) // eslint-disable-line


    const actionColors: Record<string, string> = {
        turno_confirmado: 'bg-green-500/15 text-green-400 border-green-500/30',
        turno_cancelado: 'bg-red-500/15 text-red-400 border-red-500/30',
        turno_cancelado_tarde: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        turno_completado: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        turno_pendiente: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        turno_eliminado: 'bg-red-500/15 text-red-400 border-red-500/30',
        turno_creado: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    }

    const actionLabels: Record<string, string> = {
        turno_confirmado: 'Confirmado',
        turno_cancelado: 'Cancelado',
        turno_cancelado_tarde: 'Cancelado tarde',
        turno_completado: 'Completado',
        turno_pendiente: 'Pendiente',
        turno_eliminado: 'Cancelado',
        turno_creado: 'Creado',
    }

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Registro de Actividad</h1>
                    <p className="text-muted-foreground mt-1">Historial de acciones realizadas en el sistema.</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-3 py-2 transition-colors cursor-pointer hover:bg-muted/50 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Cargando actividad...</div>
            ) : logs.length === 0 ? (
                <div className="p-8 border border-dashed border-border/50 rounded-lg text-center text-muted-foreground text-sm bg-muted/10">
                    No hay actividad registrada aún. Los cambios de estado de turnos aparecerán aquí.
                </div>
            ) : (
                <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                    {logs.map((log, idx) => {
                        const isLast = idx === logs.length - 1
                        const color = actionColors[log.action] ?? 'bg-muted text-muted-foreground border-border/50'
                        const label = actionLabels[log.action] ?? log.action
                        const ts = new Date(log.created_at)

                        return (
                            <div
                                key={log.id}
                                className={`flex items-start gap-4 px-5 py-3.5 ${!isLast ? 'border-b border-border/40' : ''} hover:bg-muted/20 transition-colors`}
                            >
                                {/* Badge acción */}
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap mt-0.5 ${color}`}>
                                    {label}
                                </span>

                                {/* Mensaje principal */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground">
                                        {log.details?.label ?? log.action}
                                    </p>
                                    {(log.details?.service || log.details?.appointment_time) && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {log.details.service && <>Servicio: {log.details.service}</>}
                                            {log.details.service && log.details.professional && ' · '}
                                            {log.details.professional && <>Prof: {log.details.professional}</>}
                                            {log.details.appointment_time && (
                                                <> · Turno: {log.details.appointment_time}</>
                                            )}
                                        </p>
                                    )}
                                </div>

                                {/* Timestamp — quién + cuándo */}
                                <div className="text-right shrink-0">
                                    <p className="text-xs font-medium text-foreground">
                                        {format(ts, 'HH:mm', { locale: es })}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {format(ts, "dd 'de' MMM", { locale: es })}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
