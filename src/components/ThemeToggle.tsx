import { useTheme } from '../providers/ThemeProvider'
import { cn } from '../lib/utils'

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const isDark = theme === 'dark'

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                {isDark ? 'Tema oscuro' : 'Tema claro'}
            </span>
            <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={cn(
                    "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                    isDark ? 'bg-primary' : 'bg-muted'
                )}
                role="switch"
                aria-checked={isDark}
            >
                <span className="sr-only">Cambiar tema</span>
                <span
                    className={cn(
                        "pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        isDark ? 'translate-x-5' : 'translate-x-0'
                    )}
                >
                    <span
                        className={cn(
                            "absolute inset-0 flex h-full w-full items-center justify-center transition-opacity",
                            isDark ? 'opacity-0 duration-100 ease-out' : 'opacity-100 duration-200 ease-in'
                        )}
                        aria-hidden="true"
                    >
                    </span>
                    <span
                        className={cn(
                            "absolute inset-0 flex h-full w-full items-center justify-center transition-opacity",
                            isDark ? 'opacity-100 duration-200 ease-in' : 'opacity-0 duration-100 ease-out'
                        )}
                        aria-hidden="true"
                    >
                    </span>
                </span>
            </button>
        </div>
    )
}
