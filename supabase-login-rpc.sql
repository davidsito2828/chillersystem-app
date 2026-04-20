-- ═══════════════════════════════════════════════════════════════
--  ChillerSystem · Función RPC de Login Legacy
--  Ejecutar en: Supabase Dashboard → SQL Editor
--
--  IMPORTANTE: Ejecutar esto ANTES de deployar la nueva versión del frontend.
--  Esta función permite que el login funcione para usuarios que aún no
--  fueron migrados a Supabase Auth, sin exponer contraseñas a través de RLS.
--
--  INSTRUCCIONES:
--  1. Ir a Supabase Dashboard → SQL Editor
--  2. Pegar y ejecutar este script completo
--  3. Luego deployar los cambios del frontend a Vercel
-- ═══════════════════════════════════════════════════════════════

-- Función RPC: login_usuario
-- Verifica credenciales legacy de forma segura (SECURITY DEFINER bypassa RLS)
-- Retorna los datos del usuario si las credenciales son correctas, o vacío si no
CREATE OR REPLACE FUNCTION login_usuario(p_usuario TEXT, p_password TEXT)
RETURNS TABLE (
  id          UUID,
  nombre      TEXT,
  usuario     TEXT,
  rol         TEXT,
  activo      BOOLEAN,
  jerarquia   TEXT,
  empresa     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER  -- bypassa RLS: puede leer usuarios sin autenticación JWT
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      u.id,
      u.nombre,
      u.usuario,
      u.rol,
      u.activo,
      u.jerarquia,
      u.empresa
    FROM usuarios u
    WHERE u.usuario    = p_usuario
      AND u.password   = p_password    -- comparación directa (legacy)
      AND u.activo     = TRUE;
END;
$$;

-- Dar permisos de ejecución a la anon key (sin autenticación)
GRANT EXECUTE ON FUNCTION login_usuario(TEXT, TEXT) TO anon;

-- ═══════════════════════════════════════════════════════════════
--  VERIFICAR que funciona:
--  SELECT * FROM login_usuario('admin', 'chiller2024');
--  Debe devolver una fila con los datos del admin.
-- ═══════════════════════════════════════════════════════════════
