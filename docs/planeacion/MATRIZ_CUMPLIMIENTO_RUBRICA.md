# Matriz de cumplimiento de la rúbrica — LIS Dona

| Campo | Valor |
|---|---|
| Carácter | **PROVISIONAL**: no se encontró la rúbrica oficial. Criterios tomados de `docs/00_directrices_profesor.md` §10 y `docs/CRITERIOS_RUBRICA_BASE_PROVISIONAL.md` (R1–R8). Sin pesos ni puntajes. |
| Última actualización | 2026-11-20, tras los lotes A y B1–B4 |
| Estados | IMPLEMENTADO Y VERIFICADO (con prueba ejecutada) · IMPLEMENTADO SIN PRUEBA · PARCIAL · DISEÑADO · AUSENTE · BLOQUEADO |

> **Regla:** "verificado" significa que hay una prueba **ejecutada** que pasó. Que compile no basta. Ninguna funcionalidad se ha demostrado todavía contra SQL Server ni en un navegador (V2/V3 bloqueados por H-9). Por eso ningún criterio completo está "terminado" según la definición de `PLAN_CIERRE_LIS.md` §5.

## Evidencia de ejecución global (2026-11-20)

| Comando | Resultado |
|---|---|
| `npm test -- --no-cache` (backend) | **8 suites, 89/89 pruebas, exit 0** (antes de los lotes: 1 suite, 7 pruebas) |
| `npx tsc --noEmit` (backend) | exit 0 |
| `npm run build` (backend) | exit 0; `dist/` sin specs (`tsconfig.build.json`) |
| `npm run build` (frontend) | exit 0; 12 páginas lazy (incluye `analitica` y `vencimientos`) |
| `npx ts-node --transpile-only scripts/benchmark-kdtree.ts` | exit 0; tabla en `ANALISIS_PILAR_A_KDTREE.md` |

## Matriz

### R1 — Tres componentes independientes · **PARCIAL**

- **Evidencia:** backend y frontend se compilan por separado (exit 0); `GET /api/salud` (sin detalle del motor, probado en `seguridad.spec.ts`); `db/01_schema.sql` y `db/02_seed.sql`.
- **Brecha:** nunca se arrancó contra SQL Server (H-9); no hay despliegue ni URLs; `environment.prod.ts` usa la URL de ejemplo.
- **Siguiente acción:** T0.4 (V2) y T9.4.

### R2 — Google Auth + dominio institucional · **IMPLEMENTADO Y VERIFICADO (unitario); falta la demo en vivo**

- **Evidencia:** `auth/auth.spec.ts` (11 pruebas):
  - token inválido o expirado → 401;
  - audiencia = Client ID;
  - `email_verified` obligatorio;
  - @udea.edu.co → ESTUDIANTE; otro dominio → DONADOR;
  - un dominio que solo "contiene" udea.edu.co no se clasifica como estudiante;
  - cuenta bloqueada → 403;
  - administrador inicial por `ADMIN_EMAILS`.

  `usuarios`: AUXILIAR_LIS solo para perfil DONADOR (`seguridad.spec.ts`).
- **Brecha:** login real con Client ID y cuentas de prueba (V3); P-03 (dominio del administrador).
- **Siguiente acción:** V3 con cuentas ficticias.

### R3 — Capas, RBAC y privacidad · **IMPLEMENTADO Y VERIFICADO (unitario); falta e2e HTTP**

- **Evidencia:**
  - `jwt.guard.spec.ts` (8): el bloqueo y la revocación surten efecto inmediato; ruta pública con usuario bloqueado → invitado.
  - `seguridad.spec.ts`: IDOR de `fotoId` cerrado; fotos de movimientos solo para el LIS; `/salud` sin fuga de información.
  - `pilares-b-c.spec.ts`: RBAC real (`RolesGuard` + metadatos) de analítica y plazos.
  - `flujo-integridad.spec.ts`: el detalle no expone evidencias a las partes; el catálogo es anónimo.
- **Brecha:**
  - Matriz endpoint × rol completa vía HTTP (e2e) para los 51 endpoints previos.
  - `strict` desactivado.
- **Siguiente acción:** P1-7 con BD desechable (H-9) o con app Nest y servicios dobles.

### R4 — Flujo central LIS · **PARCIAL**

- **Evidencia:**
  - `flujo-integridad.spec.ts`:
    - el catálogo oculta las peticiones asignadas;
    - límite de 5 transaccional;
    - el saldo con recepción incompleta no duplica;
    - la devolución exige la cantidad completa.
  - `saldo.spec.ts` (6).
  - Asignación transaccional con bloqueos y la vista `VW_OXP_VIGENTE` (inspección).
- **Brecha:**
  - **LOCAL ausente** y reasignación sin modelo físico: DISEÑADO en `DISENO_LOCAL_Y_UBICACION_FISICA.md`, BLOQUEADO por H-3 y H-9.
  - Sin e2e ni prueba de concurrencia real en SQL Server.
- **Siguiente acción:** T3.2–T3.4 tras H-3 y H-9.

### R5 — Pilar A: KD/R-tree + prioridad · **IMPLEMENTADO Y VERIFICADO (algoritmo); riesgo de diseño BLOQUEADO en H-2**

- **Evidencia:**
  - `kdtree.spec.ts` (7): 0 discrepancias frente a la búsqueda lineal en 400 conjuntos.
  - Benchmark: consulta sobre un árbol construido = 0,02 % de nodos con n = 100.000.
- **Brecha:**
  - El árbol indexa la prioridad, no la compatibilidad.
  - Reconstruirlo en cada consulta es ~200 veces más lento que lo lineal (n = 100.000).
  - LOCAL no aparece al final de la lista.
- **Siguiente acción:** decisión H-2 (pregunta al profesor en el análisis §6).

### R6 — Pilar B: ciclo de vida, plazos y notificaciones · **PARCIAL**

- **Evidencia:**
  - `calendario.spec.ts` (11): festivos oficiales de 2025 y 2026 exactos; Pascua; cierres; zona de Bogotá.
  - `pilares-b-c.spec.ts`: plazos de 10 y 3 días hábiles, POR_VENCER, VENCIDO → `DEFINIR_ESTADO` con acciones, bandeja ordenada, "mis plazos" sin datos de la otra parte.
  - UI `Plazos y tareas` y plazos en "Mis movimientos" (build exit 0).
- **Brecha:**
  - Tareas y notificaciones **persistentes**.
  - **Correo**.
  - Aplazar o extender.
  - Suspensión anticipada por vacaciones.

  Todo esto está DISEÑADO y BLOQUEADO por H-9 (esquema) y H-6 (SMTP).
- **Siguiente acción:** T4.4–T4.6.

### R7 — Pilar C: analítica y ranking · **IMPLEMENTADO Y VERIFICADO (unitario, datos ficticios)**

- **Evidencia:** `pilares-b-c.spec.ts`:
  - fórmulas calculadas a mano;
  - ranking de estudiantes y donadores;
  - clasificación de compromisos;
  - indicadores;
  - alertas;
  - RBAC.

  UI `Analítica` (build exit 0). Endpoints `/api/analitica/*`.
- **Brecha:**
  - Pesos [PROP] (P-11).
  - No ejecutado contra SQL Server (H-9).
- **Siguiente acción:** validar con un dataset ficticio en una BD desechable.

### R8 — Calidad, seguridad y defensa · **PARCIAL**

- **Evidencia:** 89 pruebas; documentación de planeación (plan, matriz, registro, análisis, diseño); README actualizado.
- **Brecha:**
  - **Sin Git** (B-GIT).
  - Sin e2e.
  - Sin pruebas del frontend.
  - **Eliminación excepcional con reautenticación AUSENTE** (diseño en `PLAN_CIERRE_LIS.md` M8; BLOQUEADO por H-9).
  - Sin manuales.
  - Anteproyecto v1.0 pendiente (T9.2).
- **Siguiente acción:** B-GIT, T9.2, T9.5, M8.

## Trazabilidad criterio → requisito → componente → endpoint → prueba

| Criterio | Requisito | Componente | Endpoint | Prueba |
|---|---|---|---|---|
| R2 | D-02/D-03 perfil por dominio | `auth/auth.service.ts`, `google.service.ts` | `POST /api/auth/google` | `auth/auth.spec.ts` |
| R3 | Bloqueo y revocación efectivos | `auth/jwt.guard.ts` | todos los privados | `auth/jwt.guard.spec.ts` |
| R3 | Privacidad de fotos (P-20, H-7d) | `evidencias/evidencias.service.ts`, `ofertas.service.ts` | `GET /api/evidencias/:id`, `POST/PATCH /api/ofertas` | `seguridad.spec.ts` |
| R3 | Auxiliar no institucional (D-04) | `usuarios/usuarios.service.ts` | `POST /api/usuarios/:id/roles` | `seguridad.spec.ts` |
| R4 | Catálogo oculta asignadas (§3) | `peticiones/peticiones.service.ts` | `GET /api/peticiones/catalogo` | `flujo-integridad.spec.ts` |
| R4 | Límite de 5 (D-09) | `peticiones.service.ts` | `POST /api/peticiones` | `flujo-integridad.spec.ts` |
| R4 | Recepción incompleta sin duplicar (D-18) | `ofertas/saldo.ts` | `POST /api/asignaciones`, catálogo | `saldo.spec.ts`, `flujo-integridad.spec.ts` |
| R5 | KD-tree adaptativo frente a lineal | `emparejamiento/kdtree.ts` | `GET /api/emparejamiento/oferta/:id` | `kdtree.spec.ts`, benchmark |
| R6 | Días hábiles de Colombia (D-24) | `calendario/*` | `GET /api/plazos/calendario` | `calendario.spec.ts` |
| R6 | Plazos 10/3 y DEFINIR_ESTADO (D-21/22/23) | `plazos/*` | `GET /api/plazos/bandeja`, `/resumen`, `/mios` | `pilares-b-c.spec.ts` |
| R7 | Ranking separado de la prioridad (D-27) | `analitica/*` | `GET /api/analitica/*` | `pilares-b-c.spec.ts` |
