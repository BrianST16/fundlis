/* =====================================================================
   006 - Reaplica VW_OFERTA_SALDO con la regla vigente (migracion 004)
   ---------------------------------------------------------------------
   Motivo: el 2026-11-20 a las 03:58:54 (hora del servidor), 39 s despues
   de aplicar la 004, la vista fue redefinida externamente (CREATE OR ALTER)
   con la version anterior que estaba en db/01_schema.sql (regla
   "trasladada por faltante"). Esa version no conoce LOTE_FISICO ni
   DESTINO_LOCAL y da saldos incorrectos. Esta migracion restaura la
   definicion que coincide con backend/src/ofertas/saldo.ts.
   La vista ya no esta en 01_schema.sql para evitar que se reaplique una
   definicion obsoleta.
   ===================================================================== */
CREATE OR ALTER VIEW VW_OFERTA_SALDO AS
SELECT o.id AS oferta_id,
       o.cantidad AS cantidad_ofertada,
       ISNULL(a.comprometida, 0) AS cantidad_comprometida,
       ISNULL(a.consumida, 0)    AS cantidad_consumida_intentos,
       ISNULL(b.local_cant, 0)   AS cantidad_destino_local,
       ISNULL(c.faltante, 0)     AS cantidad_en_lote_faltante,
       o.cantidad - ISNULL(a.comprometida, 0) - ISNULL(a.consumida, 0) - ISNULL(b.local_cant, 0) - ISNULL(c.faltante, 0) AS cantidad_disponible
FROM OFERTA o
OUTER APPLY (
    SELECT SUM(CASE WHEN x.estado = 'ASIGNADO' THEN x.cantidad_asignada END) AS comprometida,
           SUM(CASE WHEN x.estado IN ('EN_CUSTODIA','ENTREGADO','DEVOLUCION')
                      OR (x.estado = 'CANCELADO' AND x.recibida_en IS NOT NULL) THEN x.cantidad_asignada END) AS consumida
    FROM OFERTA_X_PETICION x WHERE x.oferta_id = o.id AND x.origen = 'DONADOR') a
OUTER APPLY (
    SELECT SUM(d.cantidad) AS local_cant FROM DESTINO_LOCAL d
    WHERE d.oferta_id = o.id AND d.origen = 'OFERTA' AND d.estado <> 'CANCELADO') b
OUTER APPLY (
    SELECT SUM(l.cantidad) AS faltante FROM LOTE_FISICO l
    WHERE l.oferta_id = o.id AND o.origen = 'FALTANTE') c;
GO
