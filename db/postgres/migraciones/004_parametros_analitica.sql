/* =====================================================================
   004 - Parametros de la analitica (pilar C)
   ---------------------------------------------------------------------
   El codigo ya los leia con estos mismos valores por defecto
   (analitica/formulas.ts); ahora quedan en la tabla para poder ajustarlos
   y para que el log no avise que faltan. No cambia ningun resultado.
   Solo inserta si no existen (no pisa un valor ya configurado).
   ===================================================================== */
SET LOCAL search_path = lis;

INSERT INTO parametro (clave, valor, descripcion) VALUES
 ('ALERTA_UMBRAL_FALLOS', '2', '[PROP] Incumplimientos a partir de los cuales se alerta al personal del LIS'),
 ('ALERTA_UMBRAL_REPUTACION', '0.4', '[PROP] Reputación por debajo de la cual se alerta (escala 0 a 1)'),
 ('RANKING_PESO_CUMPLIMIENTO', '0.85', '[PROP] Peso del cumplimiento en el ranking de comportamiento'),
 ('RANKING_PESO_ACTIVIDAD', '0.15', '[PROP] Peso de la actividad en el ranking de comportamiento')
ON CONFLICT (clave) DO NOTHING;
