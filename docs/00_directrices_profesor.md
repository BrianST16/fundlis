# 00 — Directrices vigentes del proyecto LIS

> Documento consolidado a partir de las directrices entregadas por el profesor y las aclaraciones posteriores del equipo. Las aclaraciones del equipo se identifican por separado y no deben atribuirse al profesor si no fueron expresamente indicadas por él.

## 1. Propósito y contexto

Desarrollar una plataforma web para gestionar ofertas de donación y peticiones de productos de la comunidad universitaria, con el Laboratorio Integrado de Sistemas (LIS) como intermediario obligatorio de aprobación, asignación, recepción, custodia, entrega, devolución y trazabilidad.

## 2. Actores, acceso e identidad

- **Invitado:** consulta de forma anónima las ofertas y peticiones publicadas. No tiene cuenta.
- **Estudiante:** autenticación Google; correo institucional verificado `@udea.edu.co`. Completa caracterización y selecciona grupo Sisbén. Crea peticiones, consulta información anónima y cancela sus propias peticiones según las reglas.
- **Donador:** autenticación Google con correo diferente al institucional UdeA. Consulta ofertas/peticiones anónimas y publica ofertas de donación con cantidad. Puede cancelar su oferta únicamente antes de que sea asignada.
- **Auxiliar LIS:** autenticación Google con correo diferente al institucional UdeA. Accede a identidades y contactos necesarios para mediar; aprueba/rechaza ofertas y peticiones; ejecuta asignaciones; administra estados, plazos, custodia, recepción, entrega, devolución y reportes.
- **Administrador:** tiene los permisos del auxiliar y además accede a información sensible de caracterización, gestiona usuarios/roles/bloqueos, decide emparejamientos críticos, autoriza la aceptación de donaciones para LOCAL y realiza eliminaciones excepcionales bajo auditoría.

### Privacidad

- Invitados, estudiantes y donadores visualizan ofertas y peticiones publicadas anónimamente.
- Únicamente auxiliares y administradores acceden a identidades y datos de contacto, conforme a la función.
- Solo administradores acceden a caracterización sensible.
- Los permisos deben comprobarse en backend. Ocultar elementos en Angular no es autorización.
- El rol no puede ser declarado ni alterado por el cliente.

### Aclaración del equipo sobre perfiles

Los perfiles de estudiante y donador son excluyentes por cuenta. Una persona que necesite participar como estudiante y donador utilizará cuentas Google diferentes. Donador y auxiliar se registran con cuentas no institucionales UdeA. La regla de dominio y provisión inicial para administradores queda pendiente.

## 3. Publicaciones y reglas de negocio

- Estudiantes publican peticiones; donadores publican ofertas.
- Ofertas y peticiones quedan sujetas a aprobación del personal LIS autorizado.
- Cada estudiante puede tener máximo cinco peticiones hechas que estén pendientes de aprobación o activas. El tratamiento de una petición asignada dentro de ese cómputo debe explicitarse en el diseño.
- Las ofertas contienen cantidad disponible.
- Las peticiones **no tienen cantidad solicitada**. La cantidad se define al asignar desde una oferta.
- Una oferta puede fraccionarse entre diferentes peticiones mediante varias asignaciones.
- Una petición puede tener varios intentos históricos, pero solo una asignación vigente en cada momento.
- La petición se oculta del catálogo mientras está asignada/en proceso.
- Si el donador incumple antes de la recepción física, se cancela el intento, se libera la cantidad de oferta y la petición se reactiva conservando su fecha original.
- Si el estudiante no recoge el artículo y se cancela la asignación para reasignar o devolver, la petición original se cierra por incumplimiento.
- Si el estudiante recibe el producto, la petición se cierra por entrega.
- Si el donador entrega menos unidades que las asignadas, se cancela ese intento y se crea una nueva oferta por la cantidad correspondiente. No hay recepción parcial de una misma asignación.
- No se permiten entregas parciales de una misma asignación.

## 4. Tabla intermedia y estados

La tabla intermedia se denomina **`OFERTA_X_PETICION`**. Es el vínculo entre una oferta y una petición, guarda la cantidad asignada y conserva cada intento histórico. No debe eliminarse conceptualmente ni físicamente para reasignar.

Estados del intento de asignación:

| Estado | Significado |
|---|---|
| `ASIGNADO` | La cantidad queda comprometida con una petición; disminuye la disponibilidad de la oferta. |
| `EN_CUSTODIA` | El donador entregó físicamente en el LIS la cantidad completa de esa asignación. |
| `ENTREGADO` | El estudiante recibió físicamente la cantidad completa; finalización satisfactoria. |
| `DEVOLUCION` | El producto sí fue recibido por el LIS y debe resolverse mediante retiro del donador u otro destino institucional permitido. |
| `CANCELADO` | Se desactiva el vínculo/ intento de asignación; se conserva el registro histórico. No significa que el producto haya salido físicamente del LIS. |

`CANCELADO` fue agregado como aclaración del equipo para distinguir la anulación administrativa del vínculo de la situación física del producto. `DEVOLUCION` no es sinónimo de cancelación.

El diseño debe separar:

1. Estado/vigencia del intento de asignación.
2. Estado y localización física actual de las unidades/producto.
3. Historial inmutable de eventos, decisiones y movimientos.

No crear estados `RECEPCION_PARCIAL` ni `ENTREGA_PARCIAL`.

## 5. Destino institucional LOCAL

- `LOCAL` representa al LIS como destinatario/sujeto institucional.
- No es usuario autenticable, estudiante ni petición vacía.
- Aparece siempre como última opción en la lista de posibles recibidores, después de estudiantes/peticiones compatibles.
- El auxiliar puede gestionar espera y custodia adicional según las reglas.
- La aceptación final de una donación para el propio LIS debe realizarla/autorizarla el administrador.
- El modelo de datos debe representar LOCAL sin crear petición ficticia ni una FK ambigua; comparar alternativas antes de aprobar una.

## 6. Plazos, custodia y calendario

- Donador: diez días hábiles desde la notificación de asignación para llevar el artículo al LIS.
- Estudiante: tres días hábiles desde que la asignación pasa a `EN_CUSTODIA` para retirar el artículo.
- Si vence un plazo, alertas bilaterales y tarea `DEFINIR_ESTADO` para el auxiliar.
- Al vencer el plazo del donador, el auxiliar contacta al donador y decide aplazar por un tiempo aún por definir o cancelar el intento.
- Al vencer el plazo del estudiante, el auxiliar puede extender tres días hábiles adicionales, reasignar a otro estudiante compatible o iniciar `DEVOLUCION`.
- Existe una custodia/espera adicional de tres días para la gestión del destino LOCAL según las aclaraciones del equipo. Precisar desde qué evento corre y cómo interactúa con los otros plazos.
- Los días hábiles se calculan con calendario colombiano, incluyendo sábados, domingos y festivos nacionales.
- En vacaciones se suspende la recepción de donaciones con anticipación. Fechas de vacaciones/cierres del LIS deben ser configurables, no hardcodeadas.

## 7. Emparejamiento y prioridad

El motor semiautomático es un pilar central:

1. Filtrar ofertas/peticiones compatibles, comenzando por categoría y disponibilidad. Definir otras dimensiones reales (tipo, talla, características) sin convertir identificadores de categoría en distancias numéricas.
2. Implementar un árbol KD adaptativo o un árbol R; seleccionar la alternativa más sencilla de integrar y justificar la elección.
3. Calcular prioridad por tres variables: puntuación de caracterización, grupo/puntaje Sisbén y antigüedad de la petición.
4. El motor sugiere el orden; auxiliar/administrador valida y confirma la asignación y su cantidad.

### Caracterización y Sisbén

- Formulario con preguntas de elección múltiple de única respuesta.
- Cada opción obtiene un valor de puntuación.
- El estudiante selecciona el tipo/grupo Sisbén, al que se le asigna un valor.
- En el MVP no se adjunta certificado Sisbén; la carga documental queda como ampliación futura.
- Preguntas, escalas, pesos, normalización, reglas de ausencia de datos y desempates están pendientes de diseño/aprobación.

## 8. Estados, notificaciones y evidencia

- Notificación por dos canales: buzón interno de la plataforma y correo electrónico.
- Eventos: asignaciones, cambios de estado, cancelaciones, proximidad/vencimiento de plazos y tareas de decisión. Alertar al auxiliar y al usuario involucrado.
- Evidencia fotográfica obligatoria de recepción física y entrega final al estudiante.
- Mantener trazabilidad completa de productos/ofertas, peticiones, intentos de asignación y movimientos físicos.

## 9. Auditoría y eliminaciones excepcionales

- El administrador puede eliminar registros en casos excepcionales y bajo auditoría estricta.
- Exigir justificación escrita y reautenticación con Google. Nunca pedir ni almacenar la contraseña de Google.
- Conservar constancia de quién, cuándo, qué registro, motivo y resultado de la reautenticación.
- Preferir baja lógica/anonimización compatible con conservación histórica; no destruir trazabilidad mediante cascadas.

## 10. Stack y rúbrica

### Stack indicado por el profesor

- Frontend: Angular.
- Backend: JavaScript.
- Base de datos: MySQL.
- Arquitectura: tres capas (presentación, negocio, datos) con validación de seguridad en backend.
- Componentes desplegables: frontend, backend/API y BD independientes e identificables.

### Criterios de evaluación a cubrir

1. Tres componentes/servicios independientes y sus enlaces/evidencias.
2. Google Authentication operativa y dominio institucional para estudiantes.
3. Arquitectura en capas con roles, permisos y protección de información.
4. Flujo completo de intermediación LIS: publicación, aprobación, asignación, custodia y entrega.
5. Tres pilares de valor agregado: emparejamiento KD/R-tree y prioridad; gestión de ciclo de vida/plazos/notificaciones; analítica y ranking de comportamiento.

El producto debe incluir pruebas, documentación y evidencias demostrables para cada criterio.
