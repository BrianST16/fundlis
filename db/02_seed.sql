/* =====================================================================
   LIS DONA - Datos iniciales
   Ejecutar DESPUES de 01_schema.sql
   ===================================================================== */
USE LisDona;
GO

/* ---------------------------------------------------------------------
   PARAMETROS
   Los pesos del puntaje de prioridad son PROPUESTA (pendiente P-10):
   deben sumar 1.
   --------------------------------------------------------------------- */
MERGE PARAMETRO AS t
USING (VALUES
    ('PESO_CARACTERIZACION', '0.50', 'Peso del puntaje de caracterizacion en la prioridad'),
    ('PESO_SISBEN',          '0.30', 'Peso del grupo Sisben en la prioridad'),
    ('PESO_ANTIGUEDAD',      '0.20', 'Peso de la antiguedad de la peticion en la prioridad'),
    ('MAX_PETICIONES_ACTIVAS','5',   'Maximo de peticiones pendientes o aprobadas por estudiante'),
    ('MAX_BYTES_EVIDENCIA',  '2097152', 'Tamano maximo por fotografia en bytes (2 MB)'),
    ('MIN_DONACIONES_RECURRENTE', '3', 'Donaciones completadas para marcar a un donador como recurrente en Aprobaciones'),
    ('PLAZO_ESPERA_LOCAL_DIAS_HABILES', '5', 'Dias habiles que da cada "esperar" en custodia Local, lote sin destino o devolucion pendiente'),
    ('MAX_ESPERAS_LOCAL', '2', 'Esperas permitidas por objeto antes de tener que decidir su destino'),
    ('PLAZO_POR_DEVOLVER_DIAS_HABILES', '5', 'Dias habiles para registrar la devolucion al donador cuando un destino Local queda por devolver'),
    ('MAX_ESPERAS_DEVOLUCION', '1', 'Esperas permitidas en una devolucion pendiente antes de decidir custodia Local o recibirla para el LIS')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO

/* ---------------------------------------------------------------------
   GRUPOS SISBEN IV
   A1..A5 (pobreza extrema), B1..B7 (pobreza moderada),
   C1..C18 (vulnerable), D1..D21 (no pobre, no vulnerable).
   puntaje = base de la letra, decreciendo dentro del subgrupo.
   --------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM GRUPO_SISBEN)
BEGIN
    DECLARE @letra CHAR(1), @n INT, @i INT, @base DECIMAL(10,6), @rango DECIMAL(10,6), @desc NVARCHAR(120);
    DECLARE letras CURSOR LOCAL FAST_FORWARD FOR
        SELECT 'A', 5,  1.00, N'Pobreza extrema'          UNION ALL
        SELECT 'B', 7,  0.75, N'Pobreza moderada'          UNION ALL
        SELECT 'C', 18, 0.50, N'Vulnerable'                UNION ALL
        SELECT 'D', 21, 0.25, N'No pobre, no vulnerable';
    OPEN letras;
    FETCH NEXT FROM letras INTO @letra, @n, @base, @desc;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @rango = 0.25;
        SET @i = 1;
        WHILE @i <= @n
        BEGIN
            INSERT INTO GRUPO_SISBEN (codigo, letra, subgrupo, descripcion, puntaje_necesidad)
            VALUES (
                @letra + CAST(@i AS VARCHAR(3)),
                @letra,
                @i,
                @desc + N' - subgrupo ' + CAST(@i AS NVARCHAR(3)),
                CAST(@base - (@rango * (@i - 1) / @n) AS DECIMAL(6,5))
            );
            SET @i = @i + 1;
        END
        FETCH NEXT FROM letras INTO @letra, @n, @base, @desc;
    END
    CLOSE letras;
    DEALLOCATE letras;
END
GO

/* ---------------------------------------------------------------------
   CATEGORIAS (PROPUESTA: confirmar con el LIS)
   --------------------------------------------------------------------- */
MERGE CATEGORIA AS t
USING (VALUES
    (N'Utiles escolares',      N'Cuadernos, lapices, calculadoras, material de dibujo'),
    (N'Tecnologia',            N'Portatiles, tablets, perifericos, memorias'),
    (N'Libros y textos',       N'Textos academicos y material bibliografico'),
    (N'Ropa y calzado',        N'Prendas en buen estado y calzado'),
    (N'Implementos de aseo',   N'Productos de aseo personal no perecederos'),
    (N'Mobiliario pequeno',    N'Sillas, lamparas y mobiliario de estudio transportable'),
    (N'Material de laboratorio', N'Batas, gafas de seguridad e instrumentos basicos')
) AS s(nombre, descripcion)
ON t.nombre = s.nombre
WHEN NOT MATCHED THEN INSERT (nombre, descripcion) VALUES (s.nombre, s.descripcion);
GO

/* ---------------------------------------------------------------------
   PREGUNTAS DE CARACTERIZACION (PROPUESTA: validar con Bienestar)
   Opcion unica, puntaje 0 = menor necesidad, 1 = mayor necesidad.
   --------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM PREGUNTA_CARACTERIZACION)
BEGIN
    DECLARE @p INT;

    INSERT INTO PREGUNTA_CARACTERIZACION (texto, orden, peso)
    VALUES (N'Cual es tu situacion de vivienda durante el semestre?', 1, 1.0);
    SET @p = SCOPE_IDENTITY();
    INSERT INTO OPCION_CARACTERIZACION (pregunta_id, texto, puntaje, orden) VALUES
        (@p, N'Vivo con mi familia en vivienda propia',        0.00, 1),
        (@p, N'Vivo con mi familia en vivienda arrendada',     0.40, 2),
        (@p, N'Vivo solo o con companeros en arriendo',        0.70, 3),
        (@p, N'No tengo vivienda estable',                     1.00, 4);

    INSERT INTO PREGUNTA_CARACTERIZACION (texto, orden, peso)
    VALUES (N'Cuantas personas de tu hogar aportan ingresos?', 2, 1.0);
    SET @p = SCOPE_IDENTITY();
    INSERT INTO OPCION_CARACTERIZACION (pregunta_id, texto, puntaje, orden) VALUES
        (@p, N'Tres o mas', 0.00, 1),
        (@p, N'Dos',        0.35, 2),
        (@p, N'Una',        0.70, 3),
        (@p, N'Ninguna',    1.00, 4);

    INSERT INTO PREGUNTA_CARACTERIZACION (texto, orden, peso)
    VALUES (N'Trabajas mientras estudias?', 3, 1.0);
    SET @p = SCOPE_IDENTITY();
    INSERT INTO OPCION_CARACTERIZACION (pregunta_id, texto, puntaje, orden) VALUES
        (@p, N'No necesito trabajar',                       0.00, 1),
        (@p, N'Trabajo ocasionalmente',                     0.50, 2),
        (@p, N'Trabajo de forma permanente para sostenerme', 1.00, 3);

    INSERT INTO PREGUNTA_CARACTERIZACION (texto, orden, peso)
    VALUES (N'Como cubres tu transporte a la universidad?', 4, 1.0);
    SET @p = SCOPE_IDENTITY();
    INSERT INTO OPCION_CARACTERIZACION (pregunta_id, texto, puntaje, orden) VALUES
        (@p, N'Transporte propio',                     0.00, 1),
        (@p, N'Transporte publico sin dificultad',     0.35, 2),
        (@p, N'Transporte publico con dificultad',     0.70, 3),
        (@p, N'Con frecuencia no puedo pagarlo',       1.00, 4);

    INSERT INTO PREGUNTA_CARACTERIZACION (texto, orden, peso)
    VALUES (N'Tienes a cargo personas que dependan economicamente de ti?', 5, 1.0);
    SET @p = SCOPE_IDENTITY();
    INSERT INTO OPCION_CARACTERIZACION (pregunta_id, texto, puntaje, orden) VALUES
        (@p, N'No',                 0.00, 1),
        (@p, N'Una persona',        0.50, 2),
        (@p, N'Dos o mas personas', 1.00, 3);
END
GO

PRINT 'Datos iniciales cargados.';
SELECT (SELECT COUNT(*) FROM GRUPO_SISBEN) AS grupos_sisben,
       (SELECT COUNT(*) FROM CATEGORIA) AS categorias,
       (SELECT COUNT(*) FROM PREGUNTA_CARACTERIZACION) AS preguntas,
       (SELECT COUNT(*) FROM OPCION_CARACTERIZACION) AS opciones,
       (SELECT COUNT(*) FROM PARAMETRO) AS parametros;
GO
