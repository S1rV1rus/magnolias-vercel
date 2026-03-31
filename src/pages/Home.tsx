import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Calendar, Save, CheckCircle2, Clock, Copy, ChevronRight } from 'lucide-react'

const DAYS_OF_WEEK = [
    { key: 'monday', label: 'Lunes', short: 'Lun' },
    { key: 'tuesday', label: 'Martes', short: 'Mar' },
    { key: 'wednesday', label: 'Miércoles', short: 'Mié' },
    { key: 'thursday', label: 'Jueves', short: 'Jue' },
    { key: 'friday', label: 'Viernes', short: 'Vie' },
    { key: 'saturday', label: 'Sábado', short: 'Sáb' },
]

const MONTHS = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' },
]

const MONTH_ABBR = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const makeEmptyWeek = () => ({
    monday: { active: false, start: '09:00', end: '18:00' },
    tuesday: { active: false, start: '09:00', end: '18:00' },
    wednesday: { active: false, start: '09:00', end: '18:00' },
    thursday: { active: false, start: '09:00', end: '18:00' },
    friday: { active: false, start: '09:00', end: '18:00' },
    saturday: { active: false, start: '09:00', end: '13:00' },
})

const makeDefaultSchedule = () => ({
    week1: makeEmptyWeek(),
    week2: makeEmptyWeek(),
    week3: makeEmptyWeek(),
    week4: makeEmptyWeek(),
})

/** Compute the 4-week date ranges for a given month/year */
function getWeekRanges(month: number, year: number) {
    const lastDay = new Date(year, month, 0).getDate()
    const abbr = MONTH_ABBR[month]
    return [
        { key: 'week1', label: 'Semana 1', range: `01 – 07 ${abbr}` },
        { key: 'week2', label: 'Semana 2', range: `08 – 14 ${abbr}` },
        { key: 'week3', label: 'Semana 3', range: `15 – 21 ${abbr}` },
        { key: 'week4', label: 'Semana 4', range: `22 – ${String(lastDay).padStart(2, '0')} ${abbr}` },
    ]
}

export interface Professional {
    id: string;
    first_name: string;
    last_name: string;
}

export type ScheduleData = Record<string, Record<string, { active: boolean; start: string; end: string }>>;

export function Home() {
    const [professionals, setProfessionals] = useState<Professional[]>([])
    const [selectedProfId, setSelectedProfId] = useState<string>('')
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
    const [selectedWeek, setSelectedWeek] = useState<string>('week1')

    const [schedule, setSchedule] = useState<ScheduleData>(makeDefaultSchedule())
    const [isSaving, setIsSaving] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)

    const weekRanges = getWeekRanges(selectedMonth, selectedYear)

    const fetchProfessionals = async () => {
        const { data, error } = await supabase
            .from('professionals')
            .select('id, first_name, last_name')
        if (data && !error) {
            setProfessionals(data)
            setSelectedProfId(prev => prev || (data.length > 0 ? data[0].id : prev))
        }
    }

    const loadSchedule = async () => {
        if (!selectedProfId) return
        const { data, error } = await supabase
            .from('professional_schedules')
            .select('schedule')
            .eq('professional_id', selectedProfId)
            .eq('month', selectedMonth)
            .eq('year', selectedYear)
            .maybeSingle()

        if (data && !error) {
            setSchedule(data.schedule as ScheduleData)
        } else {
            setSchedule(makeDefaultSchedule())
        }
    }

    useEffect(() => { void fetchProfessionals() }, []) // eslint-disable-line

    useEffect(() => {
        if (selectedProfId) void loadSchedule() // eslint-disable-line
        else setSchedule(makeDefaultSchedule())
    }, [selectedProfId, selectedMonth, selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveSchedule = async () => {
        setIsSaving(true)
        setSaveSuccess(false)
        const { error } = await supabase
            .from('professional_schedules')
            .upsert({
                professional_id: selectedProfId,
                month: selectedMonth,
                year: selectedYear,
                schedule,
            }, { onConflict: 'professional_id, month, year' })

        if (!error) {
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 3000)
        } else {
            console.error('Error saving schedule:', error)
        }
        setIsSaving(false)
    }

    const handleDayToggle = (day: string) => {
        setSchedule((prev) => ({
            ...prev,
            [selectedWeek]: {
                ...prev[selectedWeek],
                [day]: { ...prev[selectedWeek][day], active: !prev[selectedWeek][day].active },
            },
        }))
    }

    const handleTimeChange = (day: string, field: 'start' | 'end', value: string) => {
        setSchedule((prev) => ({
            ...prev,
            [selectedWeek]: {
                ...prev[selectedWeek],
                [day]: { ...prev[selectedWeek][day], [field]: value },
            },
        }))
    }

    const handleCopyToAllWeeks = () => {
        const current = schedule[selectedWeek]
        setSchedule((prev) => ({
            ...prev,
            week1: { ...current },
            week2: { ...current },
            week3: { ...current },
            week4: { ...current },
        }))
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2500)
    }

    const currentWeekSchedule = schedule[selectedWeek] || makeEmptyWeek()
    const activeDaysCount = DAYS_OF_WEEK.filter(d => currentWeekSchedule[d.key]?.active).length

    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Planificación semanal de disponibilidad de Profesionales.</p>
            </div>

            <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="border-b border-border/50 p-5 bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Planificación Mensual</h2>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <select
                            className="bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(Number(e.target.value))}
                        >
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select
                            className="bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                        >
                            <option value={2026}>2026</option>
                            <option value={2027}>2027</option>
                        </select>
                    </div>
                </div>

                <div className="p-6">
                    <div className="flex flex-col xl:flex-row gap-8">
                        {/* Professional Selector */}
                        <div className="xl:w-56 shrink-0">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Profesional</h3>
                            <div className="space-y-1">
                                {professionals.map(prof => (
                                    <button
                                        key={prof.id}
                                        onClick={() => setSelectedProfId(prof.id)}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 flex items-center justify-between group cursor-pointer ${selectedProfId === prof.id
                                                ? 'bg-primary/10 text-primary font-semibold'
                                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                            }`}
                                    >
                                        <span>{prof.first_name} {prof.last_name}</span>
                                        {selectedProfId === prof.id && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                                    </button>
                                ))}
                                {professionals.length === 0 && (
                                    <p className="text-sm text-muted-foreground italic px-2">No hay profesionales.</p>
                                )}
                            </div>
                        </div>

                        {/* Schedule Editor */}
                        <div className="flex-1 min-w-0">
                            {selectedProfId ? (
                                <div className="space-y-4">
                                    {/* Week Tabs */}
                                    <div className="flex gap-2 flex-wrap">
                                        {weekRanges.map(w => {
                                            const weekData = schedule[w.key] || makeEmptyWeek()
                                            const activeDays = DAYS_OF_WEEK.filter(d => weekData[d.key]?.active).length
                                            const isSelected = selectedWeek === w.key
                                            return (
                                                <button
                                                    key={w.key}
                                                    onClick={() => setSelectedWeek(w.key)}
                                                    className={`flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${isSelected
                                                            ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                                                            : 'bg-background border-border hover:border-primary/50 hover:bg-primary/5'
                                                        }`}
                                                >
                                                    <span className={`text-xs font-bold uppercase tracking-wide ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                                        {w.label}
                                                    </span>
                                                    <span className={`text-sm font-semibold ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                                                        {w.range}
                                                    </span>
                                                    <span className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                                        {activeDays === 0 ? 'Sin días activos' : `${activeDays} día${activeDays > 1 ? 's' : ''} activo${activeDays > 1 ? 's' : ''}`}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Day Grid */}
                                    <div className="bg-background/50 border border-border/40 rounded-xl p-5">
                                        {/* Header row */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm font-semibold text-foreground">
                                                    {weekRanges.find(w => w.key === selectedWeek)?.label} — Horarios
                                                </span>
                                                {activeDaysCount > 0 && (
                                                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium">
                                                        {activeDaysCount} día{activeDaysCount > 1 ? 's' : ''} activo{activeDaysCount > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {copySuccess && (
                                                    <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full flex items-center gap-1 animate-in slide-in-from-right-2">
                                                        <CheckCircle2 className="w-3 h-3" /> Copiado
                                                    </span>
                                                )}
                                                {saveSuccess && (
                                                    <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full flex items-center gap-1 animate-in slide-in-from-right-2">
                                                        <CheckCircle2 className="w-3 h-3" /> Guardado
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {DAYS_OF_WEEK.map(day => {
                                                const dayData = currentWeekSchedule[day.key] || { active: false, start: '09:00', end: '18:00' }
                                                const isActive = dayData.active
                                                return (
                                                    <div
                                                        key={day.key}
                                                        className={`flex items-center gap-3 p-3.5 rounded-lg border transition-all duration-200 ${isActive
                                                                ? 'bg-card border-border/80 shadow-sm'
                                                                : 'bg-muted/10 border-transparent'
                                                            }`}
                                                    >
                                                        {/* Toggle + Day name */}
                                                        <div className="flex items-center gap-3 w-28 shrink-0">
                                                            <input
                                                                type="checkbox"
                                                                id={`${selectedWeek}-${day.key}`}
                                                                checked={isActive}
                                                                onChange={() => handleDayToggle(day.key)}
                                                                className="w-4 h-4 accent-primary rounded cursor-pointer"
                                                            />
                                                            <label
                                                                htmlFor={`${selectedWeek}-${day.key}`}
                                                                className={`text-sm font-medium cursor-pointer select-none ${isActive ? 'text-foreground' : 'text-muted-foreground/60'}`}
                                                            >
                                                                {day.label}
                                                            </label>
                                                        </div>

                                                        {/* Time inputs */}
                                                        <div className={`flex items-center gap-2 transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                                                            <span className="text-xs text-muted-foreground">De</span>
                                                            <input
                                                                type="time"
                                                                value={dayData.start}
                                                                onChange={e => handleTimeChange(day.key, 'start', e.target.value)}
                                                                disabled={!isActive}
                                                                className="bg-background border border-input rounded px-2.5 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                            />
                                                            <span className="text-xs text-muted-foreground">a</span>
                                                            <input
                                                                type="time"
                                                                value={dayData.end}
                                                                onChange={e => handleTimeChange(day.key, 'end', e.target.value)}
                                                                disabled={!isActive}
                                                                className="bg-background border border-input rounded px-2.5 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                                                            />
                                                        </div>

                                                        {/* Active badge */}
                                                        {isActive && (
                                                            <span className="ml-auto text-xs text-primary/70 font-medium bg-primary/8 px-2 py-0.5 rounded-full hidden sm:block">
                                                                Activo
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Actions */}
                                        <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/50 flex-wrap gap-3">
                                            <button
                                                onClick={handleCopyToAllWeeks}
                                                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copiar esta semana a todas
                                            </button>

                                            <button
                                                onClick={handleSaveSchedule}
                                                disabled={isSaving}
                                                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-lg font-semibold text-sm transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                                            >
                                                {isSaving ? (
                                                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                                ) : (
                                                    <Save className="w-4 h-4" />
                                                )}
                                                {isSaving ? 'Guardando...' : 'Guardar mes completo'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center border border-dashed border-border/50 rounded-xl bg-muted/10 p-12">
                                    <p className="text-muted-foreground text-sm text-center max-w-sm">
                                        Seleccioná un profesional a la izquierda para configurar su disponibilidad semanal.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
