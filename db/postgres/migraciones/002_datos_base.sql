/* =====================================================================
   002 - Datos base: parametros, grupos Sisben, categorias y preguntas
   ---------------------------------------------------------------------
   Consolida db/sqlserver/02_seed.sql y los parametros que agregaron las
   migraciones 003 a 013 de SQL Server, con los mismos valores.
   Idempotente: ON CONFLICT DO NOTHING no pisa un valor ya configurado.
   ===================================================================== */
SET LOCAL search_path = lis;

/* 1. Parametros (los marcados [PROP] son propuesta del equipo). */
INSERT INTO parametro (clave, valor, descripcion) VALUES
 ('PESO_CARACTERIZACION',  '0.50', 'Coeficiente (factor numérico) del componente de caracterización en la prioridad'),
 ('PESO_SISBEN',           '0.30', 'Coeficiente (factor numérico) del componente Sisbén en la prioridad'),
 ('PESO_ANTIGUEDAD',       '0.20', 'Coeficiente (factor numérico) del componente de antigüedad en la prioridad'),
 ('HORIZONTE_ANTIGUEDAD_DIAS', '90', 'Días naturales con los que la antigüedad llega a 1 (estable, desde la fecha original)'),
 ('MAX_PETICIONES_ACTIVAS', '5', 'Máximo de peticiones pendientes o aprobadas por estudiante'),
 ('MAX_BYTES_EVIDENCIA', '2097152', 'Tamaño máximo por fotografía en bytes (2 MB)'),
 ('MIN_DONACIONES_RECURRENTE', '3', 'Donaciones completadas para marcar a un donador como recurrente en Aprobaciones'),
 ('PLAZO_DONADOR_DIAS_HABILES', '10', 'Días hábiles del donador para llevar el producto al LIS (D-21)'),
 ('PLAZO_ESTUDIANTE_DIAS_HABILES', '3', 'Días hábiles del estudiante para recoger desde EN_CUSTODIA (D-22)'),
 ('PLAZO_AVISO_DIAS_HABILES', '1', 'Días hábiles antes del vencimiento en que se avisa que el plazo está próximo'),
 ('PLAZO_APLAZAMIENTO_DONADOR_DIAS_HABILES', '5', '[PROP] Días hábiles que suma cada aplazamiento del donador'),
 ('MAX_APLAZAMIENTOS_DONADOR', '1', '[PROP] Número máximo de aplazamientos del donador'),
 ('PLAZO_EXTENSION_ESTUDIANTE_DIAS_HABILES', '3', 'Extensión de recogida del estudiante (D-22)'),
 ('MAX_EXTENSIONES_ESTUDIANTE', '1', '[PROP] Extensiones de recogida permitidas'),
 ('DIAS_ANTICIPACION_CIERRE', '5', '[PROP] Días hábiles antes de un cierre en que se suspende la recepción de donaciones'),
 ('CORREO_MAX_INTENTOS', '5', 'Intentos de envío de correo antes de marcarlo como ERROR definitivo'),
 ('PLAZOS_REVISION_MINUTOS', '15', 'Cada cuántos minutos se revisan los vencimientos'),
 ('PLAZO_CUSTODIA_LOCAL_DIAS_HABILES', '3', 'Días hábiles de custodia temporal Local antes de pedir una decisión'),
 ('PLAZO_RESPUESTA_DONADOR_LOCAL', '5', 'Días hábiles para que el donador acepte o rechace que su donación quede para el LIS'),
 ('PLAZO_ESPERA_LOCAL_DIAS_HABILES', '5', 'Días hábiles que da cada "esperar" en custodia Local, lote sin destino o devolución pendiente'),
 ('MAX_ESPERAS_LOCAL', '2', 'Esperas permitidas por objeto antes de tener que decidir su destino'),
 ('PLAZO_POR_DEVOLVER_DIAS_HABILES', '5', 'Días hábiles para registrar la devolución al donador'),
 ('MAX_ESPERAS_DEVOLUCION', '1', 'Esperas permitidas en una devolución pendiente antes de decidir custodia Local o recibirla para el LIS')
ON CONFLICT (clave) DO NOTHING;

/* 2. Grupos Sisben IV: A1..A5, B1..B7, C1..C18, D1..D21.
      puntaje = base de la letra, decreciendo 0,25 a lo largo del subgrupo
      (misma formula que en SQL Server). Escala del proyecto, no del DNP. */
INSERT INTO grupo_sisben (codigo, letra, subgrupo, descripcion, puntaje_necesidad)
SELECT l.letra || i, l.letra, i, l.descr || ' - subgrupo ' || i,
       round(l.base - (0.25 * (i - 1) / l.n), 5)
FROM (VALUES ('A', 5, 1.00, 'Pobreza extrema'),
             ('B', 7, 0.75, 'Pobreza moderada'),
             ('C', 18, 0.50, 'Vulnerable'),
             ('D', 21, 0.25, 'No pobre, no vulnerable')) AS l(letra, n, base, descr)
CROSS JOIN LATERAL generate_series(1, l.n) AS i
ON CONFLICT (codigo) DO NOTHING;

/* 3. Categorias. Solo "Ropa y calzado" usa medida: talla ordinal 1-7. */
INSERT INTO categoria (nombre, descripcion, medida_nombre, medida_unidad, medida_min, medida_max) VALUES
 ('Útiles escolares',        'Cuadernos, lápices, calculadoras, material de dibujo', NULL, NULL, NULL, NULL),
 ('Tecnología',              'Portátiles, tablets, periféricos, memorias', NULL, NULL, NULL, NULL),
 ('Libros y textos',         'Textos académicos y material bibliográfico', NULL, NULL, NULL, NULL),
 ('Ropa y calzado',          'Prendas en buen estado y calzado', 'Talla', 'escala del proyecto: 1=XS 2=S 3=M 4=L 5=XL 6=XXL 7=XXXL', 1, 7),
 ('Implementos de aseo',     'Productos de aseo personal no perecederos', NULL, NULL, NULL, NULL),
 ('Mobiliario pequeño',      'Sillas, lámparas y mobiliario de estudio transportable', NULL, NULL, NULL, NULL),
 ('Material de laboratorio', 'Batas, gafas de seguridad e instrumentos básicos', NULL, NULL, NULL, NULL)
ON CONFLICT (nombre) DO NOTHING;

/* 4. Preguntas de caracterizacion (opcion unica; 0 = menor necesidad). */
DO $$
DECLARE p integer;
BEGIN
    IF EXISTS (SELECT 1 FROM pregunta_caracterizacion) THEN RETURN; END IF;

    INSERT INTO pregunta_caracterizacion (texto, orden, peso)
    VALUES ('¿Cuál es tu situación de vivienda durante el semestre?', 1, 1.0) RETURNING id INTO p;
    INSERT INTO opcion_caracterizacion (pregunta_id, texto, puntaje, orden) VALUES
        (p, 'Vivo con mi familia en vivienda propia',    0.00, 1),
        (p, 'Vivo con mi familia en vivienda arrendada', 0.40, 2),
        (p, 'Vivo solo o con compañeros en arriendo',    0.70, 3),
        (p, 'No tengo vivienda estable',                 1.00, 4);

    INSERT INTO pregunta_caracterizacion (texto, orden, peso)
    VALUES ('¿Cuántas personas de tu hogar aportan ingresos?', 2, 1.0) RETURNING id INTO p;
    INSERT INTO opcion_caracterizacion (pregunta_id, texto, puntaje, orden) VALUES
        (p, 'Tres o más', 0.00, 1),
        (p, 'Dos',        0.35, 2),
        (p, 'Una',        0.70, 3),
        (p, 'Ninguna',    1.00, 4);

    INSERT INTO pregunta_caracterizacion (texto, orden, peso)
    VALUES ('¿Trabajas mientras estudias?', 3, 1.0) RETURNING id INTO p;
    INSERT INTO opcion_caracterizacion (pregunta_id, texto, puntaje, orden) VALUES
        (p, 'No necesito trabajar',                        0.00, 1),
        (p, 'Trabajo ocasionalmente',                      0.50, 2),
        (p, 'Trabajo de forma permanente para sostenerme', 1.00, 3);

    INSERT INTO pregunta_caracterizacion (texto, orden, peso)
    VALUES ('¿Cómo cubres tu transporte a la universidad?', 4, 1.0) RETURNING id INTO p;
    INSERT INTO opcion_caracterizacion (pregunta_id, texto, puntaje, orden) VALUES
        (p, 'Transporte propio',                 0.00, 1),
        (p, 'Transporte público sin dificultad', 0.35, 2),
        (p, 'Transporte público con dificultad', 0.70, 3),
        (p, 'Con frecuencia no puedo pagarlo',   1.00, 4);

    INSERT INTO pregunta_caracterizacion (texto, orden, peso)
    VALUES ('¿Tienes a cargo personas que dependan económicamente de ti?', 5, 1.0) RETURNING id INTO p;
    INSERT INTO opcion_caracterizacion (pregunta_id, texto, puntaje, orden) VALUES
        (p, 'No',                 0.00, 1),
        (p, 'Una persona',        0.50, 2),
        (p, 'Dos o más personas', 1.00, 3);
END
$$;
