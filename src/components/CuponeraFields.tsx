import { useState } from 'react'
import { X } from 'lucide-react'
import { cn, type Currency } from '../lib/utils'

// Zonas del cuerpo más comunes para depilación (se pueden agregar otras a mano).
const BODY_ZONES = ['Axilas', 'Bozo', 'Rostro completo', 'Medias piernas', 'Piernas completas', 'Cavado', 'Abdomen', 'Espalda', 'Hombros', 'Brazos', 'Glúteos']

export function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
    return (
        <div className="flex bg-muted rounded-lg p-1 gap-1 max-w-[220px]">
            <button
                type="button"
                onClick={() => onChange('UYU')}
                className={cn(
                    "flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all cursor-pointer",
                    value === 'UYU' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                $ Pesos
            </button>
            <button
                type="button"
                onClick={() => onChange('USD')}
                className={cn(
                    "flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all cursor-pointer",
                    value === 'USD' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                US$ Dólares
            </button>
        </div>
    )
}

// Selector de zonas del cuerpo: chips de una lista predefinida + agregado libre.
export function ZonesPicker({ value, onChange }: { value: string[]; onChange: (zones: string[]) => void }) {
    const [zoneInput, setZoneInput] = useState('')

    const toggle = (z: string) => {
        const zone = z.trim()
        if (!zone) return
        onChange(value.includes(zone) ? value.filter(x => x !== zone) : [...value, zone])
    }

    const addCustom = () => {
        const zone = zoneInput.trim()
        if (!zone) return
        if (!value.includes(zone)) onChange([...value, zone])
        setZoneInput('')
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
                {BODY_ZONES.map(z => (
                    <button
                        key={z}
                        type="button"
                        onClick={() => toggle(z)}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                            value.includes(z)
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-background text-muted-foreground border-border hover:border-primary/40"
                        )}
                    >
                        {z}
                    </button>
                ))}
                {value.filter(z => !BODY_ZONES.includes(z)).map(z => (
                    <button
                        key={z}
                        type="button"
                        onClick={() => toggle(z)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border bg-primary/10 text-primary border-primary/30 inline-flex items-center gap-1 cursor-pointer"
                    >
                        {z}
                        <X className="w-3 h-3" />
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Agregar otra zona..."
                    value={zoneInput}
                    onChange={e => setZoneInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                    className="flex-1 bg-background border border-input rounded-md px-3 py-1.5 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none"
                />
                <button type="button" onClick={addCustom} className="px-3 py-1.5 text-sm font-medium text-primary border border-primary/30 rounded-md hover:bg-primary/10 cursor-pointer">
                    Agregar
                </button>
            </div>
        </div>
    )
}
