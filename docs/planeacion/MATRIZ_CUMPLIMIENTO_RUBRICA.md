# Matriz de cumplimiento de la rúbrica — LIS Dona

| Campo | Valor |
|---|---|
| Carácter | **PROVISIONAL**: no se encontró la rúbrica oficial. Los criterios R1–R8 se tomaron de `docs/00_directrices_profesor.md` §10 y `docs/CRITERIOS_RUBRICA_BASE_PROVISIONAL.md`. No tienen pesos ni puntajes. |
| Última actualización | 2026-11-26, después de las decisiones D-54 a D-67. Sustituye la versión del 2026-11-20. |
| Estados | IMPLEMENTADO Y VERIFICADO · IMPLEMENTADO SIN PRUEBA · PARCIAL · AUSENTE · FUERA DEL ALCANCE |

> **Regla.** "Verificado" exige una prueba **ejecutada** que pasó, o una prueba manual registrada contra la BD de desarrollo `LisDona`. Que el código compile no basta.

## Evidencia de ejecución global (2026-11-26)

| Comando o prueba | Resultado |
|---|---|
| `npm test` (backend) | **18 suites, 237/237 pruebas**, datos ficticios, sin BD |
| `npm run build` (backend) | Compila |
| `ng build` (frontend, producción) | Compila. Bundle inicial de 327,2 kB (93,3 kB transferidos). La página más pesada es *custodia*, con 20,1 kB. |
| Arranque del contexto Nest contra `LisDona` | Correcto |
| Migración 014, ensayo con *rollback* | El trigger rechaza `UPDATE` y `DELETE` del historial; el borrado del script de demostración funciona; cerraría 3 ofertas agotadas |
| `benchmark-kdtree.ts lis` y `selectivo` | `coinciden = true` en las 8 configuraciones (ver `ANALISIS_PILAR_A_KDTREE.md`) |
| Pruebas manuales en el navegador | Flujo completo por rol, Local, plazos, cancelación con causa, bloqueo, modo oscuro |

## Matriz

### R1 — Tres componentes independientes · **IMPLEMENTADO; falta el despliegue público**

- **Evidencia:**
  - `frontend/` (Angular 20), `backend/` (NestJS 11) y `db/` (SQL Server) se compilan y ejecutan por separado;
  - `GET /api/salud` no expone detalles del motor;
  - la conexión se configura por entorno (`.env.example`) con un usuario de mínimo privilegio, `lis_app`;
  - las migraciones se aplican con `backend/scripts/db/migrar.js`;
  - las instrucciones de despliegue están en el README §1.5.
- **Brecha:** no hay URLs públicas. La migración a PostgreSQL/Supabase y el despliegue están planeados para la fase siguiente.

### R2 — Google Auth y dominio institucional · **IMPLEMENTADO Y VERIFICADO**

- **Evidencia:**
  - `auth.spec.ts` (11 pruebas):
    - token inválido o expirado → 401;
    - la audiencia debe ser el Client ID;
    - `email_verified` es obligatorio;
    - `@udea.edu.co` → ESTUDIANTE y cualquier otro dominio → DONADOR;
    - un dominio que solo "contiene" udea.edu.co se rechaza;
    - cuenta bloqueada → 403;
    - administrador inicial por `ADMIN_EMAILS`.
  - Inicio de sesión real con Google probado en el navegador. El botón está en el menú lateral.
- **Brecha:** P-03 (dominio del administrador) se implementó como propuesta.

### R3 — Arquitectura en capas, RBAC y privacidad · **IMPLEMENTADO Y VERIFICADO**

- **Evidencia:**
  - **Capas:** controlador (DTO y guards) → servicio (reglas y transacciones) → repositorios TypeORM → SQL Server (restricciones, vistas indexadas, trigger).
  - **RBAC** con `JwtGuard` y `RolesGuard` globales y el decorador `@Publico`. Roles y estado se releen de la BD en cada petición: `jwt.guard.spec.ts` (9).
  - **Superusuario** solo por script (D-45). El auxiliar no aprueba sus propias ofertas (D-47).
  - **Privacidad:** catálogo anónimo; caracterización y certificado solo para el administrador y el dueño; fotos de movimientos solo para el LIS, salvo la foto de la entrega al donador (D-51). Lo cubre `seguridad.spec.ts` (29).
  - **Endurecimiento** (D-65): cabeceras, límite de peticiones, nombres de archivo, validación estricta e historial inmutable. Lo cubre `seguridad-http.spec.ts` (9).
- **Brecha:** falta la matriz endpoint × rol por HTTP, prevista con Postman.

### R4 — Flujo central LIS · **IMPLEMENTADO Y VERIFICADO**

- **Evidencia:** `flujo-integridad.spec.ts` (34), `saldo.spec.ts` (7), `cancelar-dto.spec.ts` (5), `local-notificaciones.spec.ts` (26) y `trazabilidad.spec.ts` (6). Cubren:
  - aprobación;
  - límite de 5 transaccional;
  - fraccionamiento de una oferta;
  - una sola asignación vigente por petición;
  - recepción y entrega con foto, sin recepción parcial;
  - recepción incompleta con oferta nueva;
  - devolución;
  - reasignación desde custodia;
  - cancelación con causa;
  - Local sin petición ficticia, con lote físico y consentimiento del donador;
  - cierre automático de ofertas agotadas;
  - bloqueo solo sin mediaciones en curso;
  - trazabilidad de una donación.
- Se probó en el navegador con `db/03_demo_presentacion.sql`.
- **Brecha:** no hay prueba de concurrencia real contra SQL Server. Por inspección, la asignación toma bloqueos `pessimistic_write` en orden fijo.

### R5 — Pilar A: KD-tree y prioridad · **IMPLEMENTADO Y VERIFICADO**

- **Evidencia:**
  - **KD-tree adaptativo de compatibilidad** (D-41): punto 3D por petición, caja por oferta y sentido inverso en 2D.
  - `kdtree.spec.ts` (9): el árbol coincide con el filtro lineal en 400 conjuntos aleatorios, y las cajas equivalen al predicado en 2.000 pares cada una.
  - **Prioridad** (D-38): `prioridad.spec.ts` (6).
  - **En producción**, cada consulta se verifica contra el filtro lineal y la UI muestra el diagnóstico.
  - Local siempre al final; el auxiliar confirma.
  - **Benchmark** del 2026-11-26 con construcción incluida.
- **Brechas y mejoras**, según `ANALISIS_PILAR_A_KDTREE.md` §5–6:
  - el árbol se reconstruye en cada consulta;
  - el centinela ±10⁹ neutraliza el eje adaptativo cuando hay peticiones sin rango;
  - el sentido inverso no se usa en la UI.
  - Las mejoras M1 a M5 están propuestas.

### R6 — Pilar B: ciclo de vida, plazos y notificaciones · **IMPLEMENTADO Y VERIFICADO; correo FUERA DEL ALCANCE**

- **Evidencia:** `calendario.spec.ts` (11), `pilares-b-c.spec.ts` (21), `esperas-local.spec.ts` (18), `decisiones-tarea.spec.ts` (4), `cierre-tareas.spec.ts` (4) y `alertas-aviso.spec.ts` (4). Cubren:
  - festivos calculados con la Ley 51 de 1983 y la Pascua;
  - cierres del LIS y suspensión anticipada de recepciones;
  - plazos de 10 y 3 días hábiles, con prórroga y extensión;
  - esperas de Local con fecha y tope (D-60 a D-62);
  - tareas `DEFINIR_ESTADO` idempotentes, que se cierran en la misma transacción que la acción (D-56);
  - el revisor automático;
  - avisos en la bandeja interna.
- **Brecha:** el correo tiene cola (`CORREO_SALIDA`), pero no hay proveedor configurado (D-53). El panel de parámetros es P-60.

### R7 — Pilar C: analítica y ranking · **IMPLEMENTADO Y VERIFICADO**

- **Evidencia:** `pilares-b-c.spec.ts`:
  - fórmulas calculadas a mano;
  - ranking de estudiantes y de donadores, separado de la prioridad;
  - alertas;
  - estudiantes en riesgo, resaltados y avisados al personal (`alertas-aviso.spec.ts`, D-55);
  - donador recurrente en *Aprobaciones* (D-49).
- **Brecha:** los pesos del ranking son una propuesta (P-11).

### R8 — Calidad, seguridad y defensa · **PARCIAL**

- **Evidencia:**
  - 237 pruebas unitarias;
  - Git con ramas y commits;
  - revisión de seguridad por capas;
  - revisión de todos los casos;
  - documento técnico de exposición;
  - justificación de cada página;
  - README actualizado;
  - escenario de demostración restaurable.
- **Brechas:**
  - no hay pruebas e2e ni del frontend;
  - la eliminación excepcional con reautenticación de Google (D-30) está **ausente**;
  - `npm audit` del backend da 6 avisos, sin parche aplicado;
  - faltan manuales de usuario.

## Trazabilidad: criterio → requisito → componente → endpoint → prueba

| Criterio | Requisito | Componente | Endpoint | Prueba |
|---|---|---|---|---|
| R2 | Perfil por dominio (D-02, D-03) | `auth/auth.service.ts`, `google.service.ts` | `POST /api/auth/google` | `auth.spec.ts` |
| R3 | Bloqueo y revocación inmediatos | `auth/jwt.guard.ts` | todas las rutas privadas | `jwt.guard.spec.ts` |
| R3 | Privacidad de fotos (H-7d, D-51) | `evidencias/evidencias.service.ts` | `GET /api/evidencias/:id` | `seguridad.spec.ts` |
| R3 | Superusuario y gestión de administradores (D-45) | `usuarios/usuarios.service.ts` | `POST /api/usuarios/:id/roles` | `seguridad.spec.ts` |
| R3 | Cabeceras y límite de peticiones (D-65) | `common/seguridad-http.ts` | todas | `seguridad-http.spec.ts` |
| R4 | Límite de 5 (D-09) | `peticiones.service.ts` | `POST /api/peticiones` | `flujo-integridad.spec.ts` |
| R4 | Saldo derivado y recepción incompleta (D-18) | `ofertas/saldo.ts`, `VW_OFERTA_SALDO` | `POST /api/asignaciones/:id/recepcion` | `saldo.spec.ts` |
| R4 | Cancelación con causa (D-57) | `asignaciones.service.ts` | `POST /api/asignaciones/:id/cancelar` | `cancelar-dto.spec.ts`, `flujo-integridad.spec.ts` |
| R4 | Local con consentimiento (D-43, D-50) | `local/local.service.ts` | `/api/local/*`, `/api/local/donador/*` | `local-notificaciones.spec.ts` |
| R4 | Bloqueo sin mediaciones (D-64) | `usuarios.service.ts` | `PATCH /api/usuarios/:id/bloquear` | `seguridad.spec.ts` |
| R5 | Compatibilidad por KD-tree (D-41) | `emparejamiento/kdtree.ts`, `compatibilidad.ts` | `GET /api/emparejamiento/oferta/:id`, `/lote/:id`, `/peticion/:id` | `kdtree.spec.ts`, benchmark |
| R5 | Prioridad ponderada (D-38) | `emparejamiento/prioridad.ts` | ídem | `prioridad.spec.ts` |
| R6 | Días hábiles de Colombia (D-24) | `calendario/*` | `GET /api/plazos/calendario` | `calendario.spec.ts` |
| R6 | Tareas, esperas y prórrogas (D-56 a D-62) | `tareas/tareas.service.ts`, `cierre-tareas.ts` | `/api/tareas/*` | `esperas-local.spec.ts`, `decisiones-tarea.spec.ts`, `cierre-tareas.spec.ts` |
| R7 | Ranking separado de la prioridad (D-27, D-40) | `analitica/*` | `GET /api/analitica/*` | `pilares-b-c.spec.ts` |
| R7 | Alertas avisadas al personal (D-55) | `tareas.service.ts` (`avisarAlertas`) | `POST /api/tareas/revisar` | `alertas-aviso.spec.ts` |
