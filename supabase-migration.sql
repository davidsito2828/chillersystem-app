
  ADD COLUMN IF NOT EXISTS lecturas_operativas jsonb,
  ADD COLUMN IF NOT EXISTS correctivo_resuelto boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resuelto_por_id uuid;

-- Optional foreign key constraint if you want to enforce resolution relationships
-- ALTER TABLE intervenciones
--   ADD CONSTRAINT intervenciones_resuelto_por_fk FOREIGN KEY (resuelto_por_id)
--   REFERENCES intervenciones(id);
