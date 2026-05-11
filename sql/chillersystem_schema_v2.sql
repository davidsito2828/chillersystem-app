-- ============================================================
-- CHILLERSYSTEM SRL — SUPABASE SCHEMA v2
-- Controller Financiero: Rentabilidad Real por Proyecto
-- Basado en: PLANILLA_GENERAL_DE_PPTOS.xlsm + SEGUIMIENTO_DE_VENTAS_1.xlsx
--
-- OBJETIVO: Trackear Ganancia Neta real de cada proyecto
-- para argumentar producción. Sin comisión fija.
--
-- FÓRMULA CENTRAL:
--   Ganancia Neta = Monto Cobrado
--                  - Costo Materiales
--                  - Otros Gastos Directos
--                  - Costo Horas/Sueldos Técnicos
--                  - IIBB + IDCB (6.21% sobre monto cobrado)
--
-- IMPUESTOS REALES:
--   IDCB = Impuesto a Débitos y Créditos Bancarios ("imp. al cheque")
--          0.6% débito + 0.6% crédito = 1.2%
--   IIBB = Ingresos Brutos (~3% a 5% según actividad/jurisdicción)
--   Agrupados en planilla como "IDCB/IIBB" = 6.21% sobre facturado
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TABLA: clientes
-- Maestro de clientes — fuente: todas las sheets del Excel
-- Clientes vistos: GASNEA, ATLAS, VISA OPS, PILKINGTON,
--   BOUZACK, CERTANT, HUENEI, CALL CENTER, FEROSISTEMAS, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre          TEXT NOT NULL UNIQUE,
    contacto        TEXT,                   -- nombre del contacto en la empresa
    email           TEXT,
    telefono        TEXT,
    tipo            TEXT DEFAULT 'no_abonado'
                    CHECK (tipo IN ('abonado', 'no_abonado')),
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes existentes del Excel (seed inicial)
INSERT INTO clientes (nombre, tipo) VALUES
    ('GASNEA',              'abonado'),
    ('ATLAS',               'abonado'),
    ('VISA OPS',            'abonado'),
    ('PILKINGTON',          'abonado'),
    ('BOUZACK',             'abonado'),
    ('CERTANT',             'abonado'),
    ('HUENEI',              'abonado'),
    ('SALUD PROFESIONAL',   'abonado'),
    ('CALL CENTER',         'no_abonado'),
    ('FEROSISTEMAS',        'no_abonado'),
    ('ZABALLA Y CARCHIO',   'no_abonado'),
    ('CONSORCIO 883',       'no_abonado'),
    ('TEMAIKEN',            'no_abonado'),
    ('CMQ',                 'no_abonado'),
    ('SEAL & CIA',          'no_abonado'),
    ('TORRE MAIPU',         'no_abonado'),
    ('GRAFICO IMPRESORES',  'no_abonado'),
    ('GCI SERVICIOS',       'no_abonado'),
    ('NAKU CONSTRUCCIONES', 'no_abonado'),
    ('GRUB',                'no_abonado')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 2. TABLA: tecnicos
-- Fuente: columna TECNICOS del Excel
-- Técnicos vistos: roda, cerveny, recalde, rodriguez, veron, jc
-- ============================================================
CREATE TABLE IF NOT EXISTS tecnicos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre          TEXT NOT NULL UNIQUE,
    costo_hora_ars  NUMERIC(12,2) NOT NULL DEFAULT 0,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Técnicos del Excel (completar costo/hora real)
INSERT INTO tecnicos (nombre, costo_hora_ars) VALUES
    ('RODA',        0),
    ('CERVENY',     0),
    ('RECALDE',     0),
    ('RODRIGUEZ',   0),
    ('VERON',       0),
    ('JC',          0)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 3. TABLA: impuestos_config
-- Solo los impuestos REALES que impactan en la planilla:
--   IIBB + IDCB agrupados = 6.21% (tal como figura en el Excel)
-- Configurable: si la tasa cambia, se actualiza acá y
-- se recalcula todo automáticamente.
-- ============================================================
CREATE TABLE IF NOT EXISTS impuestos_config (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre          TEXT NOT NULL UNIQUE,
    descripcion     TEXT,
    tasa_porcentaje NUMERIC(6,4) NOT NULL,
    activo          BOOLEAN DEFAULT TRUE,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO impuestos_config (nombre, descripcion, tasa_porcentaje) VALUES
    ('IIBB_IDCB',
     'Ingresos Brutos + Impuesto al Cheque (IDCB) agrupados. '
     'IDCB: 0.6% débito + 0.6% crédito = 1.2%. IIBB: ~5% según actividad. '
     'Total real aplicado en planilla: 6.21% sobre monto facturado.',
     6.2100)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 4. TABLA: presupuestos
-- TABLA CENTRAL — registro de cada presupuesto emitido
--
-- Fuente Sheet GENERAL:
--   NRO PPTO | FECHA | CLIENTE | SECTOR | EQUIPOS |
--   DESCRIPCION | INFORMES | PRECIO | 2DO PRECIO | ESTADO |
--   REALIZADO | TECNICOS
--
-- Fuente Sheet SEGUIMIENTO:
--   N° Presupuesto | Cliente | Contacto | Descripciones |
--   Monto | Estado | Fecha Respuesta | Notas | Próximo Paso
--
-- Fuente Sheets por cliente (ATLAS, VISA, PILKINGTON, etc.):
--   mismas columnas + campo ORDEN DE COMPRA (Pilkington)
-- ============================================================
CREATE TABLE IF NOT EXISTS presupuestos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identificación
    nro_presupuesto     TEXT NOT NULL UNIQUE,       -- NRO PPTO (ej: 1875, 42127)
    nro_informe         TEXT,                       -- INFORMES (ej: 98716, 1517)
    fecha               DATE NOT NULL,              -- FECHA del presupuesto
    sheet_origen        TEXT,                       -- GENERAL / VISA / ATLAS / PILKINGTON / etc.

    -- Cliente y ubicación
    cliente_id          UUID REFERENCES clientes(id),
    cliente_nombre      TEXT NOT NULL,              -- desnorm. para queries rápidas
    contacto            TEXT,                       -- CONTACTO (de Seguimiento)
    sector              TEXT,                       -- SECTOR (sala maquinas, terraza, comedor...)
    equipos             TEXT,                       -- EQUIPOS (Split, UTA, Chiller, Surray...)

    -- Descripción del trabajo
    descripcion         TEXT NOT NULL,              -- DESCRIPCION DEL TRABAJO

    -- Montos
    moneda              TEXT DEFAULT 'ARS'
                        CHECK (moneda IN ('ARS', 'USD')),
    monto_presupuestado NUMERIC(14,2),              -- PRECIO (primer oferta)
    monto_2do           NUMERIC(14,2),              -- 2DO PRECIO (alternativa/adicional)
    monto_aprobado      NUMERIC(14,2),              -- Monto efectivamente aprobado/cobrado

    -- Estado y seguimiento
    estado              TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN (
                            'aprobado',
                            'pendiente',
                            'rechazado',
                            'en_pausa',
                            'en_proceso',
                            'enviado_a_lucas'
                        )),
    realizado           BOOLEAN DEFAULT FALSE,      -- REALIZADO (si/no)
    fecha_respuesta     DATE,                       -- Fecha de aprobación/rechazo
    orden_compra        TEXT,                       -- ORDEN DE COMPRA (Pilkington)
    dias_transcurridos  INTEGER,                    -- de Sheet Seguimiento
    notas               TEXT,                       -- NOTAS
    proximo_paso        TEXT,                       -- PRÓXIMO PASO

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TABLA: presupuesto_tecnicos
-- Qué técnicos trabajaron en cada presupuesto y cuántas horas
-- Fuente: columna TECNICOS + Hs Técnico del Excel
-- ============================================================
CREATE TABLE IF NOT EXISTS presupuesto_tecnicos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    presupuesto_id      UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
    tecnico_id          UUID REFERENCES tecnicos(id),
    tecnico_nombre      TEXT NOT NULL,              -- desnorm. por si el técnico se da de baja
    horas_trabajadas    NUMERIC(6,2) DEFAULT 0,
    costo_hora_aplicado NUMERIC(12,2) DEFAULT 0,   -- costo al momento del trabajo (histórico)
    costo_total         NUMERIC(14,2)
        GENERATED ALWAYS AS
            (ROUND(horas_trabajadas * costo_hora_aplicado, 2)) STORED,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. TABLA: gastos_directos
-- Costos reales del proyecto una vez ejecutado
-- Fuente: Sheet "CONTROL DE GASTOS"
-- Columnas: N°Trabajo | Cliente | Fecha | Hs Técnico |
--   Costo Materiales | Otros Gastos | Total Gastos | Observaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS gastos_directos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    presupuesto_id      UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
    fecha_gasto         DATE DEFAULT CURRENT_DATE,
    concepto            TEXT,                       -- descripción del gasto
    costo_materiales    NUMERIC(14,2) DEFAULT 0,    -- Costo Materiales ($)
    otros_gastos        NUMERIC(14,2) DEFAULT 0,    -- Otros Gastos ($) — fletes, viáticos, etc.
    observaciones       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TABLA: resultados
-- TABLA CRÍTICA: Ganancia Neta real por proyecto
-- Se calcula automáticamente con triggers.
-- Es el argumento de tu producción.
--
-- FÓRMULA:
--   ganancia_neta = monto_cobrado
--                  - total_materiales
--                  - total_otros_gastos
--                  - total_costo_horas
--                  - (monto_cobrado * 6.21 / 100)  ← IIBB+IDCB
--
-- Nota: los campos GENERATED usan la tasa hardcodeada 6.21%
-- Si cambia la tasa, actualizar también esta tabla o usar función.
-- ============================================================
CREATE TABLE IF NOT EXISTS resultados (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    presupuesto_id          UUID NOT NULL REFERENCES presupuestos(id)
                            ON DELETE CASCADE UNIQUE,

    -- Desnormalizados para queries rápidas de ranking
    nro_presupuesto         TEXT,
    cliente_nombre          TEXT,
    fecha_trabajo           DATE,

    -- === INGRESO ===
    monto_cobrado           NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- === COSTOS (se actualizan con triggers) ===
    total_materiales        NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_otros_gastos      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_costo_horas       NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- === IMPUESTOS (IIBB + IDCB = 6.21% sobre cobrado) ===
    tasa_iibb_idcb          NUMERIC(6,4) NOT NULL DEFAULT 6.2100,
    importe_iibb_idcb       NUMERIC(14,2)
        GENERATED ALWAYS AS
            (ROUND(monto_cobrado * 6.2100 / 100, 2)) STORED,

    -- === TOTALES ===
    total_costos_directos   NUMERIC(14,2)
        GENERATED ALWAYS AS
            (total_materiales + total_otros_gastos + total_costo_horas) STORED,

    -- === GANANCIA NETA ===
    ganancia_neta           NUMERIC(14,2)
        GENERATED ALWAYS AS
            (monto_cobrado
             - total_materiales
             - total_otros_gastos
             - total_costo_horas
             - ROUND(monto_cobrado * 6.2100 / 100, 2)
            ) STORED,

    -- === RENTABILIDAD % ===
    rentabilidad_pct        NUMERIC(6,2)
        GENERATED ALWAYS AS
            (CASE WHEN monto_cobrado > 0 THEN
                ROUND(
                    (monto_cobrado
                     - total_materiales
                     - total_otros_gastos
                     - total_costo_horas
                     - ROUND(monto_cobrado * 6.2100 / 100, 2)
                    ) / monto_cobrado * 100
                , 2)
            ELSE 0 END) STORED,

    estado_resultado        TEXT DEFAULT 'en_curso'
                            CHECK (estado_resultado IN
                                ('en_curso', 'finalizado', 'verificado')),
    observaciones           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. FUNCIÓN: fn_recalcular_resultado
-- Recalcula los costos de un proyecto y actualiza resultados.
-- Se llama desde los triggers de gastos y técnicos.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_recalcular_resultado(p_presupuesto_id UUID)
RETURNS VOID AS $$
DECLARE
    v_ppto          presupuestos%ROWTYPE;
    v_materiales    NUMERIC := 0;
    v_otros         NUMERIC := 0;
    v_horas         NUMERIC := 0;
    v_monto         NUMERIC := 0;
BEGIN
    SELECT * INTO v_ppto FROM presupuestos WHERE id = p_presupuesto_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Monto cobrado: usar monto_aprobado si existe, sino monto_presupuestado
    v_monto := COALESCE(v_ppto.monto_aprobado, v_ppto.monto_presupuestado, 0);

    -- Sumar gastos directos
    SELECT
        COALESCE(SUM(costo_materiales), 0),
        COALESCE(SUM(otros_gastos), 0)
    INTO v_materiales, v_otros
    FROM gastos_directos
    WHERE presupuesto_id = p_presupuesto_id;

    -- Sumar costo de horas de técnicos
    SELECT COALESCE(SUM(costo_total), 0)
    INTO v_horas
    FROM presupuesto_tecnicos
    WHERE presupuesto_id = p_presupuesto_id;

    -- Insertar o actualizar resultado
    INSERT INTO resultados (
        presupuesto_id,
        nro_presupuesto,
        cliente_nombre,
        fecha_trabajo,
        monto_cobrado,
        total_materiales,
        total_otros_gastos,
        total_costo_horas
    )
    VALUES (
        p_presupuesto_id,
        v_ppto.nro_presupuesto,
        v_ppto.cliente_nombre,
        v_ppto.fecha,
        v_monto,
        v_materiales,
        v_otros,
        v_horas
    )
    ON CONFLICT (presupuesto_id) DO UPDATE SET
        nro_presupuesto    = EXCLUDED.nro_presupuesto,
        cliente_nombre     = EXCLUDED.cliente_nombre,
        fecha_trabajo      = EXCLUDED.fecha_trabajo,
        monto_cobrado      = EXCLUDED.monto_cobrado,
        total_materiales   = EXCLUDED.total_materiales,
        total_otros_gastos = EXCLUDED.total_otros_gastos,
        total_costo_horas  = EXCLUDED.total_costo_horas,
        updated_at         = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. TRIGGERS — Automatismos de recálculo
-- ============================================================

-- Trigger A: Al aprobar un presupuesto → crear resultado
CREATE OR REPLACE FUNCTION trg_fn_presupuesto_aprobado()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'aprobado' AND
       (OLD.estado IS DISTINCT FROM 'aprobado') THEN
        PERFORM fn_recalcular_resultado(NEW.id);
    END IF;
    -- Si cambia el monto aprobado, recalcular
    IF NEW.monto_aprobado IS DISTINCT FROM OLD.monto_aprobado THEN
        PERFORM fn_recalcular_resultado(NEW.id);
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presupuesto_aprobado ON presupuestos;
CREATE TRIGGER trg_presupuesto_aprobado
    BEFORE UPDATE ON presupuestos
    FOR EACH ROW EXECUTE FUNCTION trg_fn_presupuesto_aprobado();

-- Trigger B: Al cargar/modificar un gasto → recalcular resultado
CREATE OR REPLACE FUNCTION trg_fn_gasto_modificado()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_recalcular_resultado(
        COALESCE(NEW.presupuesto_id, OLD.presupuesto_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gasto_cambio ON gastos_directos;
CREATE TRIGGER trg_gasto_cambio
    AFTER INSERT OR UPDATE OR DELETE ON gastos_directos
    FOR EACH ROW EXECUTE FUNCTION trg_fn_gasto_modificado();

-- Trigger C: Al cargar/modificar horas de técnico → recalcular resultado
CREATE OR REPLACE FUNCTION trg_fn_horas_modificadas()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_recalcular_resultado(
        COALESCE(NEW.presupuesto_id, OLD.presupuesto_id)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_horas_cambio ON presupuesto_tecnicos;
CREATE TRIGGER trg_horas_cambio
    AFTER INSERT OR UPDATE OR DELETE ON presupuesto_tecnicos
    FOR EACH ROW EXECUTE FUNCTION trg_fn_horas_modificadas();

-- ============================================================
-- 10. VISTA: v_estado_presupuestos
-- Registro completo de todos los presupuestos emitidos.
-- Equivale a la Sheet GENERAL + Sheets por cliente.
-- ============================================================
CREATE OR REPLACE VIEW v_estado_presupuestos AS
SELECT
    p.nro_presupuesto,
    p.fecha,
    p.cliente_nombre,
    p.contacto,
    p.sector,
    p.equipos,
    p.descripcion,
    p.nro_informe,
    p.moneda,
    p.monto_presupuestado,
    p.monto_2do,
    p.monto_aprobado,
    p.estado,
    p.realizado,
    p.fecha_respuesta,
    p.dias_transcurridos,
    p.orden_compra,
    p.notas,
    p.proximo_paso,
    p.sheet_origen,
    -- Técnicos asignados (concatenados)
    STRING_AGG(DISTINCT pt.tecnico_nombre, ' / ') AS tecnicos
FROM presupuestos p
LEFT JOIN presupuesto_tecnicos pt ON pt.presupuesto_id = p.id
GROUP BY p.id,
    p.nro_presupuesto, p.fecha, p.cliente_nombre, p.contacto,
    p.sector, p.equipos, p.descripcion, p.nro_informe, p.moneda,
    p.monto_presupuestado, p.monto_2do, p.monto_aprobado, p.estado,
    p.realizado, p.fecha_respuesta, p.dias_transcurridos,
    p.orden_compra, p.notas, p.proximo_paso, p.sheet_origen
ORDER BY p.fecha DESC;

-- ============================================================
-- 11. VISTA: v_seguimiento_ventas
-- Panel de seguimiento activo — equivale a Sheet SEGUIMIENTO.
-- Solo muestra aprobados y pendientes (no rechazados).
-- ============================================================
CREATE OR REPLACE VIEW v_seguimiento_ventas AS
SELECT
    p.nro_presupuesto,
    p.fecha,
    p.cliente_nombre,
    p.contacto,
    p.descripcion,
    p.monto_presupuestado    AS monto,
    p.estado,
    p.fecha_respuesta,
    p.dias_transcurridos,
    p.notas,
    p.proximo_paso
FROM presupuestos p
WHERE p.estado IN ('aprobado', 'pendiente', 'en_proceso', 'en_pausa')
ORDER BY p.fecha DESC;

-- ============================================================
-- 12. VISTA: v_resumen_conversion
-- Totales por estado — equivale al Sheet RESUMEN del Excel.
-- ============================================================
CREATE OR REPLACE VIEW v_resumen_conversion AS
SELECT
    estado,
    COUNT(*)                        AS cantidad,
    SUM(monto_presupuestado)        AS monto_total_presupuestado,
    SUM(monto_aprobado)             AS monto_total_aprobado,
    ROUND(AVG(monto_presupuestado), 0) AS ticket_promedio
FROM presupuestos
GROUP BY estado

UNION ALL

SELECT
    'TOTAL'                         AS estado,
    COUNT(*),
    SUM(monto_presupuestado),
    SUM(monto_aprobado),
    ROUND(AVG(monto_presupuestado), 0)
FROM presupuestos

ORDER BY estado;

-- ============================================================
-- 13. VISTA: v_ganancia_neta_proyectos
-- VISTA PRINCIPAL DE PRODUCCIÓN — /balance_empresa
-- Muestra la ganancia neta real de cada proyecto finalizado.
-- Con todos los descuentos aplicados.
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
    -- Ingresos
    r.monto_cobrado,
    -- Costos detallados
    r.total_materiales,
    r.total_otros_gastos,
    r.total_costo_horas,
    r.total_costos_directos,
    -- Impuestos
    r.tasa_iibb_idcb                AS tasa_impuestos_pct,
    r.importe_iibb_idcb             AS importe_impuestos,
    -- Resultado final
    r.ganancia_neta,
    r.rentabilidad_pct,
    r.estado_resultado,
    -- Técnicos
    STRING_AGG(DISTINCT pt.tecnico_nombre, ' / ') AS tecnicos
FROM resultados r
JOIN presupuestos p ON p.id = r.presupuesto_id
LEFT JOIN presupuesto_tecnicos pt ON pt.presupuesto_id = p.id
GROUP BY
    r.id, r.nro_presupuesto, r.fecha_trabajo, r.cliente_nombre,
    p.sector, p.equipos, p.descripcion, p.moneda,
    r.monto_cobrado, r.total_materiales, r.total_otros_gastos,
    r.total_costo_horas, r.total_costos_directos,
    r.tasa_iibb_idcb, r.importe_iibb_idcb,
    r.ganancia_neta, r.rentabilidad_pct, r.estado_resultado
ORDER BY r.ganancia_neta DESC;

-- ============================================================
-- 14. VISTA: v_ranking_produccion
-- ARGUMENTO DE PRODUCCIÓN — ranking de proyectos por ganancia
-- generada. Ordenado de mayor a menor. Listo para exportar.
-- ============================================================
CREATE OR REPLACE VIEW v_ranking_produccion AS
SELECT
    ROW_NUMBER() OVER (ORDER BY r.ganancia_neta DESC) AS ranking,
    r.nro_presupuesto,
    r.fecha_trabajo                 AS fecha,
    r.cliente_nombre,
    p.descripcion,
    r.monto_cobrado,
    r.total_costos_directos,
    r.importe_iibb_idcb,
    r.ganancia_neta,
    r.rentabilidad_pct              AS rentabilidad_pct,
    CASE
        WHEN r.rentabilidad_pct >= 70 THEN 'EXCELENTE'
        WHEN r.rentabilidad_pct >= 50 THEN 'BUENA'
        WHEN r.rentabilidad_pct >= 35 THEN 'REGULAR'
        ELSE 'BAJA'
    END                             AS categoria_rentabilidad
FROM resultados r
JOIN presupuestos p ON p.id = r.presupuesto_id
WHERE r.estado_resultado IN ('finalizado', 'verificado')
ORDER BY r.ganancia_neta DESC;

-- ============================================================
-- 15. VISTA: v_produccion_por_cliente
-- Ganancia generada agrupada por cliente.
-- Muestra tu aporte por cuenta.
-- ============================================================
CREATE OR REPLACE VIEW v_produccion_por_cliente AS
SELECT
    r.cliente_nombre,
    COUNT(*)                        AS proyectos_finalizados,
    SUM(r.monto_cobrado)            AS facturacion_total,
    SUM(r.total_costos_directos)    AS costos_totales,
    SUM(r.importe_iibb_idcb)        AS impuestos_totales,
    SUM(r.ganancia_neta)            AS ganancia_neta_total,
    ROUND(AVG(r.rentabilidad_pct), 2) AS rentabilidad_promedio_pct
FROM resultados r
WHERE r.estado_resultado IN ('finalizado', 'verificado')
GROUP BY r.cliente_nombre
ORDER BY SUM(r.ganancia_neta) DESC;

-- ============================================================
-- 16. VISTA: v_produccion_periodo
-- Ganancia neta por mes — útil para mostrar evolución.
-- ============================================================
CREATE OR REPLACE VIEW v_produccion_periodo AS
SELECT
    DATE_TRUNC('month', r.fecha_trabajo)::DATE  AS periodo,
    TO_CHAR(r.fecha_trabajo, 'Month YYYY')      AS mes,
    COUNT(*)                                    AS proyectos,
    SUM(r.monto_cobrado)                        AS facturado,
    SUM(r.ganancia_neta)                        AS ganancia_neta,
    ROUND(AVG(r.rentabilidad_pct), 2)           AS rentabilidad_prom_pct
FROM resultados r
WHERE r.estado_resultado IN ('finalizado', 'verificado')
GROUP BY DATE_TRUNC('month', r.fecha_trabajo), TO_CHAR(r.fecha_trabajo, 'Month YYYY')
ORDER BY DATE_TRUNC('month', r.fecha_trabajo) DESC;

-- ============================================================
-- 17. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado      ON presupuestos(estado);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente     ON presupuestos(cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha       ON presupuestos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_presupuestos_nro         ON presupuestos(nro_presupuesto);
CREATE INDEX IF NOT EXISTS idx_gastos_presupuesto       ON gastos_directos(presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_tecnicos_presupuesto     ON presupuesto_tecnicos(presupuesto_id);
CREATE INDEX IF NOT EXISTS idx_resultados_ganancia      ON resultados(ganancia_neta DESC);
CREATE INDEX IF NOT EXISTS idx_resultados_cliente       ON resultados(cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_resultados_fecha         ON resultados(fecha_trabajo DESC);

-- ============================================================
-- 18. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE clientes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_tecnicos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_directos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultados              ENABLE ROW LEVEL SECURITY;
ALTER TABLE impuestos_config        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso total autenticado" ON clientes
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON tecnicos
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON presupuestos
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON presupuesto_tecnicos
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON gastos_directos
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON resultados
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acceso total autenticado" ON impuestos_config
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- FIN DEL SCHEMA v2
-- ============================================================
-- COMANDOS DE CONSULTA RÁPIDA:
--
--   /balance_empresa   → SELECT * FROM v_ganancia_neta_proyectos;
--   /ranking           → SELECT * FROM v_ranking_produccion;
--   /por_cliente       → SELECT * FROM v_produccion_por_cliente;
--   /evolucion         → SELECT * FROM v_produccion_periodo;
--   /presupuestos      → SELECT * FROM v_estado_presupuestos;
--   /seguimiento       → SELECT * FROM v_seguimiento_ventas;
--   /conversion        → SELECT * FROM v_resumen_conversion;
-- ============================================================
