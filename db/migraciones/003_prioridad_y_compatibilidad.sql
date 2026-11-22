/* =====================================================================
   003 - Prioridad persistida (D-38) y atributos de compatibilidad (D-41)
   ---------------------------------------------------------------------
   Aditiva: no borra ni transforma datos existentes. Las filas actuales
   reciben valores por defecto neutros:
     OFERTA.estado_conservacion = 3 ("usado en buen estado")
     PETICION.estado_minimo     = 1 (acepta cualquier estado)
     medidas en NULL            = sin restriccion
   Rollback: ver bloque al final del archivo (comentado).
   ===================================================================== */

/* 1. Medida principal por categoria (opcional). Si una categoria la
      define, las ofertas declaran su valor y las peticiones un rango. */
IF COL_LENGTH('CATEGORIA', 'medida_nombre') IS NULL
    ALTER TABLE CATEGORIA ADD
        medida_nombre NVARCHAR(80)  NULL,
        medida_unidad NVARCHAR(60)  NULL,
        medida_min    DECIMAL(9,2)  NULL,
        medida_max    DECIMAL(9,2)  NULL;
GO

IF OBJECT_ID('CK_CATEGORIA_medida') IS NULL
    ALTER TABLE CATEGORIA ADD CONSTRAINT CK_CATEGORIA_medida CHECK (
        (medida_nombre IS NULL AND medida_min IS NULL AND medida_max IS NULL)
        OR (medida_nombre IS NOT NULL AND medida_min IS NOT NULL AND medida_max IS NOT NULL AND medida_min < medida_max));
GO

/* 2. Atributos de compatibilidad de la oferta. */
IF COL_LENGTH('OFERTA', 'estado_conservacion') IS NULL
    ALTER TABLE OFERTA ADD
        estado_conservacion TINYINT NOT NULL CONSTRAINT DF_OFERTA_conservacion DEFAULT (3),
        medida              DECIMAL(9,2) NULL;
GO

IF OBJECT_ID('CK_OFERTA_conservacion') IS NULL
    ALTER TABLE OFERTA ADD CONSTRAINT CK_OFERTA_conservacion CHECK (estado_conservacion BETWEEN 1 AND 5);
GO

/* 3. Requisitos de compatibilidad de la peticion (sigue SIN cantidad, D-10). */
IF COL_LENGTH('PETICION', 'estado_minimo') IS NULL
    ALTER TABLE PETICION ADD
        estado_minimo TINYINT NOT NULL CONSTRAINT DF_PETICION_estado_minimo DEFAULT (1),
        medida_min    DECIMAL(9,2) NULL,
        medida_max    DECIMAL(9,2) NULL;
GO

IF OBJECT_ID('CK_PETICION_estado_minimo') IS NULL
    ALTER TABLE PETICION ADD
        CONSTRAINT CK_PETICION_estado_minimo CHECK (estado_minimo BETWEEN 1 AND 5),
        CONSTRAINT CK_PETICION_medida CHECK (medida_min IS NULL OR medida_max IS NULL OR medida_min <= medida_max);
GO

/* 4. Componentes del puntaje de prioridad conservados en cada intento,
      para explicar despues por que se eligio a ese estudiante (D-38). */
IF COL_LENGTH('OFERTA_X_PETICION', 'puntaje_sisben') IS NULL
    ALTER TABLE OFERTA_X_PETICION ADD
        puntaje_sisben          DECIMAL(8,6) NULL,
        puntaje_caracterizacion DECIMAL(8,6) NULL,
        puntaje_antiguedad      DECIMAL(8,6) NULL,
        coeficientes_prioridad  VARCHAR(120) NULL;
GO

/* 5. Configuracion inicial [PROP]: solo "Ropa y calzado" usa medida
      (talla en escala ordinal 1-7). El administrador puede configurar
      otras categorias. No es una escala oficial: es regla del proyecto. */
UPDATE CATEGORIA
   SET medida_nombre = N'Talla',
       medida_unidad = N'escala del proyecto: 1=XS 2=S 3=M 4=L 5=XL 6=XXL 7=XXXL',
       medida_min = 1, medida_max = 7
 WHERE nombre = N'Ropa y calzado' AND medida_nombre IS NULL;
GO

/* 6. Parametros de prioridad: los PESO_* existentes pasan a documentarse
      como COEFICIENTES (factores numericos, no porcentajes). */
UPDATE PARAMETRO SET descripcion = N'Coeficiente (factor numerico) del componente de caracterizacion en la prioridad' WHERE clave = 'PESO_CARACTERIZACION';
UPDATE PARAMETRO SET descripcion = N'Coeficiente (factor numerico) del componente Sisben en la prioridad'            WHERE clave = 'PESO_SISBEN';
UPDATE PARAMETRO SET descripcion = N'Coeficiente (factor numerico) del componente de antiguedad en la prioridad'      WHERE clave = 'PESO_ANTIGUEDAD';

MERGE PARAMETRO AS t
USING (VALUES
    ('HORIZONTE_ANTIGUEDAD_DIAS', '90', N'Dias naturales con los que el componente de antiguedad llega a 1 (estable, desde la fecha original)')
) AS s(clave, valor, descripcion)
ON t.clave = s.clave
WHEN NOT MATCHED THEN INSERT (clave, valor, descripcion) VALUES (s.clave, s.valor, s.descripcion);
GO

/* ROLLBACK (manual, solo si se requiere):
   ALTER TABLE OFERTA_X_PETICION DROP COLUMN puntaje_sisben, puntaje_caracterizacion, puntaje_antiguedad, coeficientes_prioridad;
   ALTER TABLE PETICION DROP CONSTRAINT CK_PETICION_estado_minimo, CK_PETICION_medida, DF_PETICION_estado_minimo;
   ALTER TABLE PETICION DROP COLUMN estado_minimo, medida_min, medida_max;
   ALTER TABLE OFERTA DROP CONSTRAINT CK_OFERTA_conservacion, DF_OFERTA_conservacion;
   ALTER TABLE OFERTA DROP COLUMN estado_conservacion, medida;
   ALTER TABLE CATEGORIA DROP CONSTRAINT CK_CATEGORIA_medida;
   ALTER TABLE CATEGORIA DROP COLUMN medida_nombre, medida_unidad, medida_min, medida_max;
   DELETE FROM PARAMETRO WHERE clave = 'HORIZONTE_ANTIGUEDAD_DIAS';
   DELETE FROM ESQUEMA_VERSION WHERE version = 3; */
