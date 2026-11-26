# Proyecto LIS — Resumen ejecutivo para el equipo

> **Actualizado el 2026-11-26.** Las secciones 1 a 7 describen el negocio y siguen vigentes. Los puntos que aquí figuran como "pendientes" ya se decidieron: el resultado está en la **sección 10** y el detalle en `docs/01_decisiones_y_pendientes.md` (D-38 a D-67). La sección 8 describe el CRUD de partida y es **histórica**.

**Nombre de trabajo:** Plataforma web de intermediación de donaciones y peticiones del Laboratorio Integrado de Sistemas (LIS), Universidad de Antioquia.

## 1. Propósito y problema

El LIS necesita centralizar la gestión de ofertas de donación y necesidades de la comunidad universitaria. La plataforma busca reemplazar la gestión informal por un proceso controlado de publicación, aprobación, emparejamiento, recepción, custodia y entrega, con inventario temporal, privacidad y trazabilidad. El LIS es el intermediario obligatorio: estudiantes y donadores no gestionan directamente la entrega entre sí.

## 2. Actores, autenticación y privacidad

| Actor | Funciones principales |
|---|---|
| Invitado | Consulta ofertas y peticiones de forma anónima; no tiene cuenta. |
| Estudiante | Google con correo `@udea.edu.co`; completa caracterización, selecciona su grupo Sisbén, crea/consulta/cancela sus peticiones según reglas. No publica ofertas. |
| Donador | Google con correo no institucional UdeA; publica ofertas con cantidad. Solo puede cancelar antes de que la oferta sea asignada. |
| Auxiliar LIS | Cuenta Google con correo no institucional; ve identidades/contactos necesarios, aprueba/rechaza publicaciones, asigna cantidades y gestiona recepción, custodia, entregas, devoluciones, plazos y reportes. |
| Administrador | Tiene permisos del auxiliar y, además, ve caracterización sensible, gestiona usuarios/roles/bloqueos, autoriza donaciones para LOCAL, decide emparejamientos críticos y ejecuta eliminaciones excepcionales auditadas. |

Los perfiles de estudiante y donador son excluyentes por cuenta: quien participe en ambos utilizará cuentas Google distintas. La política de dominio y provisión inicial del administrador sigue pendiente. El backend verifica la identidad Google y decide los permisos; nunca confía en el rol o dominio enviado por Angular.

**Privacidad:** invitados, estudiantes y donadores ven catálogos anónimos. Solo auxiliares y administradores pueden consultar identidades y contactos; únicamente el administrador accede a la caracterización sensible. La protección se aplica en el backend, por endpoint y por campo.

## 3. Flujo principal

1. El estudiante se autentica, diligencia caracterización y grupo Sisbén, y crea una petición **sin cantidad solicitada**.
2. El donador se autentica y publica una oferta con producto, categoría y cantidad disponible.
3. El personal autorizado del LIS aprueba o rechaza ofertas y peticiones. Lo aprobado se muestra anónimamente.
4. El sistema encuentra candidatos y calcula prioridad. El auxiliar revisa las sugerencias y define la cantidad que asignará.
5. La asignación se registra en `OFERTA_X_PETICION`.
6. El donador tiene diez días hábiles desde la notificación para llevar la cantidad completa al LIS. La recepción exige fotografía.
7. Desde `EN_CUSTODIA`, el estudiante tiene tres días hábiles para retirar la cantidad completa. La entrega final exige fotografía. Si vence el plazo, el auxiliar puede ampliar tres días hábiles, reasignar o iniciar devolución.
8. Ante vencimientos se crea una alerta bilateral y una tarea `DEFINIR_ESTADO` para que el auxiliar contacte al usuario y decida aplazar, cancelar, reasignar o iniciar devolución, según el caso. Para el incumplimiento del donador, el auxiliar contacta al donador y puede aplazar por un plazo aún por definir o cancelar el intento.

## 4. Reglas esenciales

- Máximo cinco peticiones pendientes de aprobación y activas por estudiante. Debe precisarse si una petición ya asignada sigue contando dentro del límite.
- Una oferta tiene cantidad disponible; una petición no tiene cantidad solicitada.
- Una oferta puede dividirse entre varias peticiones. Una petición solo tiene **una asignación vigente**, aunque puede conservar varios intentos históricos.
- Si el donador incumple antes de la recepción física, se cancela el intento, se libera la cantidad de la oferta y la petición se reactiva conservando su fecha original.
- Si el estudiante no recoge el producto y se cancela la asignación para reasignar o devolver, su petición se cierra por incumplimiento. Si recibe el producto, la petición se cierra por entrega.
- Si el donador entrega menos unidades que las asignadas, se cancela ese intento y se crea una nueva oferta por la cantidad correspondiente. No hay recepción ni entrega parcial de una misma asignación.
- Los plazos se calculan en días hábiles colombianos, con festivos y cierres vacacionales parametrizables. La recepción de donaciones se suspende anticipadamente en vacaciones.

### Estados de `OFERTA_X_PETICION`

| Estado | Significado |
|---|---|
| `ASIGNADO` | Cantidad comprometida con una petición. |
| `EN_CUSTODIA` | Cantidad completa recibida físicamente en el LIS. |
| `ENTREGADO` | Cantidad completa entregada al estudiante. |
| `DEVOLUCION` | Producto recibido cuyo destino es el retiro por el donador u otra resolución autorizada. |
| `CANCELADO` | Vínculo de asignación desactivado; conserva historial y permite liberar disponibilidad cuando corresponda. |

`CANCELADO` no significa que el producto haya salido físicamente del LIS. `DEVOLUCION` no equivale a cancelar el vínculo. El modelo debe separar estado de asignación, estado/localización física actual del producto e historial de eventos.

## 5. Destino institucional LOCAL

`LOCAL` es un sujeto/destinatario institucional del LIS, no es usuario de Google ni una petición vacía. Aparece siempre como última opción de la lista de posibles recibidores, después de los estudiantes compatibles. El auxiliar puede gestionar una espera/custodia adicional de tres días hábiles según las reglas; la aceptación final de la donación para el LIS requiere autorización del administrador. El modelo debe representar este destino sin crear una petición ficticia.

## 6. Emparejamiento y analítica

El emparejamiento es semiautomático y supervisado por el LIS:

- **Búsqueda:** implementar y justificar un KD-tree adaptativo o R-tree con dimensiones reales de compatibilidad; la categoría es una condición de igualdad, no una distancia numérica.
- **Prioridad:** combinación ponderada de caracterización, grupo Sisbén y antigüedad. El MVP utiliza preguntas de opción única puntuadas y selección del grupo Sisbén; no exige cargar certificado. Pesos, escalas, normalización y desempates están pendientes.
- **Decisión humana:** el algoritmo sugiere; el auxiliar confirma y asigna cantidad.
- **Ranking separado:** estudiantes según peticiones, ayudas recibidas e incumplimientos/no recepciones; donadores según donaciones completadas frente a compromisos fallidos. La reputación no reemplaza el puntaje de prioridad.

## 7. Notificaciones, evidencia y auditoría

Las alertas se envían al buzón interno y al correo ante asignaciones, cambios de estado, cancelaciones y proximidad/vencimiento de plazos; se informa al auxiliar y al usuario involucrado. Se exige evidencia fotográfica de la recepción física y entrega final, almacenada de forma privada. El historial debe permitir reconstruir los intentos, movimientos y decisiones. Las eliminaciones administrativas son excepcionales: requieren justificación, reautenticación Google (nunca contraseña de Google) y registro de auditoría; se prefiere baja lógica/anonimización sin destruir la trazabilidad.

## 8. Stack y estado del CRUD (histórico, auditoría F0)

**Directriz del profesor:** Angular, backend JavaScript y MySQL; arquitectura real de tres capas y tres componentes desplegables independientes.

**CRUD auditado:** Angular 22.1.7; NestJS 12.0.3 con TypeScript; TypeORM 1.1.1; SQL Server Express; una entidad `Persona` y siete endpoints básicos. No existen autenticación, roles ni módulos del dominio LIS. Se detectaron credenciales de BD en código, CORS abierto, exposición de datos personales, actualización sin DTO y borrado físico. No hay migraciones ni scripts de esquema; las pruebas no se ejecutaron y algunas parecen fallar por inspección.

**Pendiente técnico importante:** confirmar con el profesor si TypeScript/NestJS cumple el requisito de backend JavaScript y resolver MySQL frente a SQL Server. Antes de migrar debe comprobarse si hay datos que conservar. Los secretos deben salir del código y revisarse antes del primer commit.

## 9. Orden de trabajo según la rúbrica

1. Anteproyecto, alcance, objetivos y matriz de trazabilidad.
2. Modelo de identidad, Google, roles, permisos y privacidad.
3. Requerimientos, procesos, estados y modelo entidad-relación.
4. Arquitectura y tres componentes desplegables.
5. Flujo completo LIS: publicaciones, aprobaciones, asignación, recepción, custodia, entrega/devolución.
6. Los tres pilares: (a) KD/R-tree y prioridad; (b) ciclo de vida, plazos y notificaciones duales; (c) analítica, rankings y alertas.
7. Pruebas, auditoría, evidencias, despliegue y documentación para sustentar cada criterio.

**Estado:** resumen basado en las directrices del profesor, aclaraciones del equipo y auditoría del CRUD. Los puntos pendientes no deben presentarse como decisiones aprobadas.

## 10. Cómo quedó resuelto (2026-11-26)

| Tema | Resultado | Decisión |
|---|---|---|
| Stack | Angular 20, NestJS 11 con TypeScript, TypeORM y SQL Server Express, en tres componentes separados. Falta la confirmación escrita del profesor. | D-31, D-32 |
| Primer administrador | Sale de `ADMIN_EMAILS`. Rol SUPERUSUARIO, asignado solo por script, para gestionar a los administradores. | P-03, D-45 |
| Límite de 5 | Cuentan las peticiones pendientes y aprobadas. Una asignada sigue contando hasta cerrarse (propuesta). | P-04 |
| Emparejamiento | KD-tree adaptativo de **compatibilidad**: categoría por igualdad, estado de conservación y medida o talla. Después, prioridad P = 0,5·C + 0,3·S + 0,2·A con A = min(1, días/90). Local siempre al final. El auxiliar confirma. | D-38, D-41 |
| LOCAL | Tabla `DESTINO_LOCAL` (nunca una petición ficticia) con lote físico separado del intento. Custodia temporal por el auxiliar. Que quede para el LIS lo propone el administrador y requiere el consentimiento del donador. | D-43, D-50 |
| Plazos y aplazamientos | Donador: 10 días hábiles más una prórroga de 5. Estudiante: 3 más una extensión de 3. Las esperas de Local tienen fecha y tope. Lo vencido es una tarea `DEFINIR_ESTADO` que se decide donde está el objeto. | D-58 a D-62 |
| Notificaciones | Bandeja interna persistente. El correo tiene cola, pero queda fuera del alcance por ahora. | D-42, D-53 |
| Certificado de estudio | Opcional; lo valida el administrador; no afecta el puntaje. | D-46 |
| Ranking | Separado de la prioridad: estudiantes en riesgo y donador recurrente. | D-40, D-49, D-55 |
| Bloqueo de cuentas | Solo sin mediaciones en curso; cierra las publicaciones abiertas. | D-64 |
| Pendiente | Eliminación excepcional con reautenticación de Google (D-30, P-14), correo, panel de parámetros (P-60), despliegue y pruebas con Postman. | — |
