-- ============================================================
-- SEED DATA: Presupuestos y Gastos desde Enero 2026
-- Generado automáticamente desde Excel
-- 35 presupuestos | 8 registros de gastos
-- ============================================================

-- Clientes nuevos no presentes en el seed inicial
INSERT INTO clientes (nombre, tipo) VALUES
    ('BAZURCO', 'no_abonado'),
    ('BCO PATAGONIA', 'no_abonado'),
    ('BMC', 'no_abonado'),
    ('CRC', 'no_abonado'),
    ('CRISTIAN MORIGI', 'no_abonado'),
    ('ESTUDIO DAMERO', 'no_abonado'),
    ('FRANCO ARGENTINA', 'no_abonado'),
    ('GALICIA', 'no_abonado'),
    ('HOSPITAL CUENCA ALTA', 'no_abonado'),
    ('LAPERRETTA', 'no_abonado'),
    ('MARIA SCHIUMA', 'no_abonado'),
    ('MARIANA BERGONSELLI', 'no_abonado'),
    ('MOTORARG', 'no_abonado'),
    ('SANTA OFELIA', 'no_abonado'),
    ('TAMARA AFONSO', 'no_abonado'),
    ('TENOACCION', 'no_abonado'),
    ('TORRE MADERO', 'no_abonado'),
    ('VISA', 'no_abonado')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- PRESUPUESTOS 2026 (35 registros)
-- ============================================================
INSERT INTO presupuestos (
    nro_presupuesto, nro_informe, fecha, sheet_origen,
    cliente_nombre, contacto, sector, equipos, descripcion,
    moneda, monto_presupuestado, monto_2do, monto_aprobado,
    estado, realizado, notas, proximo_paso
) VALUES
    ('1931', NULL, '2026-12-29', 'GENERAL',
     'VISA', '2do piso', '2do piso', 'oficina nahuel', 'movimiento de equipo piso techo 3tr surray',
     'ARS', 1569000.0, NULL, 1569000.0,
     'aprobado', TRUE, NULL, NULL),
    ('1932', NULL, '2026-12-29', 'GENERAL',
     'HUENEI', '3 erpiso', '3er piso', 'equipo central', 'reparacion de motoro, bobinado y rodamientos',
     'ARS', 1380000.0, NULL, 1380000.0,
     'aprobado', TRUE, NULL, NULL),
    ('43242', NULL, '2026-01-03', 'GENERAL',
     'ATLAS', 'sala de maquinas', 'sala de maquinas', 'uta 11', 'adicional del 42284- reemp. De rodamientos',
     'ARS', 1850000.0, NULL, 1850000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1935', NULL, '2026-01-05', 'GENERAL',
     'TORRE MADERO', NULL, 'varios pisos', 'equipos split', 'preventivos',
     'ARS', 4950000.0, NULL, 4950000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1936', NULL, '2026-01-05', 'GENERAL',
     'MOTORARG', 'PISO TECHO', '-', '-', 'provision equipo piso techo 5 o 6 tr',
     'ARS', 4810000.0, 5262304.0, 4810000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1938', NULL, '2026-01-06', 'GENERAL',
     'CONSORCIO 883', 'bomba 1 suminsitro a torres', 'terraza', 'bomba nro', 'reemplazo de llave esferica',
     'ARS', 620000.0, NULL, 620000.0,
     'aprobado', TRUE, NULL, NULL),
    ('1939', NULL, '2026-01-06', 'GENERAL',
     'SALUD PROFESIONAL', 'equipo central', 'EQUIPO CENTRAL', '-', 'REEMPLAZO DE COMPRESOR',
     'ARS', 4400000.0, NULL, NULL,
     'rechazado', FALSE, NULL, NULL),
    ('1943', NULL, '2026-01-06', 'GENERAL',
     'CALL CENTER', '6to piso', '6TO PISO', 'salon principal', 'desinstalacion de 3 equipos split',
     'ARS', 850000.0, NULL, 850000.0,
     'aprobado', FALSE, NULL, NULL),
    ('42363', NULL, '2026-01-09', 'GENERAL',
     'BCO PATAGONIA', 'torre maipu', 'torre maipu', 'sala ciam', 'master - reparacion de fuga',
     'ARS', 1435000.0, NULL, 1435000.0,
     'aprobado', TRUE, NULL, NULL),
    ('SIN_NRO_140', NULL, '2026-01-09', 'GENERAL',
     'BCO PATAGONIA', NULL, 'torre maipu', 'sala ciam cic y backup', 'reemplazo de filtros de aire',
     'ARS', NULL, NULL, NULL,
     'enviado_a_lucas', TRUE, NULL, NULL),
    ('1944', NULL, '2026-01-12', 'GENERAL',
     'HUENEI', 'central 3 er piso', 'central 3er piso', 'motor tubina bobinado y reemp de contacora', 'adicional ppto 1932',
     'ARS', 1095000.0, NULL, 1095000.0,
     'aprobado', TRUE, NULL, NULL),
    ('1946', NULL, '2026-01-12', 'GENERAL',
     'TENOACCION', 'sala servidores', 'sala servidores', 'equipo 2', 'sala servidores reparacion de fuga',
     'ARS', 865000.0, NULL, 865000.0,
     'aprobado', FALSE, NULL, NULL),
    ('SIN_NRO_143', NULL, '2026-01-16', 'GENERAL',
     'ATLAS', NULL, 'sala de maquinas', 'uta 12', 'reemplazo de arraqnue suave',
     'ARS', 1435000.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL),
    ('1949', NULL, '2026-01-19', 'GENERAL',
     'BMC', 'PRIVISION E INSTALACION', 'piso 18', 'ivan prada', 'provision de mini vrf y evap. Casset e instalacion',
     'ARS', 19600.0, NULL, 19600.0,
     'aprobado', FALSE, NULL, NULL),
    ('1950', NULL, '2026-01-19', 'GENERAL',
     'BAZURCO', 'EDI. C.E.L', 'CENTRO EMPRESARIAL LIBERTADOR', 'SOFIA BRISSOLESE', 'SERVICIO MTTO MINI CHILLER',
     'ARS', 680.0, NULL, 680.0,
     'aprobado', FALSE, NULL, NULL),
    ('1951', NULL, '2026-01-20', 'GENERAL',
     'CRC', 'ELENA ROBLES', 'ROJAS 1766', 'MINI CHILLER OSMI', 'SERV. MTTO BIMESTRAL',
     'ARS', 560.0, NULL, 560.0,
     'aprobado', FALSE, NULL, NULL),
    ('1952', NULL, '2026-01-20', 'GENERAL',
     'LAPERRETTA', 'GABRIELA OCAMPO', 'gabriela ocampo', 'roosftop 3 equipos', 'revision tecnica',
     'ARS', 1350000.0, NULL, 1350000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1953', NULL, '2026-01-20', 'GENERAL',
     'TAMARA AFONSO', 'PARTICULAR', '-', 'equipo centralito', 'revision tecnica',
     'ARS', 850000.0, NULL, 850000.0,
     'aprobado', FALSE, NULL, NULL),
    ('SIN_NRO_149', NULL, '2026-01-26', 'GENERAL',
     'ATLAS', NULL, 'sala de maquinas', 'uta 4', 'reemplazo de rodamientos y soporte',
     'ARS', 1145000.0, NULL, 1145000.0,
     'aprobado', TRUE, NULL, NULL),
    ('1956', NULL, '2026-01-28', 'GENERAL',
     'CMQ', NULL, 'NUÑEZ', 'piso 26', 'reemplazo de compresor',
     'ARS', 3422650.0, NULL, 3422650.0,
     'aprobado', FALSE, NULL, NULL),
    ('1957', NULL, '2026-01-28', 'GENERAL',
     'TAMARA AFONSO', 'equipo central', '-', '-', 'correctivos basicos en equipo central',
     'ARS', 880860.0, NULL, 880860.0,
     'aprobado', FALSE, NULL, NULL),
    ('1958', NULL, '2026-01-28', 'GENERAL',
     'HUENEI', '3er piso', '3er piso', '-', 'provision e instalacion de equipo york',
     'ARS', 2185000.0, 3120000.0, 2185000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1940', NULL, '2026-01-07', 'GENERAL',
     'GALICIA', 'franchesco', 'franchesco', 'florida 229', 'service tolols y reparacion de fuga',
     'ARS', 4600100.0, NULL, 4600100.0,
     'aprobado', FALSE, NULL, NULL),
    ('SIN_NRO_154', NULL, '2026-01-30', 'GENERAL',
     'ATLAS', NULL, 'sala de maquinas', 'extractore 17 y 18', 'reemplazo de guardamotores',
     'ARS', 1165000.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL),
    ('42381', NULL, '2026-01-31', 'GENERAL',
     'ATLAS', NULL, 'sala de maquinas', 'uta 10', 'restauracion de base',
     'ARS', 2230000.0, NULL, 2230000.0,
     'aprobado', FALSE, NULL, NULL),
    ('SIN_NRO_156', NULL, '2026-02-03', 'GENERAL',
     'TORRE MAIPU', NULL, 'piso 20', 'sala cic', 'reemplazod e termostato de ambiente',
     'ARS', 840000.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL),
    ('SIN_NRO_157', NULL, '2026-02-13', 'GENERAL',
     'TORRE MAIPU', NULL, 'piso 20', 'sala cic', 'reemplazo de compresor esclavo 2',
     'ARS', 3720000.0, NULL, 3720000.0,
     'aprobado', TRUE, NULL, NULL),
    ('SIN_NRO_158', NULL, '2026-02-13', 'GENERAL',
     'TORRE MAIPU', NULL, 'piso 20', 'sala cic', 'reemplazo de termostato de alarma',
     'ARS', 720000.0, NULL, 720000.0,
     'aprobado', TRUE, NULL, NULL),
    ('SIN_NRO_159', NULL, '2026-02-13', 'GENERAL',
     'CRISTIAN MORIGI', NULL, 'caseros', 'split 4500', 'provision e instalacion',
     'ARS', 1485000.0, 500000.0, NULL,
     'rechazado', FALSE, NULL, NULL),
    ('SIN_NRO_160', NULL, '2026-02-13', 'GENERAL',
     'MARIA SCHIUMA', NULL, '-', 'split 4500', 'provision y montaje de equipo',
     'ARS', 1630000.0, NULL, NULL,
     'rechazado', FALSE, NULL, NULL),
    ('1964', NULL, '2026-03-02', 'GENERAL',
     'FRANCO ARGENTINA', '3 er piso', '3 er piso', 'equipos centrales', 'revision e reparacion de 1 artefacto',
     'ARS', 1250000.0, 850000.0, 1250000.0,
     'aprobado', FALSE, NULL, NULL),
    ('1967', NULL, '2026-03-02', 'GENERAL',
     'MARIANA BERGONSELLI', NULL, 'casa particular', NULL, 'revestimiento acstico',
     'ARS', 465000.0, NULL, 465000.0,
     'aprobado', FALSE, NULL, NULL),
    ('SIN_NRO_163', NULL, '2026-03-04', 'GENERAL',
     'SANTA OFELIA', NULL, '2 piso', 'equipo central', 'reemplazo de cañeria en linea de fancoil',
     'ARS', 1300000.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL),
    ('SIN_NRO_164', NULL, '2026-03-04', 'GENERAL',
     'HOSPITAL CUENCA ALTA', NULL, 'pedro nicola', 'maquinas chiller carrier 30 rb', 'revision tecnica  alas 4 chiller',
     'ARS', 2450.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL),
    ('SIN_NRO_165', NULL, '2026-03-04', 'GENERAL',
     'ESTUDIO DAMERO', NULL, NULL, NULL, 'provision de dos roosftop midea inverter',
     'ARS', 38990.0, NULL, NULL,
     'enviado_a_lucas', FALSE, NULL, NULL)
ON CONFLICT (nro_presupuesto) DO NOTHING;

-- ============================================================
-- GASTOS DIRECTOS 2026 (8 registros finalizados)
-- Se vinculan por nro_presupuesto al presupuesto correspondiente
-- ============================================================
INSERT INTO gastos_directos (
    presupuesto_id, fecha_gasto, concepto,
    costo_materiales, otros_gastos, observaciones
) VALUES
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '1932' LIMIT 1),
     '2026-12-29', 'Importado desde Control de Gastos',
     441650.0, NULL, NULL),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '1938' LIMIT 1),
     '2026-01-07', 'Importado desde Control de Gastos',
     30000.0, NULL, 'finalizado'),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '42292' LIMIT 1),
     '2026-01-09', 'Importado desde Control de Gastos',
     3000000.0, NULL, NULL),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '1944' LIMIT 1),
     '2026-01-12', 'Importado desde Control de Gastos',
     385000.0, 135000.0, 'finalizado'),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '42363' LIMIT 1),
     '2026-01-13', 'Importado desde Control de Gastos',
     400000.0, NULL, 'finalizado'),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '1931' LIMIT 1),
     '2026-01-23', 'Importado desde Control de Gastos',
     300000.0, 110000.0, NULL),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '42364' LIMIT 1),
     '2026-01-28', 'Importado desde Control de Gastos',
     85000.0, NULL, 'en proceso'),
    ((SELECT id FROM presupuestos WHERE nro_presupuesto = '1940' LIMIT 1),
     '2026-01-07', 'Importado desde Control de Gastos',
     NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ACTUALIZAR monto_aprobado con monto real cobrado (de Gastos)
-- ============================================================
UPDATE presupuestos SET monto_aprobado = 1380000.0
  WHERE nro_presupuesto = '1932'
    AND (monto_aprobado IS NULL OR monto_aprobado != 1380000.0);

UPDATE presupuestos SET monto_aprobado = 620000.0
  WHERE nro_presupuesto = '1938'
    AND (monto_aprobado IS NULL OR monto_aprobado != 620000.0);

UPDATE presupuestos SET monto_aprobado = 5317134.0
  WHERE nro_presupuesto = '42292'
    AND (monto_aprobado IS NULL OR monto_aprobado != 5317134.0);

UPDATE presupuestos SET monto_aprobado = 1095000.0
  WHERE nro_presupuesto = '1944'
    AND (monto_aprobado IS NULL OR monto_aprobado != 1095000.0);

UPDATE presupuestos SET monto_aprobado = 1435000.0
  WHERE nro_presupuesto = '42363'
    AND (monto_aprobado IS NULL OR monto_aprobado != 1435000.0);

UPDATE presupuestos SET monto_aprobado = 1569000.0
  WHERE nro_presupuesto = '1931'
    AND (monto_aprobado IS NULL OR monto_aprobado != 1569000.0);

UPDATE presupuestos SET monto_aprobado = 1145000.0
  WHERE nro_presupuesto = '42364'
    AND (monto_aprobado IS NULL OR monto_aprobado != 1145000.0);

UPDATE presupuestos SET monto_aprobado = 4600100.0
  WHERE nro_presupuesto = '1940'
    AND (monto_aprobado IS NULL OR monto_aprobado != 4600100.0);

-- ============================================================
-- RECALCULAR resultados para trabajos finalizados
-- Ejecutar fn_recalcular_resultado para cada uno
-- ============================================================
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '1932' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '1938' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '42292' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '1944' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '42363' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '1931' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '42364' LIMIT 1)
);
SELECT fn_recalcular_resultado(
    (SELECT id FROM presupuestos WHERE nro_presupuesto = '1940' LIMIT 1)
);

-- Marcar como finalizados los proyectos con gastos cargados
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '1932' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '1938' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '42292' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '1944' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '42363' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '1931' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '42364' LIMIT 1);
UPDATE resultados SET estado_resultado = 'finalizado'
    WHERE presupuesto_id = (SELECT id FROM presupuestos WHERE nro_presupuesto = '1940' LIMIT 1);

-- ============================================================
-- FIN SEED DATA
-- Para verificar: SELECT * FROM v_ganancia_neta_proyectos;
-- Para ranking:   SELECT * FROM v_ranking_produccion;
-- ============================================================