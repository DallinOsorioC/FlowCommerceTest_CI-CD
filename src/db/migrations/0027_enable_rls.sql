-- Supabase expone por su API pública (PostgREST) todas las tablas del esquema
-- public, y la clave "anon" va dentro del frontend. Con RLS desactivado, esa
-- clave podría leer y escribir cualquier tabla sin pasar por esta API.
--
-- Con RLS activado y SIN políticas, los roles anon y authenticated no ven ni
-- tocan nada. El backend se conecta con el rol dueño de las tablas (postgres),
-- que se salta RLS, así que no le afecta. Si algún día el frontend lee tablas
-- directo (p. ej. Realtime), habrá que crear políticas por proyecto.
--
-- Cubre las tablas existentes. Las nuevas deben activar RLS en su propia
-- migración: test/rls.e2e-spec.ts falla si alguna tabla de public lo olvida.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      t.schemaname,
      t.tablename
    );
  END LOOP;
END
$$;
