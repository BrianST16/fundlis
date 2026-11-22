# Indicaciones complementarias para Claude Code — LIS Dona

**Propósito:** complementar las instrucciones permanentes y el protocolo de autonomía del proyecto. Estas aclaraciones son decisiones vigentes del equipo y deben incorporarse al código, modelo de datos, pruebas, documentación y demostración.

## 1. Autoridad y forma de trabajo

- Lee `CLAUDE.md`, las directrices vigentes, el registro de decisiones, la auditoría integral más reciente y el backlog antes de actuar.
- Estas indicaciones complementan y, cuando corresponda, actualizan las decisiones anteriores. Si encuentras una contradicción, identifica el conflicto, registra qué regla prevalece y actualiza la documentación afectada.
- Trabaja con autonomía por módulos completos: analiza, propone brevemente el alcance, implementa, prueba, corrige, documenta y continúa con el siguiente módulo no bloqueado. No te detengas después de presentar un plan.
- No pidas aprobación para decisiones técnicas rutinarias, reversibles y coherentes con las directrices. Sí debes detenerte ante una decisión de negocio no resuelta, una contradicción con una instrucción del profesor o una acción externa/irreversible no cubierta por estas autorizaciones.
- Al terminar cada módulo, entrega un resumen de archivos, comportamiento implementado, pruebas ejecutadas, resultados, limitaciones y estado de aceptación. Mantén actualizado el backlog y la matriz de la rúbrica.

## 2. Base de datos experimental: autorización de modificación

El equipo autoriza modificar la base de datos experimental del proyecto para corregir el esquema, relaciones, restricciones, índices, vistas, procedimientos, datos de prueba y registros de demostración que sean necesarios para que la aplicación funcione correctamente en tiempo real durante la presentación.

Esta autorización incluye crear y ejecutar scripts de migración y ajuste sobre la base de desarrollo/experimental confirmada. No supone autorización para cambiar de motor de base de datos ni para operar sobre producción: conserva el motor actual mientras no exista una decisión documentada distinta.

Antes de cualquier operación destructiva o de reinicialización:

1. Verifica explícitamente servidor, instancia y nombre de base de datos; confirma que corresponde a la base experimental del proyecto y no a producción.
2. Genera un respaldo recuperable del esquema y los datos existentes. No expongas credenciales ni datos personales en la salida.
3. Revisa el impacto y registra qué datos se conservarán, transformarán o reemplazarán.
4. Implementa cambios mediante scripts versionados, ordenados, repetibles cuando sea posible y con instrucciones de recuperación/rollback cuando aplique.
5. Conserva o vuelve a generar un conjunto de datos ficticios y coherentes para la demostración. La base debe quedar operativa y poblada para probar los flujos en tiempo real.
6. No uses datos personales reales para las pruebas o demostraciones.

La autorización permite adaptar la base experimental sin solicitar permiso para cada cambio de esquema o dato. Si no puedes confirmar que la conexión es la base experimental correcta, detente antes de escribir.

## 3. Puntaje de prioridad para el emparejamiento

El proyecto utiliza un puntaje numérico real, no una presentación en porcentajes.

El puntaje de prioridad para emparejar debe conservar y mostrar por separado, como mínimo:

- Puntaje asociado al grupo/categoría Sisbén seleccionado por el estudiante, según la tabla de equivalencias definida para el proyecto.
- Puntaje de caracterización socioeconómica, calculado a partir de un formulario de preguntas de selección múltiple con una única respuesta por pregunta. Cada opción tiene un valor numérico definido; el cálculo se realiza en el backend.
- Componente numérico de antigüedad de la petición, calculado de forma estable y reproducible a partir de su fecha original.
- Puntaje total de prioridad, resultado de combinar los componentes anteriores.

Reglas:

1. No expreses el resultado como porcentaje ni uses etiquetas como “40 % de prioridad”. Utiliza valores numéricos reales y una escala documentada.
2. No confundas el grupo/categoría Sisbén con el puntaje de caracterización: son componentes distintos y ambos contribuyen al puntaje total.
3. Conserva los componentes y el resultado total para poder explicar por qué una petición quedó en determinada posición.
4. Define los rangos, equivalencias y coeficientes a partir de los campos y opciones reales del proyecto. No inventes valores oficiales del Sisbén ni atribuyas a la entidad una escala que no esté respaldada. La equivalencia usada por la plataforma debe quedar identificada como regla del proyecto.
5. Comprueba que las escalas sean comparables para que un componente no domine accidentalmente a los demás. Si se necesitan coeficientes, exprésalos como factores numéricos documentados, no como porcentajes; justifica su elección y mantenlos configurables.
6. La antigüedad debe conservar la fecha original de la petición cuando vuelva a estar elegible por incumplimiento del donador. No recalcules la fecha de creación al reactivarla ni normalices el puntaje de manera distinta en cada consulta.
7. El auxiliar debe poder ver el orden sugerido y los componentes explicativos permitidos, sin acceder a respuestas sensibles de caracterización ni al certificado/datos privados del estudiante.

## 4. Puntaje de comportamiento para analítica y alertas

Es independiente del puntaje de prioridad de emparejamiento. Nunca mezcles ambos puntajes ni uses la reputación para sustituir la prioridad socioeconómica.

### Estudiantes

Construye un indicador numérico de comportamiento usando el historial de peticiones realizadas, ayudas recibidas y faltas/incumplimientos, en especial no recoger productos. Debe permitir generar:

- Un ranking positivo de estudiantes.
- Alertas para estudiantes con historial desfavorable o incumplimientos reiterados.
- Una explicación de los factores que afectan el resultado.

### Donadores

Construye un ranking directo basado en donaciones completadas frente a compromisos fallidos. No es necesario convertirlo en una fórmula compleja si un indicador directo representa mejor la regla de negocio.

### Reglas comunes

- Ambos indicadores son numéricos, auditables y calculables desde eventos/historial verificable.
- Documenta fórmulas, rangos, tratamiento de casos sin historial y umbrales de alerta.
- No atribuyas incumplimientos sin un evento registrado y una regla que los clasifique.
- No uses el puntaje de comportamiento para decidir la prioridad socioeconómica de una petición.
- Incluye un conjunto de datos ficticios y una hoja/cálculo de validación manual para demostrar que los rankings y alertas son correctos.

## 5. Árbol KD y explicación académica para la sustentación

El árbol KD debe tener una función algorítmica genuina en la búsqueda multidimensional de ofertas compatibles con una petición. No debe convertirse en un simple ordenamiento de un único puntaje ni indexar exclusivamente variables socioeconómicas para luego comparar siempre contra un punto fijo.

Separa explícitamente dos procesos:

**A. Búsqueda de compatibilidad mediante KD-tree**

1. Filtra la categoría por igualdad exacta; no interpretes los identificadores de categorías como magnitudes donde dos categorías cercanas numéricamente son más compatibles.
2. Utiliza únicamente atributos reales del producto que tengan significado de compatibilidad y puedan representarse como dimensiones numéricas o rangos justificados. Inspecciona primero los campos existentes de ofertas y peticiones.
3. Ejecuta la consulta multidimensional para recuperar ofertas candidatas compatibles y disponibles.
4. Si el modelo actual no contiene dimensiones de compatibilidad suficientes, documenta la brecha y propone los atributos mínimos necesarios. No inventes características ni modifiques el modelo sin justificar su necesidad.

**B. Priorización de estudiantes**

Después de recuperar candidatos compatibles, calcula y ordena las peticiones por el puntaje numérico de prioridad (Sisbén + caracterización + antigüedad). El árbol de compatibilidad y la fórmula de prioridad cumplen funciones diferentes.

**Entregable académico obligatorio:** prepara una explicación que el estudiante pueda exponer en clase, con:

- Qué problema resuelve el KD-tree y por qué es multidimensional.
- Qué representa cada dimensión con atributos reales del dominio.
- Cómo se construye el árbol (eje de división, mediana u otra estrategia implementada).
- Cómo se consulta con un ejemplo completo de petición y ofertas candidatas.
- Cómo se excluyen las incompatibles y cómo se aplica después el puntaje de prioridad.
- Un diagrama del recorrido del algoritmo y un ejemplo paso a paso.
- Complejidad de construcción, consulta y peor caso, explicando los supuestos.
- Benchmark frente a una búsqueda lineal, incluyendo el coste de construir/actualizar el árbol, no solo el tiempo de consulta.
- Limitaciones y por qué el auxiliar conserva la decisión final.

No afirmes una mejora de rendimiento sin mediciones reproducibles. Si la especificación del profesor exige otra estructura o dimensión, registra el conflicto y no sustituyas unilateralmente el requisito.

## 6. Bandeja interna y notificaciones por correo

Verifica y completa el funcionamiento real de los dos canales:

1. Bandeja de entrada/notificaciones interna de la plataforma.
2. Correo electrónico enviado al email registrado.

Comprueba que las notificaciones se generen automáticamente en los eventos definidos por las reglas del proyecto, como mínimo:

- Aprobación o rechazo de ofertas y peticiones.
- Asignación confirmada.
- Cada cambio de estado relevante.
- Cancelaciones.
- Plazos próximos a vencer y vencidos del donador y del estudiante.
- Creación de tareas `DEFINIR_ESTADO` y decisiones de aplazamiento, reasignación, devolución o aceptación institucional cuando corresponda.

Las alertas deben llegar al usuario involucrado y al auxiliar del LIS cuando las reglas lo indiquen. Respeta la privacidad: nunca reveles al estudiante la identidad del donador ni viceversa en mensajes o bandejas.

Verificaciones técnicas:

- Confirma configuración real del proveedor SMTP, remitente, conectividad y manejo de credenciales por variables de entorno.
- Comprueba persistencia y lectura de la bandeja interna por el usuario autorizado.
- Comprueba envío real a cuentas de prueba controladas por el equipo; no declares el correo funcional porque exista una fila en la base de datos.
- Implementa reintentos, registro de errores e idempotencia para evitar mensajes duplicados.
- Un fallo de correo no debe revertir una operación de negocio confirmada; la bandeja interna debe conservar el aviso y el envío debe poder reintentarse.
- Prueba los disparadores temporales con reloj/datos controlados, sin esperar días reales.
- Documenta cuáles eventos están comprobados en ambos canales y cuáles dependen de credenciales o acceso externo.

## 7. Sujeto institucional LOCAL

`LOCAL` representa al LIS como sujeto institucional/destino; no es una cuenta de usuario, no es un estudiante y no es una petición. Nunca crees una petición vacía o ficticia para representar al LIS.

Reglas funcionales:

1. En la lista de posibles recibidores de un emparejamiento, `LOCAL` debe aparecer siempre como la última opción, después de los estudiantes/peticiones compatibles.
2. El auxiliar puede utilizar `LOCAL` como destino institucional de custodia temporal para mantener el producto bajo custodia del LIS mientras se espera la gestión o respuesta del donador, o mientras se determina su destino.
3. La aceptación de una donación para el propio LIS como donativo institucional requiere autorización del administrador. El auxiliar no puede finalizar por sí solo esa aceptación.
4. Diferencia claramente custodia temporal del LIS de aceptación permanente de la donación por el LIS. Son operaciones y permisos distintos.
5. La ubicación física actual del producto debe modelarse separadamente del estado de una asignación y del historial de eventos.
6. El uso de `LOCAL` debe conservar trazabilidad de quién lo seleccionó, quién autorizó la aceptación institucional, fechas, cantidades, fotografías y cambios de ubicación/destino.
7. Si no hay estudiantes compatibles, `LOCAL` debe seguir disponible como última alternativa cuando la operación sea permitida.
8. Incluye pruebas de que aparece al final, de que el auxiliar puede iniciar custodia temporal, de que solo el administrador puede aceptar el donativo institucional y de que no se crea ninguna petición ficticia.

## 8. Funcionamiento en tiempo real para la presentación

El objetivo es que el sistema pueda utilizarse en una demostración real, no solo que compile.

- Los flujos principales deben ejecutarse desde Angular contra el backend y la base de datos experimental reales.
- No reemplaces funciones centrales con mocks, datos hardcodeados o botones decorativos. Los mocks solo se permiten en pruebas aisladas y deben identificarse.
- Asegura persistencia al recargar la página y consistencia entre sesiones/roles.
- Comprueba estados, inventario, asignaciones, tareas y notificaciones con más de un usuario/rol de prueba.
- Prepara datos ficticios de demostración, cuentas/roles de prueba y un procedimiento repetible para restaurar el escenario antes de exponer.
- Elabora un guion de demo que muestre el flujo central y los tres pilares diferenciadores.
- Documenta cualquier dependencia externa que deba estar configurada el día de la presentación (Google Client ID, SMTP, conexión a BD, hosting).

## 9. Criterio de cierre de cada módulo

Un módulo no se considera terminado solo porque el código exista o compile. Debe cumplir:

1. Requerimiento y regla de negocio identificados.
2. Backend protegido y validación de permisos.
3. Integridad de datos y manejo de errores.
4. Interfaz conectada al backend real.
5. Pruebas automatizadas o manuales reproducibles con resultado documentado.
6. Documentación y matriz de rúbrica actualizadas.
7. Escenario de demostración funcional cuando aplique.

Al finalizar el módulo, continúa automáticamente con el siguiente módulo no bloqueado. Detente únicamente ante bloqueos reales que requieran decisión del profesor/equipo, riesgos de pérdida irreversible fuera de la autorización de base experimental, o dependencias externas que no puedas configurar sin credenciales.
