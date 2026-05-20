-- ============================================================
-- Tabla: blog_reads
-- Registra qué empleada leyó cada nota del blog y cuándo.
-- Un usuario solo se registra una vez por nota (UNIQUE).
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_reads (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    note_id     uuid NOT NULL REFERENCES blog_notes(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    user_name   text NOT NULL,
    read_at     timestamptz DEFAULT now()
);

-- Un usuario solo puede registrar una lectura por nota
ALTER TABLE blog_reads
    ADD CONSTRAINT blog_reads_unique_user_note UNIQUE (note_id, user_id);

-- Índice para buscar lecturas por nota rápidamente
CREATE INDEX IF NOT EXISTS idx_blog_reads_note_id ON blog_reads(note_id);

-- RLS: Permitir lectura a todos los autenticados, inserción solo del propio usuario
ALTER TABLE blog_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cualquier autenticado puede ver lecturas"
    ON blog_reads FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Cada usuario registra su propia lectura"
    ON blog_reads FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
