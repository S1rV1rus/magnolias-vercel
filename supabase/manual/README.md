# Cambios manuales en la base (Supabase)

Scripts para correr a mano en **Supabase → SQL Editor**, en orden. Cada uno dice arriba si es de
solo lectura o si modifica algo. Los que modifican se escriben **después** de ver el resultado del
diagnóstico: el repo no tiene el esquema base, así que no se escriben a ciegas.

## Paso 1 — Diagnóstico (solo lectura)

1. Supabase → proyecto de Magnolias → **SQL Editor** → **New query**.
2. Pegar el contenido de [`01_diagnostico.sql`](01_diagnostico.sql) y **Run**.
3. Sale una sola celda `diagnostico` con un JSON. Copiarla entera (o **Export → CSV**) y pegarla
   en el chat.

No incluye datos personales: solo estructura (tablas, columnas, políticas, funciones, buckets),
conteos e IDs internos.

## Paso 2 — Versionar el esquema en el repo (recomendado, una sola vez)

Así el esquema queda en git y cualquier cambio futuro se puede revisar y repetir.

```bash
brew install supabase/tap/supabase
supabase login                                     # abre el navegador y pide un código
supabase link --project-ref nlyzbisnhgnplrzvgtnq   # pide la contraseña de la base
supabase db dump --linked -f supabase/schema.sql   # necesita Docker Desktop abierto
```

`db dump` exporta solo la estructura (sin datos) y corre `pg_dump` dentro de un contenedor, por eso
pide Docker. Revisar el archivo antes de commitearlo: no debería tener claves ni datos de
pacientes. Para actualizarlo después de cada cambio en la base, repetir solo el último comando.

El esquema ya está en [`supabase/schema.sql`](../schema.sql) (bajado el 2026-10-27). No incluye el
storage (buckets y sus políticas) ni los jobs de `pg_cron`: para eso sigue sirviendo el diagnóstico.

## Paso 3 — Cerrar los accesos públicos ✅ aplicado el 2026-10-27

Verificado en producción: como `anon`, `wsp_buscar_paciente` responde `permission denied`. Antes de
aplicarlo se confirmó con `pg_stat_statements` que el bot llama a todas las `wsp_*` con
`service_role`.

Hoy, con la clave pública de la web y sin loguearse, se pueden leer nombres, teléfonos y turnos de
pacientes a través de funciones y vistas del bot. [`02_cerrar_accesos_publicos.sql`](02_cerrar_accesos_publicos.sql)
las deja solo para la clave secreta (`service_role`). La web no las usa.

Antes de correrlo, dos chequeos en el dashboard:

1. **n8n usa la clave secreta.** En Supabase → Settings → API Keys, mirá los últimos caracteres de
   la clave `service_role` (o `secret`). En n8n → Credentials, abrí la credencial de Supabase (y
   cualquier nodo HTTP que llame a `.../rest/v1/rpc/wsp_...`) y fijate que sea esa, no la `anon`
   / `publishable`. Si alguna usa la pública, cambiala por la secreta antes de seguir.
2. **Nadie puede registrarse solo.** Authentication → Sign In / Providers → **"Allow new users to
   sign up" apagado**. Las reglas de la base dejan a cualquier usuario logueado leer y modificar
   todo, así que con el registro abierto cualquiera podría crearse una cuenta y entrar. El staff se
   crea desde Configuración (no necesita el registro público).

Después: correr el script; la tabla final tiene que mostrar `anon` y `authenticated` en `false`.
Probar el bot (una consulta de disponibilidad y el envío de recordatorios). Si algo falla con
"permission denied", correr el bloque DESHACER del final del script.

## Paso 4 — Fotos: cerrar el storage a la clave pública ✅ aplicado el 2026-10-27

El diagnóstico mostró que las políticas del bucket `patient-photos` están dadas a `public`: sin
loguearse se pueden listar, subir y **borrar** fotos clínicas.
[`03_fotos_politicas.sql`](03_fotos_politicas.sql) las deja solo para usuarios logueados. No
requiere cambios en el front (la web ya sube y borra con el usuario logueado).

```bash
supabase db query --linked -f supabase/manual/03_fotos_politicas.sql
```

La tabla final tiene que mostrar las 3 políticas con `{authenticated}`. Después: entrar a la app,
abrir una ficha con fotos (tienen que verse), subir una foto de prueba y borrarla.

## Paso 5 — Bucket de fotos privado ✅ aplicado el 2026-10-27 (después del deploy de a0e6a8b)

La web ya pide las fotos con URLs firmadas que vencen a las 8 horas (`src/lib/photos.ts`). Con eso
en producción, el bucket se puede hacer privado y una foto deja de abrirse por su URL directa.

1. Hacer push a `main` y esperar el deploy de Vercel.
2. En la web, abrir una ficha con fotos → clic derecho en una foto → "Abrir imagen en pestaña
   nueva". La dirección tiene que contener `/object/sign/` y `?token=`. Si dice `/object/public/`,
   el deploy todavía no llegó: esperar.
3. Correr [`04_bucket_fotos_privado.sql`](04_bucket_fotos_privado.sql):

   ```bash
   supabase db query --linked -f supabase/manual/04_bucket_fotos_privado.sql
   ```

   Tiene que mostrar `publico = false`.
4. Recargar la ficha: las fotos se siguen viendo. La dirección vieja con `/object/public/` ahora
   tiene que dar error.

## Resultado del diagnóstico (2026-10-27)

- ~450 turnos, ~530 pacientes, 13 usuarios (1 admin, 11 staff, 1 sin rol → ✅ era la cuenta del
  nuevo desarrollador; se le dio rol admin el 2026-10-27).
- Bucket `patient-photos` **público** con políticas abiertas → paso 4.
- **1 par de turnos activos superpuestos** en la misma sala → ✅ resuelto el 2026-10-27: era un
  duplicado (doble guardado del 03/09 19:00, Consultorio 2, misma paciente y cuponera). Se borró el
  de la sesión 5 y la cuponera quedó en 4 de 4. Pendiente que la clínica confirme si los dos canjes
  manuales del 16/05 de esa misma cuponera fueron dos sesiones reales.
- **0 deudas** con monto repetido → no hace falta script de corrección.

## Lo que viene después (en este orden)

| # | Cambio | Riesgo | Depende de |
|---|---|---|---|
| 05 | **Turnos superpuestos imposibles** en la misma sala (restricción `exclude` con `btree_gist`) | Falla si ya hay superposiciones | Resolver el par superpuesto |
| 06 | **Permisos por rol (RLS):** admin vs staff en configuración, borrados y contabilidad | Si una regla queda mal, el staff deja de ver algo | 02 |
| 07 | **Consumo de sesiones de cuponera en la base** (función atómica) | Cambia cómo guarda la agenda | 05 y 06 |
| — | Índices en turnos | Ninguno; con ~450 turnos todavía no hace falta | Cuando crezca |

Cada script nuevo va a venir con: qué hace, cómo verificar antes y después, y cómo deshacerlo.
