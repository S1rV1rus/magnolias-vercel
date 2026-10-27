-- ============================================================================
-- 04_bucket_fotos_privado.sql — MODIFICA LA CONFIGURACIÓN DEL BUCKET. No toca
-- ninguna foto.
--
-- Qué hace: pasa el bucket patient-photos a privado. Hoy una foto se abre con
-- su URL directa (/storage/v1/object/public/...) sin estar logueado. Después
-- de esto, solo se abre con una URL firmada que pide la web con el usuario
-- logueado (y que vence a las 8 horas).
--
-- ⚠️ ORDEN: correrlo SOLO DESPUÉS de que esté en producción (Vercel) la
-- versión de la web que usa URLs firmadas (src/lib/photos.ts). Si se corre
-- antes, las fotos dejan de verse en la ficha hasta que se haga el deploy.
-- Cómo comprobarlo: abrir una ficha con fotos en la web, clic derecho en una
-- foto → "Abrir imagen en pestaña nueva": la dirección tiene que contener
-- /object/sign/ y "?token=". Si dice /object/public/, todavía no se deployó.
--
-- Cómo: supabase db query --linked -f supabase/manual/04_bucket_fotos_privado.sql
-- (o en el dashboard: Storage → patient-photos → Edit bucket → apagar
-- "Public bucket"). Al final muestra el bucket: publico tiene que ser false.
--
-- Para deshacer: el bloque "DESHACER" al final del archivo.
-- ============================================================================

begin;

update storage.buckets set public = false where id = 'patient-photos';

commit;

-- Verificación: publico = false
select id, public as publico from storage.buckets where id = 'patient-photos';

-- ============================================================================
-- DESHACER: copiar a una query nueva la línea de abajo, sacarle el "-- " y
-- correrla.
-- ============================================================================
-- update storage.buckets set public = true where id = 'patient-photos';
