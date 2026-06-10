import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
    Wallet,
    Ticket,
    Clipboard,
    AlertTriangle,
    TrendingUp,
    Filter,
    RefreshCw,
    Search,
    ChevronDown,
    ChevronUp,
    Download,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '../lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Cuponera {
    id: string
    created_at: string
    amount_paid: number | null
    invoice_number: string | null
    is_paid: boolean
    total_sessions: number
    used_sessions: number
    is_active: boolean
    patients: { id: string; first_name: string; last_name: string; document_id: string | null } | null
    services: { id: string; name: string } | null
}

interface IndividualService {
    id: string
    start_time: string
    status: string
    payment_amount: number | null
    receipt_number: string | null
    is_unpaid: boolean
    cuponera_id: string | null
    appointment_patients: { patients: { id: string; first_name: string; last_name: string } | null }[]
    services: { id: string; name: string; price: number | null } | null
    professionals: { id: string; first_name: string; last_name: string } | null
}

type QuickRange = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'this-year' | 'custom'
type ActiveTab = 'cuponeras' | 'servicios'
type SortField = 'date' | 'amount' | 'patient' | 'service'
type SortDir = 'asc' | 'desc'

// ─── Component ─────────────────────────────────────────────────────────────────

export function Accounting() {
    const [loading, setLoading] = useState(true)
    const [cuponeras, setCuponeras] = useState<Cuponera[]>([])
    const [individualServices, setIndividualServices] = useState<IndividualService[]>([])

    // Filters
    const [quickRange, setQuickRange] = useState<QuickRange>('this-month')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    // UI
    const [activeTab, setActiveTab] = useState<ActiveTab>('cuponeras')
    const [searchQuery, setSearchQuery] = useState('')
    const [sortField, setSortField] = useState<SortField>('date')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    // ── Quick Range Logic ──────────────────────────────────────────────────────
    useEffect(() => {
        const now = new Date()
        let start = new Date()
        let end = new Date()

        switch (quickRange) {
            case 'this-month':
                start = new Date(now.getFullYear(), now.getMonth(), 1)
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
                break
            case 'last-month':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
                break
            case 'last-30':
                start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                end = now
                break
            case 'last-90':
                start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                end = now
                break
            case 'this-year':
                start = new Date(now.getFullYear(), 0, 1)
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
                break
            case 'custom':
                return
        }

        setStartDate(start.toISOString().split('T')[0])
        setEndDate(end.toISOString().split('T')[0])
    }, [quickRange])

    // ── Fetch Data ─────────────────────────────────────────────────────────────
    async function fetchData() {
        if (!startDate || !endDate) return
        setLoading(true)

        const startIso = `${startDate}T00:00:00Z`
        const endIso = `${endDate}T23:59:59Z`

        try {
            // 1. Cuponeras vendidas en el período
            const { data: cupData } = await supabase
                .from('cuponeras')
                .select(`
                    id, created_at, amount_paid, invoice_number, is_paid,
                    total_sessions, used_sessions, is_active,
                    patients!inner(id, first_name, last_name, document_id),
                    services!inner(id, name)
                `)
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false })

            if (cupData) {
                // Normalize joins (Supabase can return arrays or objects)
                const normalized = cupData.map((c: any) => ({
                    ...c,
                    patients: Array.isArray(c.patients) ? c.patients[0] : c.patients,
                    services: Array.isArray(c.services) ? c.services[0] : c.services,
                }))
                setCuponeras(normalized)
            }

            // 2. Turnos confirmados o completados individuales (sin cuponera) en el período
            const { data: srvData } = await supabase
                .from('appointments')
                .select(`
                    id, start_time, status, payment_amount, receipt_number, is_unpaid, cuponera_id,
                    appointment_patients(patients(id, first_name, last_name)),
                    services(id, name, price),
                    professionals(id, first_name, last_name)
                `)
                .in('status', ['confirmado', 'completado'])
                .is('cuponera_id', null)
                .gte('start_time', startIso)
                .lte('start_time', endIso)
                .order('start_time', { ascending: false })

            if (srvData) {
                const normalized = srvData.map((s: any) => ({
                    ...s,
                    services: Array.isArray(s.services) ? s.services[0] : s.services,
                    professionals: Array.isArray(s.professionals) ? s.professionals[0] : s.professionals,
                }))
                setIndividualServices(normalized)
            }
        } catch (err) {
            console.error('Error fetching accounting data:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (startDate && endDate) void fetchData()
    }, [startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Helper: get patient name from appointment ──────────────────────────────
    function getPatientName(srv: IndividualService): string {
        const rows = srv.appointment_patients || []
        const names = rows.map(r => {
            const p = Array.isArray(r.patients) ? (r.patients as any)[0] : r.patients
            return p ? `${p.first_name} ${p.last_name}` : null
        }).filter(Boolean)
        return names.length > 0 ? names.join(' & ') : '—'
    }

    // ── Computed KPIs ──────────────────────────────────────────────────────────
    const cuponerasTotal = cuponeras.reduce((sum, c) => sum + (c.amount_paid ?? 0), 0)
    const serviciosTotal = individualServices.reduce((sum, s) => {
        return sum + (s.payment_amount ?? s.services?.price ?? 0)
    }, 0)
    const ingresoTotal = cuponerasTotal + serviciosTotal
    const totalTransacciones = cuponeras.length + individualServices.length
    const ticketPromedio = totalTransacciones > 0 ? ingresoTotal / totalTransacciones : 0

    const pendientesCuponeras = cuponeras.filter(c => c.is_paid === false).length
    const pendientesServicios = individualServices.filter(s => s.is_unpaid === true).length
    const totalPendientes = pendientesCuponeras + pendientesServicios

    const montoPendienteCuponeras = cuponeras.filter(c => c.is_paid === false).reduce((s, c) => s + (c.amount_paid ?? 0), 0)
    const montoPendienteServicios = individualServices.filter(s => s.is_unpaid === true).reduce((s, srv) => s + (srv.payment_amount ?? srv.services?.price ?? 0), 0)
    const montoPendienteTotal = montoPendienteCuponeras + montoPendienteServicios

    // ── Search Filter ──────────────────────────────────────────────────────────
    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""

    const filteredCuponeras = cuponeras.filter(c => {
        if (!searchQuery.trim()) return true
        const terms = normalize(searchQuery).split(' ').filter(Boolean)
        const haystack = normalize(`${c.patients?.first_name} ${c.patients?.last_name} ${c.services?.name} ${c.invoice_number || ''}`)
        return terms.every(t => haystack.includes(t))
    })

    const filteredServicios = individualServices.filter(s => {
        if (!searchQuery.trim()) return true
        const terms = normalize(searchQuery).split(' ').filter(Boolean)
        const patientName = getPatientName(s)
        const haystack = normalize(`${patientName} ${s.services?.name} ${s.professionals?.first_name} ${s.professionals?.last_name} ${s.receipt_number || ''}`)
        return terms.every(t => haystack.includes(t))
    })

    // ── Sort Logic ─────────────────────────────────────────────────────────────
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
    }

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
        return sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-primary" />
            : <ChevronDown className="w-3 h-3 text-primary" />
    }

    const sortedCuponeras = [...filteredCuponeras].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortField) {
            case 'date': return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            case 'amount': return dir * ((a.amount_paid ?? 0) - (b.amount_paid ?? 0))
            case 'patient': return dir * ((a.patients?.last_name ?? '').localeCompare(b.patients?.last_name ?? ''))
            case 'service': return dir * ((a.services?.name ?? '').localeCompare(b.services?.name ?? ''))
            default: return 0
        }
    })

    const sortedServicios = [...filteredServicios].sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1
        switch (sortField) {
            case 'date': return dir * (new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            case 'amount': return dir * ((a.payment_amount ?? 0) - (b.payment_amount ?? 0))
            case 'patient': return dir * (getPatientName(a).localeCompare(getPatientName(b)))
            case 'service': return dir * ((a.services?.name ?? '').localeCompare(b.services?.name ?? ''))
            default: return 0
        }
    })

    // ── Tab summary data ───────────────────────────────────────────────────────
    const cuponerasSummaryTotal = filteredCuponeras.reduce((s, c) => s + (c.amount_paid ?? 0), 0)
    const cuponerasAvg = filteredCuponeras.length > 0 ? cuponerasSummaryTotal / filteredCuponeras.length : 0

    const serviciosSummaryTotal = filteredServicios.reduce((s, srv) => s + (srv.payment_amount ?? srv.services?.price ?? 0), 0)
    const serviciosAvg = filteredServicios.length > 0 ? serviciosSummaryTotal / filteredServicios.length : 0

    // ── Excel Export (HTML Table → XLS) ──────────────────────────────────────────
    const MONTHS_ES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

    function getExportDateLabel(): string {
        // Use start date month/year for the label
        const d = new Date(startDate + 'T00:00:00')
        const month = MONTHS_ES[d.getMonth() + 1]
        const year = d.getFullYear()
        return `${month}${year}`
    }

    function downloadXLS(filename: string, htmlContent: string) {
        const template = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Reporte</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; }
  td, th { padding: 6px 10px; vertical-align: top; }
  .title { font-size: 18px; font-weight: bold; color: #1a1a2e; }
  .subtitle { font-size: 12px; color: #666; }
  .section-title { font-size: 14px; font-weight: bold; color: #1a1a2e; background: #f0f0f5; padding: 8px 10px; border-bottom: 2px solid #7c3aed; }
  .kpi-label { font-size: 11px; color: #555; font-weight: bold; }
  .kpi-value { font-size: 14px; font-weight: bold; color: #1a1a2e; }
  .kpi-accent { font-size: 14px; font-weight: bold; color: #059669; }
  .kpi-warning { font-size: 14px; font-weight: bold; color: #d97706; }
  .th-header { background: #7c3aed; color: #fff; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #6d28d9; }
  .td-data { border: 1px solid #e5e7eb; font-size: 11px; }
  .td-data-alt { border: 1px solid #e5e7eb; font-size: 11px; background: #fafafa; }
  .td-amount { font-weight: bold; text-align: right; }
  .td-center { text-align: center; }
  .badge-green { background: #d1fae5; color: #065f46; font-weight: bold; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
  .badge-amber { background: #fef3c7; color: #92400e; font-weight: bold; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
  .badge-red { background: #fee2e2; color: #991b1b; font-weight: bold; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
  .summary-row { background: #f5f3ff; border-top: 2px solid #7c3aed; font-weight: bold; font-size: 12px; }
  .text-muted { color: #9ca3af; font-size: 10px; font-style: italic; }
</style>
</head>
<body>${htmlContent}</body>
</html>`
        const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    function esc(val: string | number | null | undefined): string {
        if (val == null) return ''
        return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    function fmtMoney(val: number | null | undefined): string {
        if (val == null || val === 0) return ''
        return `$${Number(val).toLocaleString('es-AR')}`
    }

    function exportCuponerasCSV() {
        const dateLabel = getExportDateLabel()
        let html = `
        <table>
            <tr><td colspan="7" class="title">📋 Cuponeras Vendidas — Clínica Magnolias</td></tr>
            <tr><td colspan="7" class="subtitle">Período: ${esc(startDate)} al ${esc(endDate)} · Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</td></tr>
            <tr><td colspan="7"></td></tr>
            <tr>
                <th class="th-header">Fecha</th>
                <th class="th-header">Paciente</th>
                <th class="th-header">Tratamiento</th>
                <th class="th-header">Sesiones</th>
                <th class="th-header">Monto</th>
                <th class="th-header">Nº Factura</th>
                <th class="th-header">Estado</th>
            </tr>`

        sortedCuponeras.forEach((c, i) => {
            const cls = i % 2 === 0 ? 'td-data' : 'td-data-alt'
            const badge = c.is_paid !== false ? '<span class="badge-green">Cobrada</span>' : '<span class="badge-amber">Pendiente</span>'
            html += `<tr>
                <td class="${cls}">${format(new Date(c.created_at), 'dd/MM/yyyy')}</td>
                <td class="${cls}">${esc(c.patients?.last_name)}, ${esc(c.patients?.first_name)}</td>
                <td class="${cls}">${esc(c.services?.name)}</td>
                <td class="${cls} td-center">${c.used_sessions}/${c.total_sessions}</td>
                <td class="${cls} td-amount">${c.amount_paid ? fmtMoney(c.amount_paid) : '<span class="text-muted">Sin monto</span>'}</td>
                <td class="${cls}">${esc(c.invoice_number) || '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-center">${badge}</td>
            </tr>`
        })

        html += `
            <tr class="summary-row">
                <td colspan="3">Total: ${sortedCuponeras.length} cuponeras</td>
                <td></td>
                <td class="td-amount">${fmtMoney(cuponerasSummaryTotal)}</td>
                <td></td>
                <td class="td-center">${pendientesCuponeras} pend.</td>
            </tr>
        </table>`

        downloadXLS(`Magnolias_${dateLabel}.xls`, html)
    }

    function exportServiciosCSV() {
        const dateLabel = getExportDateLabel()
        let html = `
        <table>
            <tr><td colspan="7" class="title">📋 Servicios Individuales — Clínica Magnolias</td></tr>
            <tr><td colspan="7" class="subtitle">Período: ${esc(startDate)} al ${esc(endDate)} · Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</td></tr>
            <tr><td colspan="7"></td></tr>
            <tr>
                <th class="th-header">Fecha</th>
                <th class="th-header">Paciente</th>
                <th class="th-header">Servicio</th>
                <th class="th-header">Profesional</th>
                <th class="th-header">Monto</th>
                <th class="th-header">Nº Recibo</th>
                <th class="th-header">Estado</th>
            </tr>`

        sortedServicios.forEach((s, i) => {
            const cls = i % 2 === 0 ? 'td-data' : 'td-data-alt'
            const effectiveAmount = s.payment_amount ?? s.services?.price ?? 0
            const isEstimated = !s.payment_amount && s.services?.price
            const badge = s.is_unpaid ? '<span class="badge-red">Impago</span>' : '<span class="badge-green">Cobrado</span>'
            html += `<tr>
                <td class="${cls}">${format(new Date(s.start_time), 'dd/MM/yyyy')}</td>
                <td class="${cls}">${esc(getPatientName(s))}</td>
                <td class="${cls}">${esc(s.services?.name)}</td>
                <td class="${cls}">${s.professionals ? esc(`${s.professionals.first_name} ${s.professionals.last_name}`) : '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-amount">${effectiveAmount > 0 ? fmtMoney(effectiveAmount) : '<span class="text-muted">Sin monto</span>'}${isEstimated ? ' <span class="text-muted">(lista)</span>' : ''}</td>
                <td class="${cls}">${esc(s.receipt_number) || '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-center">${badge}</td>
            </tr>`
        })

        html += `
            <tr class="summary-row">
                <td colspan="3">Total: ${sortedServicios.length} servicios</td>
                <td></td>
                <td class="td-amount">${fmtMoney(serviciosSummaryTotal)}</td>
                <td></td>
                <td class="td-center">${pendientesServicios} impagos</td>
            </tr>
        </table>`

        downloadXLS(`Magnolias_${dateLabel}.xls`, html)
    }

    function exportReporteCompletoCSV() {
        const dateLabel = getExportDateLabel()
        const periodoLabel = `${esc(startDate)} al ${esc(endDate)}`

        let html = `
        <table>
            <!-- Header -->
            <tr><td colspan="8" class="title">🏥 Reporte Contable — Clínica Magnolias</td></tr>
            <tr><td colspan="8" class="subtitle">Período: ${periodoLabel} · Generado: ${format(new Date(), "dd 'de' MMMM yyyy, HH:mm", { locale: es })} hs</td></tr>
            <tr><td colspan="8"></td></tr>

            <!-- KPIs -->
            <tr><td colspan="8" class="section-title">📊 Resumen General</td></tr>
            <tr>
                <td class="kpi-label">Ingreso Total</td>
                <td class="kpi-accent">${fmtMoney(ingresoTotal)}</td>
                <td></td>
                <td class="kpi-label">Cuponeras Vendidas</td>
                <td class="kpi-value">${cuponeras.length}</td>
                <td class="kpi-accent">${fmtMoney(cuponerasTotal)}</td>
                <td></td><td></td>
            </tr>
            <tr>
                <td class="kpi-label">Servicios Individuales</td>
                <td class="kpi-value">${individualServices.length}</td>
                <td class="kpi-accent">${fmtMoney(serviciosTotal)}</td>
                <td class="kpi-label">Pendientes de Cobro</td>
                <td class="kpi-${totalPendientes > 0 ? 'warning' : 'value'}">${totalPendientes}</td>
                <td class="kpi-${montoPendienteTotal > 0 ? 'warning' : 'value'}">${fmtMoney(montoPendienteTotal)}</td>
                <td></td><td></td>
            </tr>
            <tr>
                <td class="kpi-label">Ticket Promedio</td>
                <td class="kpi-value">${fmtMoney(ticketPromedio)}</td>
                <td colspan="6"></td>
            </tr>
            <tr><td colspan="8"></td></tr>
            <tr><td colspan="8"></td></tr>

            <!-- Cuponeras -->
            <tr><td colspan="8" class="section-title">🎫 Detalle de Cuponeras Vendidas (${sortedCuponeras.length})</td></tr>
            <tr>
                <th class="th-header">Fecha</th>
                <th class="th-header">Paciente</th>
                <th class="th-header">Cédula</th>
                <th class="th-header">Tratamiento</th>
                <th class="th-header">Sesiones</th>
                <th class="th-header">Monto</th>
                <th class="th-header">Nº Factura</th>
                <th class="th-header">Estado</th>
            </tr>`

        sortedCuponeras.forEach((c, i) => {
            const cls = i % 2 === 0 ? 'td-data' : 'td-data-alt'
            const badge = c.is_paid !== false ? '<span class="badge-green">Cobrada</span>' : '<span class="badge-amber">Pendiente</span>'
            html += `<tr>
                <td class="${cls}">${format(new Date(c.created_at), 'dd/MM/yyyy')}</td>
                <td class="${cls}">${esc(c.patients?.last_name)}, ${esc(c.patients?.first_name)}</td>
                <td class="${cls}">${esc(c.patients?.document_id)}</td>
                <td class="${cls}">${esc(c.services?.name)}</td>
                <td class="${cls} td-center">${c.used_sessions}/${c.total_sessions}</td>
                <td class="${cls} td-amount">${c.amount_paid ? fmtMoney(c.amount_paid) : '<span class="text-muted">—</span>'}</td>
                <td class="${cls}">${esc(c.invoice_number) || '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-center">${badge}</td>
            </tr>`
        })

        html += `
            <tr class="summary-row">
                <td colspan="4">Subtotal Cuponeras: ${sortedCuponeras.length}</td>
                <td></td>
                <td class="td-amount">${fmtMoney(cuponerasSummaryTotal)}</td>
                <td></td>
                <td class="td-center">${pendientesCuponeras} pendientes</td>
            </tr>
            <tr><td colspan="8"></td></tr>
            <tr><td colspan="8"></td></tr>

            <!-- Servicios Individuales -->
            <tr><td colspan="8" class="section-title">💆 Detalle de Servicios Individuales (${sortedServicios.length})</td></tr>
            <tr>
                <th class="th-header">Fecha</th>
                <th class="th-header">Paciente</th>
                <th class="th-header">Servicio</th>
                <th class="th-header">Profesional</th>
                <th class="th-header">Monto</th>
                <th class="th-header">Tipo</th>
                <th class="th-header">Nº Recibo</th>
                <th class="th-header">Estado</th>
            </tr>`

        sortedServicios.forEach((s, i) => {
            const cls = i % 2 === 0 ? 'td-data' : 'td-data-alt'
            const effectiveAmount = s.payment_amount ?? s.services?.price ?? 0
            const isEstimated = !s.payment_amount && s.services?.price
            const badge = s.is_unpaid ? '<span class="badge-red">Impago</span>' : '<span class="badge-green">Cobrado</span>'
            html += `<tr>
                <td class="${cls}">${format(new Date(s.start_time), 'dd/MM/yyyy')}</td>
                <td class="${cls}">${esc(getPatientName(s))}</td>
                <td class="${cls}">${esc(s.services?.name)}</td>
                <td class="${cls}">${s.professionals ? esc(`${s.professionals.first_name} ${s.professionals.last_name}`) : '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-amount">${effectiveAmount > 0 ? fmtMoney(effectiveAmount) : '<span class="text-muted">—</span>'}${isEstimated ? ' <span class="text-muted">(lista)</span>' : ''}</td>
                <td class="${cls}">${isEstimated ? 'Lista' : 'Cobrado'}</td>
                <td class="${cls}">${esc(s.receipt_number) || '<span class="text-muted">—</span>'}</td>
                <td class="${cls} td-center">${badge}</td>
            </tr>`
        })

        html += `
            <tr class="summary-row">
                <td colspan="3">Subtotal Servicios: ${sortedServicios.length}</td>
                <td></td>
                <td class="td-amount">${fmtMoney(serviciosSummaryTotal)}</td>
                <td colspan="2"></td>
                <td class="td-center">${pendientesServicios} impagos</td>
            </tr>
            <tr><td colspan="8"></td></tr>
            <tr><td colspan="8"></td></tr>

            <!-- Grand Total -->
            <tr style="background: #1a1a2e;">
                <td colspan="4" style="color: #fff; font-weight: bold; font-size: 13px; padding: 10px;">TOTAL GENERAL</td>
                <td style="color: #10b981; font-weight: bold; font-size: 15px; text-align: right; padding: 10px;">${fmtMoney(ingresoTotal)}</td>
                <td colspan="3" style="color: #fbbf24; font-size: 11px; padding: 10px;">${totalPendientes > 0 ? `⚠️ ${totalPendientes} pendientes (${fmtMoney(montoPendienteTotal)})` : '✅ Sin pendientes'}</td>
            </tr>
        </table>`

        downloadXLS(`Magnolias_${dateLabel}.xls`, html)
    }

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        <Wallet className="w-8 h-8 text-primary" />
                        Contabilidad
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Control de ingresos por cuponeras vendidas y servicios individuales.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportReporteCompletoCSV}
                        disabled={loading || (cuponeras.length === 0 && individualServices.length === 0)}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-all cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Descargar reporte completo para el contador"
                    >
                        <Download className="w-4 h-4" />
                        Exportar Reporte
                    </button>
                    <button
                        onClick={() => void fetchData()}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium bg-secondary text-secondary-foreground border border-border/80 rounded-lg hover:bg-secondary/80 transition-all cursor-pointer shrink-0"
                        title="Actualizar datos"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Sincronizar
                    </button>
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                    <Filter className="w-4 h-4 text-primary" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Período Contable</h2>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <select
                        className="bg-background border border-input rounded-md px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none cursor-pointer sm:w-44"
                        value={quickRange}
                        onChange={e => setQuickRange(e.target.value as QuickRange)}
                    >
                        <option value="this-month">Este Mes</option>
                        <option value="last-month">Mes Anterior</option>
                        <option value="last-30">Últimos 30 días</option>
                        <option value="last-90">Últimos 90 días</option>
                        <option value="this-year">Año Actual</option>
                        <option value="custom">Personalizado</option>
                    </select>

                    <div className="flex items-center gap-2 flex-1">
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => { setStartDate(e.target.value); setQuickRange('custom') }}
                            className="bg-background border border-input rounded-md px-2.5 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                        <span className="text-xs text-muted-foreground">al</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setQuickRange('custom') }}
                            className="bg-background border border-input rounded-md px-2.5 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Ingreso Total */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Ingreso Total</span>
                        <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                            <Wallet className="w-4 h-4 text-emerald-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">
                            ${ingresoTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Cuponeras + Servicios</p>
                    </div>
                </div>

                {/* Cuponeras Vendidas */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Cuponeras Vendidas</span>
                        <div className="p-2 bg-violet-500/10 rounded-lg group-hover:bg-violet-500/20 transition-colors">
                            <Ticket className="w-4 h-4 text-violet-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">{cuponeras.length}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            ${cuponerasTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} facturados
                        </p>
                    </div>
                </div>

                {/* Servicios Individuales */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Servicios Individuales</span>
                        <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                            <Clipboard className="w-4 h-4 text-blue-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">{individualServices.length}</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            ${serviciosTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} facturados
                        </p>
                    </div>
                </div>

                {/* Pendientes de Cobro */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Pendientes de Cobro</span>
                        <div className={cn(
                            "p-2 rounded-lg transition-colors",
                            totalPendientes > 0
                                ? "bg-amber-500/10 group-hover:bg-amber-500/20"
                                : "bg-green-500/10 group-hover:bg-green-500/20"
                        )}>
                            <AlertTriangle className={cn("w-4 h-4", totalPendientes > 0 ? "text-amber-500" : "text-green-500")} />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className={cn(
                            "text-2xl font-bold tracking-tight",
                            totalPendientes > 0 ? "text-amber-500" : "text-foreground"
                        )}>
                            {totalPendientes}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {montoPendienteTotal > 0
                                ? `$${montoPendienteTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} adeudados`
                                : 'Sin deudas pendientes'
                            }
                        </p>
                    </div>
                </div>

                {/* Ticket Promedio */}
                <div className="bg-card border border-border/50 rounded-xl p-4.5 shadow-sm hover:shadow transition-all group flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Ticket Promedio</span>
                        <div className="p-2 bg-pink-500/10 rounded-lg group-hover:bg-pink-500/20 transition-colors">
                            <TrendingUp className="w-4 h-4 text-pink-500" />
                        </div>
                    </div>
                    <div className="mt-2.5">
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">
                            ${ticketPromedio.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Sobre {totalTransacciones} transacción{totalTransacciones !== 1 ? 'es' : ''}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mt-2 pb-2 border-b border-border/40">
                <div className="flex bg-muted/30 p-1 rounded-xl border border-border/40">
                    <button
                        onClick={() => { setActiveTab('cuponeras'); setSearchQuery(''); setSortField('date'); setSortDir('desc') }}
                        className={cn(
                            "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2",
                            activeTab === 'cuponeras'
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Ticket className="w-3.5 h-3.5" />
                        Cuponeras Vendidas
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none",
                            activeTab === 'cuponeras'
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {cuponeras.length}
                        </span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('servicios'); setSearchQuery(''); setSortField('date'); setSortDir('desc') }}
                        className={cn(
                            "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2",
                            activeTab === 'servicios'
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Clipboard className="w-3.5 h-3.5" />
                        Servicios Individuales
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none",
                            activeTab === 'servicios'
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {individualServices.length}
                        </span>
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={activeTab === 'cuponeras' ? "Buscar paciente, tratamiento..." : "Buscar paciente, servicio, profesional..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="p-16 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Cargando datos contables...
                </div>
            ) : activeTab === 'cuponeras' ? (
                /* ═══ TAB: CUPONERAS VENDIDAS ═══ */
                <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('date')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Fecha <SortIcon field="date" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('patient')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Paciente <SortIcon field="patient" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('service')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Tratamiento <SortIcon field="service" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium text-center">Sesiones</th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('amount')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Monto <SortIcon field="amount" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">Nº Factura</th>
                                    <th className="px-5 py-3 font-medium text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sortedCuponeras.map(c => (
                                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                                            {format(new Date(c.created_at), "dd MMM yyyy", { locale: es })}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="font-medium text-foreground">
                                                {c.patients?.last_name}, {c.patients?.first_name}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="font-medium text-primary">{c.services?.name}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                            <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">
                                                {c.used_sessions}/{c.total_sessions}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {c.amount_paid ? (
                                                <span className="font-bold text-foreground">
                                                    ${Number(c.amount_paid).toLocaleString('es-AR')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">Sin monto</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {c.invoice_number ? (
                                                <span className="text-xs text-muted-foreground font-mono max-w-[120px] truncate block" title={c.invoice_number}>
                                                    {c.invoice_number}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                            {c.is_paid !== false ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    Cobrada
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    Pendiente
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {sortedCuponeras.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                                            <Ticket className="mx-auto h-10 w-10 opacity-20 mb-3" />
                                            <p className="text-sm">No se encontraron cuponeras en este período.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Footer */}
                    {filteredCuponeras.length > 0 && (
                        <div className="border-t border-border bg-muted/20 px-5 py-4 flex flex-wrap gap-6 items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Total vendidas:</span>
                                <span className="text-sm font-bold text-foreground">{filteredCuponeras.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Total facturado:</span>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                    ${cuponerasSummaryTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Promedio por cuponera:</span>
                                <span className="text-sm font-bold text-foreground">
                                    ${cuponerasAvg.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Pendientes:</span>
                                <span className={cn(
                                    "text-sm font-bold",
                                    pendientesCuponeras > 0 ? "text-amber-500" : "text-emerald-500"
                                )}>
                                    {pendientesCuponeras}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* ═══ TAB: SERVICIOS INDIVIDUALES ═══ */
                <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('date')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Fecha <SortIcon field="date" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('patient')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Paciente <SortIcon field="patient" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('service')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Servicio <SortIcon field="service" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">Profesional</th>
                                    <th className="px-5 py-3 font-medium">
                                        <button onClick={() => handleSort('amount')} className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                                            Monto <SortIcon field="amount" />
                                        </button>
                                    </th>
                                    <th className="px-5 py-3 font-medium">Nº Recibo</th>
                                    <th className="px-5 py-3 font-medium text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sortedServicios.map(s => {
                                    const effectiveAmount = s.payment_amount ?? s.services?.price ?? 0
                                    const isEstimated = !s.payment_amount && s.services?.price

                                    return (
                                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                                                {format(new Date(s.start_time), "dd MMM yyyy", { locale: es })}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="font-medium text-foreground">
                                                    {getPatientName(s)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="font-medium text-primary">
                                                    {s.services?.name || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-muted-foreground">
                                                {s.professionals
                                                    ? `${s.professionals.first_name} ${s.professionals.last_name}`
                                                    : '—'
                                                }
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {effectiveAmount > 0 ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-foreground">
                                                            ${Number(effectiveAmount).toLocaleString('es-AR')}
                                                        </span>
                                                        {isEstimated && (
                                                            <span className="text-[10px] text-muted-foreground italic">
                                                                (precio de lista)
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Sin monto</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {s.receipt_number ? (
                                                    <span className="text-xs text-muted-foreground font-mono max-w-[120px] truncate block" title={s.receipt_number}>
                                                        {s.receipt_number}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                {s.is_unpaid ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                                        Impago
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        Cobrado
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}

                                {sortedServicios.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                                            <Clipboard className="mx-auto h-10 w-10 opacity-20 mb-3" />
                                            <p className="text-sm">No se encontraron servicios individuales en este período.</p>
                                            <p className="text-xs mt-1">Solo se muestran turnos confirmados o completados que no usan cuponera.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Footer */}
                    {filteredServicios.length > 0 && (
                        <div className="border-t border-border bg-muted/20 px-5 py-4 flex flex-wrap gap-6 items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Total servicios:</span>
                                <span className="text-sm font-bold text-foreground">{filteredServicios.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Total facturado:</span>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                    ${serviciosSummaryTotal.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Promedio por servicio:</span>
                                <span className="text-sm font-bold text-foreground">
                                    ${serviciosAvg.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Impagos:</span>
                                <span className={cn(
                                    "text-sm font-bold",
                                    pendientesServicios > 0 ? "text-red-500" : "text-emerald-500"
                                )}>
                                    {pendientesServicios}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
