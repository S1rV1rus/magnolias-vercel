# Clínica Magnolias — sistema de gestión

Panel interno de la clínica estética Magnolias (Uruguay): agenda de turnos por consultorio,
pacientes con historia clínica y fotos, cuponeras (por sesiones o pases mensuales), gift cards,
contabilidad, métricas del staff, stock de insumos, lista de precios y un blog interno.

La meta final del proyecto (ver `todo.txt`, el alcance original) es que esta base sea además el
"cerebro" de un asistente de WhatsApp (ManyChat + n8n) que consulte disponibilidad y agende solo.

## Stack

- **Front:** React 19 + Vite 7 + TypeScript + Tailwind 4, `react-big-calendar` para la agenda.
- **Backend:** Supabase (Postgres + Auth + Storage + 2 Edge Functions en `supabase/functions`).
- **Deploy:** Vercel, automático al pushear a `main`.

## Correr en local

```bash
npm install
```

Crear un `.env` en la raíz con los datos del proyecto de Supabase (Settings → API):

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest, en hora de Uruguay) |
| `npm run build` | Typecheck + build de producción (lo que corre Vercel) |
| `npm run lint` | ESLint (todavía tiene errores heredados, sobre todo `any`) |

## Roles

El rol sale de `app_metadata.role` del usuario de Supabase Auth: `admin` ve todo; `staff` no ve
Métricas, Contabilidad ni Configuración. Ojo: hoy esa restricción es **solo de interfaz**; las
reglas de la base (RLS) no distinguen roles. Los usuarios del staff se crean desde
Configuración (Edge Function `create-staff-user`).

## Estructura

```
src/
  pages/            una pantalla por archivo (Appointments = agenda, PatientDetails = ficha)
  lib/              lógica sin UI: fechas locales, cuponeras, gift cards, stock, paginado
  lib/*.test.ts     tests de esa lógica
  components/       Layout, rutas protegidas, campos de cuponera
supabase/
  migrations/       SOLO migraciones incrementales recientes (ver "Pendientes")
  functions/        create-staff-user, manage-staff-user
```

## Convenciones que conviene respetar

- **Fechas:** la clínica está en UTC-3. Para "fecha de hoy" usar `localDateStr()` y para filtrar
  por días `localDayRangeIso()` (`src/lib/utils.ts`). Nunca `toISOString().split('T')[0]`: después
  de las 21:00 da el día siguiente.
- **Listas grandes:** Supabase corta en 1000 filas sin avisar. Para tablas que crecen usar
  `fetchAllRows()` (`src/lib/fetchAll.ts`) o filtrar por rango (la agenda trae solo el mes visible).
- **Cuponeras:** un turno consume sesión en los estados de `CONSUMED_STATUSES`
  (`src/lib/appointments.ts`); los pases mensuales vencen por fecha (`isCuponeraActive`).
- **Ingresos:** una cuponera o gift card es ingreso cuando se vende; el turno que la usa no suma.

## Pendientes conocidos

Necesitan acceso a la base de Supabase (el esquema base, las políticas RLS y las funciones
`wsp_*` del bot existen solo en la base, no en este repo):

1. Bajar el esquema al repo (`supabase db pull`) para versionarlo.
2. Pasar el bucket `patient-photos` a privado y servir las fotos con URLs firmadas.
3. RLS por rol (hoy cualquier usuario logueado puede leer y escribir todo vía API).
4. Mover a la base las reglas que hoy corren en el navegador sin transacción: superposición de
   turnos (exclusion constraint), consumo de sesiones de cuponera y alta/edición de turnos (RPC).
5. Corregir las deudas saldadas antes del arreglo de "Saldar deuda" (monto repetido por turno).

Del front:

- Moneda en servicios y pagos (hoy se asumen en pesos).
- Dashboard real del día (el Home es el editor de horarios).
- Partir `PatientDetails.tsx` y `Appointments.tsx` (2.600 y 2.000 líneas).
- Integración con WhatsApp (ManyChat + n8n) sobre las funciones `wsp_*`.
