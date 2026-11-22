# Registro de decisiones técnicas provisionales — LIS Dona

> **Alcance:** decisiones técnicas **reversibles** tomadas durante la implementación autónoma supervisada. Las decisiones de negocio confirmadas y los pendientes siguen en `docs/01_decisiones_y_pendientes.md`. Aquí nada está aprobado por el profesor: todo es **[PROP]** salvo que se indique otra cosa.

| ID | Fecha | Decisión | Motivo | Impacto | Cómo revertir |
|---|---|---|---|---|---|
| DT-01 | 2026-11-20 | Política H-1: SQL Server + NestJS/TypeScript como línea base provisional; nada nuevo depende del motor más allá de lo existente. | D-31/D-32 del equipo; falta la confirmación del profesor. | Ninguno nuevo. | — |
| DT-02 | 2026-11-20 | `JwtGuard` relee en la BD el estado `activo`, el perfil y los roles en **cada** petición; el JWT solo prueba la identidad. | Bloqueos y revocaciones deben surtir efecto inmediato (R3-a). | 2 consultas por petición autenticada (aceptable en el MVP; caché corta posible en P3). | Volver a usar `payload.roles` en `auth/jwt.guard.ts`. |
| DT-03 | 2026-11-20 | El `fotoId` de una oferta debe ser una evidencia subida por el mismo donador, no usada en movimientos ni en otra oferta. | IDOR que exponía fotos de entrega (R3-b). | El frontend ya sube la foto y luego crea la oferta con el id: sin cambios. | `validarFoto` en `ofertas.service.ts`. |
| DT-04 | 2026-11-20 | Supuesto H-7d: las fotos de **movimientos físicos** solo las ve el personal del LIS; el detalle de asignación no expone `evidenciaId` a las partes. | Privacidad entre donador y estudiante (P-20). | El donador y el estudiante ven estados, no fotos de movimientos. | `puedeVer` en `evidencias.service.ts`. |
| DT-05 | 2026-11-20 | `AUXILIAR_LIS` solo puede otorgarse a cuentas con perfil DONADOR (no institucionales). `ADMINISTRADOR` sin restricción mientras P-03 siga abierto. | D-04 / D-05. | Una cuenta @udea.edu.co no puede ser auxiliar. | `otorgarRol` en `usuarios.service.ts`. |
| DT-06 | 2026-11-20 | `/api/salud` no devuelve el mensaje de error del motor; se registra en el log del servidor. | Fuga de información en un endpoint público. | El diagnóstico se lee en el log. | `health.controller.ts`. |
| DT-07 | 2026-11-20 | **Saldo único** (`ofertas/saldo.ts`). Un intento CANCELADO con recepción **incompleta** consume sus unidades en la oferta original. | Corrige la duplicación de inventario (R4-c) y elimina 3 copias del cálculo. | Unidades no llegadas no vuelven a estar disponibles; la vista SQL se actualizó en el script (no aplicada). | `calcularSaldo`; volver a liberar los CANCELADO. |
| DT-08 | 2026-11-20 | El catálogo de peticiones oculta las que tienen un intento vigente. | Directriz §3. | La petición reaparece si el intento se cancela antes de la recepción. | `peticiones.service.ts` `catalogo()`. |
| DT-09 | 2026-11-20 | Límite de 5 peticiones: conteo e inserción en una transacción con bloqueo `pessimistic_write` de la fila del estudiante. | Condición de carrera (R4-e). | Serializa la creación por estudiante. | `crear()` en `peticiones.service.ts`. |
| DT-10 | 2026-11-20 | La devolución exige la cantidad completa de la asignación. | No hay movimientos parciales (D-14). | — | `registrarDevolucion`. |
| DT-11 | 2026-11-20 | Festivos de Colombia **calculados** (Ley 51 de 1983 + Pascua), no escritos a mano. Cierres del LIS en `PARAMETRO.CIERRES_LIS` (formato `AAAA-MM-DD..AAAA-MM-DD;…`) hasta que exista la tabla `CIERRE_LIS`. | "No hardcodear fechas" (D-24). | Sin datos que mantener por año. | `calendario/`. |
| DT-12 | 2026-11-20 | Convención de conteo: el día del evento **no** cuenta; el plazo vence al terminar el n-ésimo día hábil posterior, en hora de Bogotá. Inicio del plazo del donador = fecha de asignación (P-25). | Las fuentes no lo precisan. | Afecta las fechas límite mostradas. | `calendario/dias-habiles.ts`, `plazos/plazos.ts`. |
| DT-13 | 2026-11-20 | Plazos y tarea `DEFINIR_ESTADO` **derivados** de `asignada_en` y `recibida_en`, sin tablas nuevas. La bandeja muestra qué acciones están disponibles y cuáles no (aplazar y extender requieren persistencia). | Avanzar el Pilar B sin migrar el esquema (H-9). | No hay notificación por correo ni tarea persistente todavía. | Módulo `plazos/`. |
| DT-14 | 2026-11-20 | Reputación = 0,85 · cumplimiento suavizado (Laplace) + 0,15 · actividad normalizada. Alertas con ≥2 fallos o reputación <0,4 con historial. Todo configurable en `PARAMETRO`. | H-5: fórmula transparente y reproducible; los pesos están pendientes (P-11). | Solo informativo; no altera la prioridad (D-27). | `analitica/formulas.ts`, claves `RANKING_*` y `ALERTA_*`. |
| DT-15 | 2026-11-20 | Clasificación del donador: completado = el producto llegó completo; fallido = cancelado sin recepción o con recepción incompleta; pendiente = ASIGNADO. | Separar el fallo del donador del fallo del estudiante. | — | `clasificarCompromisoDonador`. |
| DT-16 | 2026-11-20 | La sesión de Angular se restaura en `provideAppInitializer`, antes de la primera navegación. | Al recargar una ruta protegida se perdía la página (solo UX). | El arranque espera a `/auth/yo`. | `app.config.ts`. |
| DT-17 | 2026-11-20 | `tsconfig.build.json` excluye `*.spec.ts` del build del backend. | Las pruebas no deben llegar a `dist`. | Ninguno funcional. | Borrar el archivo. |
| DT-18 | 2026-11-20 | `.gitignore`: `.env.*` (excepto `.env.example`), `.claude/settings.local.json`, `.vscode/`, `*.zip`. | Evitar versionar secretos o configuración local. | — | Editar `.gitignore`. |
| DT-19 | 2026-11-20 | Benchmark del KD-tree como **script aislado** (`backend/scripts/benchmark-kdtree.ts`); el algoritmo productivo no cambia hasta resolver H-2. | Política H-2. | Ver `ANALISIS_PILAR_A_KDTREE.md`. | — |

## Decisiones que siguen bloqueadas (no tomadas)

| ID | Tema | Documento |
|---|---|---|
| H-2 | Dimensiones de compatibilidad del árbol | `ANALISIS_PILAR_A_KDTREE.md` |
| H-3 | Modelo de LOCAL y lote físico | `DISENO_LOCAL_Y_UBICACION_FISICA.md` |
| H-9 | BD de desarrollo sin datos reales | `PLAN_CIERRE_LIS.md` §2 |
| B-GIT | El entorno denegó `git init` | `PLAN_CIERRE_LIS.md` §6 |
