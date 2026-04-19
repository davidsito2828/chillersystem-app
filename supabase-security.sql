-- ═══════════════════════════════════════════════════════════════
--  ChillerSystem · Script de Seguridad · Supabase Auth + RLS
--  Ejecutar en: Supabase Dashboard → SQL Editor
--  ORDEN: 1) Crear usuarios en Auth → 2) Ejecutar este script
-- ═══════════════════════════════════════════════════════════════

-- PASO 1: Agregar columna para vincular usuarios de la app con Supabase Auth
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;

-- PASO 2: Actualizar emails de usuarios (formato: usuario@chillersystem.app)
UPDATE usuarios SET email = usuario || '@chillersystem.app' WHERE email IS NULL;

-- PASO 3: Habilitar RLS en todas las tablas críticas
ALTER TABLE clientes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervenciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios              ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE preventivos_aprobacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas_realizadas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas_config         ENABLE ROW LEVEL SECURITY;

-- PASO 4: Políticas para tablas de datos (solo usuarios autenticados)
-- Clientes
DROP POLICY IF EXISTS "solo_auth" ON clientes;
CREATE POLICY "solo_auth" ON clientes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Equipos
DROP POLICY IF EXISTS "solo_auth" ON equipos;
CREATE POLICY "solo_auth" ON equipos FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Intervenciones
DROP POLICY IF EXISTS "solo_auth" ON intervenciones;
CREATE POLICY "solo_auth" ON intervenciones FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Presupuestos
DROP POLICY IF EXISTS "solo_auth" ON presupuestos;
CREATE POLICY "solo_auth" ON presupuestos FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Preventivos aprobacion
DROP POLICY IF EXISTS "solo_auth" ON preventivos_aprobacion;
CREATE POLICY "solo_auth" ON preventivos_aprobacion FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tareas realizadas
DROP POLICY IF EXISTS "solo_auth" ON tareas_realizadas;
CREATE POLICY "solo_auth" ON tareas_realizadas FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Tareas config
DROP POLICY IF EXISTS "solo_auth" ON tareas_config;
CREATE POLICY "solo_auth" ON tareas_config FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- PASO 5: Política especial para tabla usuarios (todos los autenticados pueden leer)
DROP POLICY IF EXISTS "auth_read_usuarios" ON usuarios;
DROP POLICY IF EXISTS "auth_write_usuarios" ON usuarios;
CREATE POLICY "auth_read_usuarios" ON usuarios FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_usuarios" ON usuarios FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_write_update" ON usuarios FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_write_delete" ON usuarios FOR DELETE USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
--  PASO 6: Crear usuarios en Supabase Auth
--  Hacerlo desde: Authentication → Users → Add User (en dashboard)
--
--  Usuario         → Email para Supabase Auth        → Contraseña
--  admin           → admin@chillersystem.app          → chiller2024
--  christian       → christian@chillersystem.app      → christian1234
--  cerveny         → cerveny@chillersystem.app         → cerveny1234
--  fernanda        → fernanda@chillersystem.app        → fernanda1234
--  julian          → julian@chillersystem.app          → julian1234
--  Lucas           → lucas@chillersystem.app           → lucascinzano
--  roda            → roda@chillersystem.app            → roda1234
--  norberto        → norberto@chillersystem.app        → norberto1234
-- ═══════════════════════════════════════════════════════════════

-- PASO 7 (opcional): Vincular auth_user_id después de crear usuarios en Auth
-- Correr esto DESPUÉS de crear los usuarios arriba:
/*
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'admin@chillersystem.app') WHERE usuario = 'admin';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'christian@chillersystem.app') WHERE usuario = 'christian';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'cerveny@chillersystem.app') WHERE usuario = 'cerveny';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'fernanda@chillersystem.app') WHERE usuario = 'fernanda';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'julian@chillersystem.app') WHERE usuario = 'julian';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'lucas@chillersystem.app') WHERE usuario = 'Lucas';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'roda@chillersystem.app') WHERE usuario = 'roda';
UPDATE usuarios SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'norberto@chillersystem.app') WHERE usuario = 'norberto';
*/

-- VERIFICAR que los usuarios de Auth existen:
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at;
