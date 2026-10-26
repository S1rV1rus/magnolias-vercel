import { defineConfig } from 'vitest/config'

// Los tests de fechas asumen la zona horaria de la clínica (Uruguay, UTC-3, sin horario de
// verano). Se fija acá para que den igual en cualquier máquina o CI.
process.env.TZ = 'America/Montevideo'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
})
