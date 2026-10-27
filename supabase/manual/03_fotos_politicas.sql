-- ============================================================================
-- 03_fotos_politicas.sql — MODIFICA PERMISOS DEL STORAGE. No toca ninguna foto.
--
-- Problema (diagnóstico del 2026-10-27): las 3 políticas del bucket
-- patient-photos están dadas al rol "public", que incluye a anon. Con la clave
-- pública de la web y sin loguearse, cualquiera puede LISTAR todas las fotos
-- clínicas (y así obtener sus rutas), SUBIR archivos y BORRAR fotos.
--
-- Arreglo: las mismas 3 políticas, pero solo para usuarios logueados
-- (authenticated). La web sube y borra fotos con el usuario logueado, así que
-- sigue funcionando igual.
--
-- Qué NO cambia todavía: el bucket sigue siendo público, así que una foto se
-- puede abrir por su URL directa. Las rutas tienen 3 UUID al azar
-- (paciente/entrada/archivo), así que sin poder listar no se pueden adivinar.
-- Pasar el bucket a privado requiere antes un cambio en el front (URLs
-- firmadas): queda para un paso siguiente.
--
-- Cómo: supabase db query --linked -f supabase/manual/03_fotos_politicas.sql
-- (o SQL Editor → pegar todo → Run). Al final muestra las políticas: las 3
-- tienen que decir {authenticated}.
--
-- Para deshacer: el bloque "DESHACER" al final del archivo.
-- ============================================================================

begin;

drop policy if exists "Public read patient photos"  on storage.objects;
drop policy if exists "Allow upload patient photos" on storage.objects;
drop policy if exists "Allow delete patient photos" on storage.objects;

create policy "patient-photos: ver (staff)" on storage.objects
  for select to authenticated using (bucket_id = 'patient-photos');

create policy "patient-photos: subir (staff)" on storage.objects
  for insert to authenticated with check (bucket_id = 'patient-photos');

create policy "patient-photos: borrar (staff)" on storage.objects
  for delete to authenticated using (bucket_id = 'patient-photos');

commit;

-- Verificación: 3 políticas, todas con roles = {authenticated}
select policyname as politica, cmd as accion, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, with_check) like '%patient-photos%'
order by cmd;

-- ============================================================================
-- DESHACER: copiar a una query nueva el bloque de abajo, sacarle los "-- " del
-- principio de cada línea y correrlo.
-- ============================================================================
-- begin;
-- drop policy if exists "patient-photos: ver (staff)"    on storage.objects;
-- drop policy if exists "patient-photos: subir (staff)"  on storage.objects;
-- drop policy if exists "patient-photos: borrar (staff)" on storage.objects;
-- create policy "Public read patient photos"  on storage.objects for select using (bucket_id = 'patient-photos');
-- create policy "Allow upload patient photos" on storage.objects for insert with check (bucket_id = 'patient-photos');
-- create policy "Allow delete patient photos" on storage.objects for delete using (bucket_id = 'patient-photos');
-- commit;
