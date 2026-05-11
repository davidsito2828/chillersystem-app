-- ============================================================
-- PATCH: Soporte USD con convertibilidad automática a ARS
-- Chillersystem SRL — Agregar a continuación del schema_v2.sql
-- API de cotización: https://dolarapi.com (gratuita, sin key)
-- Tipos disponibles: oficial, blue, mep, ccl, mayorista
-- ============================================================

-- ============================================================
-- 1. TABLA: tipos_cambio
-- Historial de cotizaciones por día y tipo.
-- Se actualiza desde la app (Next.js) via API dolarapi.com
-- Permite auditar a qué tipo de cambio se convirtió cada trabajo.
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_cambio (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha           DATE NOT NULL,
    tipo            TEXT NOT NULL
                    CHECK (tipo IN ('oficial', 'blue', 'mep', 'ccl', 'mayorista')),
    compra          NUMERIC(12,2) NOT NULL,
    venta           NUMERIC(12,2) NOT NULL,
    fuente          TEXT DEFAULT 'dolarapi.com',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (fecha, tipo)
);

-- Índice para búsqueda rápida por fecha
CREATE INDEX IF NOT EXISTS idx_tc_fecha_tipo ON tipos_cambio(fecha DESC, tipo);

-- Política RLS
ALTER TABLE tipos_cambio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total autenticado" ON tipos_cambio
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- 2. COLUMNAS USD en presupuestos
-- monto_usd        → importe en dólares (lo que cargás vos)
-- tc_fecha_aplicado → fecha del tipo de cambio usado
-- tc_tipo_aplicado  → oficial / blue / mep / ccl
-- tc_valor_aplicado → valor ARS/USD al momento de la carga
-- monto_ars_convertido → resultado de la conversión
-- ============================================================
ALTER TABLE presupuestos
    ADD COLUMN IF NOT EXISTS monto_usd           NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS tc_fecha_aplicado   DATE,
    ADD COLUMN IF NOT EXISTS tc_tipo_aplicado    TEXT DEFAULT 'oficial'
        CHECK (tc_tipo_aplicado IN ('oficial','blue','mep','ccl','mayorista')),
    ADD COLUMN IF NOT EXISTS tc_valor_aplicado   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS monto_ars_convertido NUMERIC(14,2);

-- Comentario: monto_ars_convertido = monto_usd * tc_valor_aplicado
-- Se calcula en la app al guardar y se almacena para trazabilidad histórica.
-- NO se usa GENERATED ALWAYS porque el tipo de cambio es externo y variable.

-- ============================================================
-- 3. COLUMNAS USD en gastos_directos
-- Para materiales o insumos comprados en dólares
-- ============================================================
ALTER TABLE gastos_directos
    ADD COLUMN IF NOT EXISTS costo_materiales_usd    NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS tc_materiales_valor     NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS costo_materiales_conv   NUMERIC(14,2);
-- costo_materiales_conv = costo_materiales_usd * tc_materiales_valor

-- ============================================================
-- 4. FUNCIÓN: fn_convertir_usd_a_ars
-- Busca el tipo de cambio más cercano a la fecha dada
-- y devuelve el valor de venta para el tipo solicitado.
-- Si no existe cotización para ese día exacto, toma la más reciente anterior.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_convertir_usd_a_ars(
    p_monto_usd     NUMERIC,
    p_fecha         DATE DEFAULT CURRENT_DATE,
    p_tipo          TEXT DEFAULT 'oficial'
)
RETURNS NUMERIC AS $$
DECLARE
    v_tc    NUMERIC;
BEGIN
    -- Buscar cotización exacta o la más reciente anterior
    SELECT venta INTO v_tc
    FROM tipos_cambio
    WHERE tipo = p_tipo
      AND fecha <= p_fecha
    ORDER BY fecha DESC
    LIMIT 1;

    IF v_tc IS NULL THEN
        RAISE EXCEPTION 'No hay cotización de tipo % cargada para fecha %', p_tipo, p_fecha;
    END IF;

    RETURN ROUND(p_monto_usd * v_tc, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. FUNCIÓN: fn_tc_vigente
-- Devuelve el tipo de cambio vigente (venta) para hoy o la fecha dada.
-- Útil para llamar desde la app antes de guardar.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_tc_vigente(
    p_tipo  TEXT DEFAULT 'oficial',
    p_fecha DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_tc NUMERIC;
BEGIN
    SELECT venta INTO v_tc
    FROM tipos_cambio
    WHERE tipo = p_tipo
      AND fecha <= p_fecha
    ORDER BY fecha DESC
    LIMIT 1;
    RETURN v_tc;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. VISTA: v_cotizacion_hoy
-- Muestra las cotizaciones vigentes del día.
-- La app puede consultarla para mostrar el banner de tipo de cambio.
-- ============================================================
CREATE OR REPLACE VIEW v_cotizacion_hoy AS
SELECT
    tipo,
    fecha,
    compra,
    venta,
    fuente,
    CURRENT_DATE - fecha AS dias_desde_actualizacion
FROM tipos_cambio
WHERE (tipo, fecha) IN (
    SELECT tipo, MAX(fecha)
    FROM tipos_cambio
    GROUP BY tipo
)
ORDER BY tipo;

-- ============================================================
-- 7. ACTUALIZAR v_ganancia_neta_proyectos con columna USD
-- Reemplaza la vista anterior para incluir montos en USD
-- ============================================================
CREATE OR REPLACE VIEW v_ganancia_neta_proyectos AS
SELECT
    r.nro_presupuesto,
    r.fecha_trabajo                 AS fecha,
    r.cliente_nombre,
    p.sector,
    p.equipos,
    p.descripcion,
    p.moneda,
    -- Monto original
    p.monto_usd,
    p.tc_tipo_aplicado,
    p.tc_valor_aplicado,
    p.monto_ars_convertido,
    -- Monto usado para el cálculo (ARS siempre)
    r.monto_cobrado                 AS monto_cobrado_ars,
    -- Costos
    r.total_materiales,
    r.total_otros_gastos,
    r.total_costo_horas,
    r.total_costos_directos,
    -- Impuestos
    r.tasa_iibb_idcb                AS tasa_impuestos_pct,
    r.importe_iibb_idcb             AS importe_impuestos,
    -- Resultado
    r.ganancia_neta,
    r.rentabilidad_pct,
    r.estado_resultado,
    STRING_AGG(DISTINCT pt.tecnico_nombre, ' / ') AS tecnicos
FROM resultados r
JOIN presupuestos p ON p.id = r.presupuesto_id
LEFT JOIN presupuesto_tecnicos pt ON pt.presupuesto_id = p.id
GROUP BY
    r.id, r.nro_presupuesto, r.fecha_trabajo, r.cliente_nombre,
    p.sector, p.equipos, p.descripcion, p.moneda,
    p.monto_usd, p.tc_tipo_aplicado, p.tc_valor_aplicado, p.monto_ars_convertido,
    r.monto_cobrado, r.total_materiales, r.total_otros_gastos,
    r.total_costo_horas, r.total_costos_directos,
    r.tasa_iibb_idcb, r.importe_iibb_idcb,
    r.ganancia_neta, r.rentabilidad_pct, r.estado_resultado
ORDER BY r.ganancia_neta DESC;

-- ============================================================
-- 8. SEED: Presupuestos USD — actualizar los 3 casos del Excel
-- BAZURCO ($680 USD), CRC ($560 USD), BMC ($19.600 USD)
-- tc_valor_aplicado = 1400 (oficial venta aprox. hoy 26/03/2026)
-- Ajustar si el tipo de cambio real al momento era distinto
-- ============================================================

-- Cotización de referencia inicial (ajustar según el día real)
INSERT INTO tipos_cambio (fecha, tipo, compra, venta, fuente)
VALUES
    ('2026-01-19', 'oficial', 1350.00, 1400.00, 'dolarapi.com - seed manual'),
    ('2026-03-26', 'oficial', 1350.00, 1400.00, 'dolarapi.com - seed manual')
ON CONFLICT (fecha, tipo) DO NOTHING;

-- Actualizar los 3 presupuestos USD
UPDATE presupuestos SET
    moneda                = 'USD',
    monto_usd             = 680,
    tc_fecha_aplicado     = '2026-01-19',
    tc_tipo_aplicado      = 'oficial',
    tc_valor_aplicado     = 1400,
    monto_ars_convertido  = 680 * 1400,        -- $952.000 ARS
    monto_presupuestado   = 680 * 1400,
    monto_aprobado        = NULL               -- pendiente de aprobación
WHERE nro_presupuesto = '1950';                -- BAZURCO

UPDATE presupuestos SET
    moneda                = 'USD',
    monto_usd             = 560,
    tc_fecha_aplicado     = '2026-01-20',
    tc_tipo_aplicado      = 'oficial',
    tc_valor_aplicado     = 1400,
    monto_ars_convertido  = 560 * 1400,        -- $784.000 ARS
    monto_presupuestado   = 560 * 1400
WHERE nro_presupuesto = '1951';                -- CRC

UPDATE presupuestos SET
    moneda                = 'USD',
    monto_usd             = 19600,
    tc_fecha_aplicado     = '2026-01-19',
    tc_tipo_aplicado      = 'oficial',
    tc_valor_aplicado     = 1400,
    monto_ars_convertido  = 19600 * 1400,      -- $27.440.000 ARS
    monto_presupuestado   = 19600 * 1400
WHERE nro_presupuesto = '1949';                -- BMC

-- ============================================================
-- FIN PATCH USD
-- ============================================================
-- Verificar cotizaciones cargadas:
--   SELECT * FROM v_cotizacion_hoy;
--
-- Verificar presupuestos USD:
--   SELECT nro_presupuesto, cliente_nombre, moneda, monto_usd,
--          tc_valor_aplicado, monto_ars_convertido
--   FROM presupuestos WHERE moneda = 'USD';
--
-- Convertir un monto puntual:
--   SELECT fn_convertir_usd_a_ars(1000, CURRENT_DATE, 'oficial');
-- ============================================================
