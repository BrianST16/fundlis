# Informe de la Etapa A: auditoría integral (2026-11-20)

> **HISTÓRICO (línea base del 2026-11-20).** Este documento ya no describe el estado actual. El estado vigente está en `README.md`, `docs/01_decisiones_y_pendientes.md` (D-01 a D-67) y `docs/planeacion/MATRIZ_CUMPLIMIENTO_RUBRICA.md` (2026-11-26).

> Versión archivada en el repositorio del informe presentado en la conversación de auditoría. El estado **vivo** de cada criterio está en `MATRIZ_CUMPLIMIENTO_RUBRICA.md` y el backlog en `PLAN_CIERRE_LIS.md`. Este documento conserva la **línea base** antes de los lotes de implementación.

## 1. Workspace y fuentes

- Raíz real: `…/JD/lis-dona/lis-dona/` (`backend/`, `frontend/`, `db/`, `docs/`, `prompts/`). VS Code tenía abierta la carpeta padre; no bloquea, pero se recomienda abrir la raíz.
- Código **nuevo**: ya no existe la entidad `Persona` del CRUD. El diagnóstico F0 es solo histórico.
- **Sin repositorio Git.**
- `.env` fuera del código e ignorado; `.env.example` con valores de ejemplo (el Client ID de Google es público por diseño).
- **Rúbrica oficial: no encontrada** en ningún lugar del árbol. La matriz es provisional.
- **Anteproyecto:** único candidato `docs/Anteproyecto_completo.md`, marcado "BORRADOR en Plan mode". No tiene versión propia, no consta aprobación y su destino previsto (`docs/planeacion/01_anteproyecto.md`) no existe.

## 2. Stack real

Angular 20.3 · NestJS 11.2 · TypeScript 5.9/5.8 · TypeORM 0.3.31 · mssql 11.0.2 · google-auth-library 9.15 · Jest 29 · Node 24.21 · SQL Server Express con los scripts `db/01_schema.sql` y `db/02_seed.sql` (BD `LisDona`, 12 tablas, 2 vistas).

## 3. Verificación V1 (autorizada, sin BD)

| Comando | Exit | Resultado |
|---|---|---|
| `npm test -- --no-cache` (backend) | 0 | 1 suite, 7/7 (KD-tree frente a lineal, 400 conjuntos) |
| `npm run build` (backend) | 0 | `dist/` regenerado |
| `npm run build` (frontend, producción) | 0 | 286 kB iniciales; el bundle contenía la URL de ejemplo `TU-BACKEND`; `strictTemplates: false` |

No ejecutado: arranque, BD, smoke HTTP, login ni e2e (H-9).

## 4. Hallazgos principales de la línea base

| Área | Hallazgo | Estado tras los lotes del 2026-11-20 |
|---|---|---|
| Seguridad | El JWT cacheaba roles durante 8 h: bloqueo y revocación no surtían efecto inmediato | **Corregido** (DT-02) |
| Privacidad | IDOR: un donador podía ver cualquier foto vinculándola a su oferta | **Corregido** (DT-03) |
| Privacidad | Foto de entrega visible al donador | **Corregido** (DT-04) |
| Identidad | Se podía dar el rol de auxiliar a una cuenta @udea.edu.co | **Corregido** (DT-05) |
| Seguridad | `/api/salud` exponía el error del motor | **Corregido** (DT-06) |
| Flujo | El catálogo mostraba peticiones asignadas | **Corregido** (DT-08) |
| Flujo | La recepción incompleta duplicaba inventario | **Corregido** (DT-07) |
| Flujo | Carrera en el límite de 5 | **Corregido** (DT-09) |
| Flujo | LOCAL ausente; reasignación con recepción ficticia | **Diseñado**, bloqueado (H-3, H-9) |
| Pilar A | Árbol sobre prioridad; reconstruido en cada consulta | **Analizado con benchmark**, bloqueado (H-2) |
| Pilar B | Ausente | **Parcial**: calendario, plazos y DEFINIR_ESTADO derivados |
| Pilar C | Ausente | **Implementado** (pruebas unitarias) |
| Calidad | 1 spec, sin Git, sin e2e, sin eliminación auditada | 8 suites / 89 pruebas; Git, e2e y eliminación siguen pendientes |

## 5. Auditoría del anteproyecto (`docs/Anteproyecto_completo.md`)

**Fortalezas:**
- Problema real del LIS, con justificación social, institucional, técnica y académica.
- Siete objetivos específicos con indicador y evidencia; MVP N0–N6.
- Matriz de trazabilidad y control de coherencia, que respetan las reglas no negociables.

**Correcciones requeridas (T9.2):**

| # | Problema | Corrección |
|---|---|---|
| 1 | Formato de sesión de planeación ("Plan mode", ruta "Proyecto Fund", pasos de VS Code); no sigue su propio índice B ni tiene control del documento | Reestructurar como documento académico |
| 2 | §F dice "Angular 22 / NestJS 12 … CRUD" | Angular 20 / NestJS 11 / TypeORM 0.3, código nuevo |
| 3 | El diagrama Mermaid no está dentro de un bloque de código | Envolverlo en un bloque ```mermaid |
| 4 | OE4 "≥N conjuntos" no es medible | N = 400 (ya verificado) y métrica que incluya la construcción |
| 5 | El árbol "sobre dimensiones compatibles" contradice el código | Alinear tras la decisión H-2 |
| 6 | "BD por migraciones" frente a scripts SQL | Ajustar el texto o adoptar migraciones (T9.6) |
| 7 | Cálculo de fotos (500 KB) frente al límite real de 2 MB | Unificar |
| 8 | Sin referencias | Bentley (1975); Friedman, Bentley y Finkel (1977); Guttman (1984); Ley 1581 de 2012; Ley 51 de 1983; documentación Sisbén IV (DNP) |
| 9 | Sin metodología ni cronograma | Si la rúbrica oficial lo exige |
| 10 | D-31/D-32 solo dentro del borrador | Registrados el 2026-11-20; falta la confirmación del profesor |
| 11 | Supuestos [PROP] sin confirmar | Registrados como H-7 |
