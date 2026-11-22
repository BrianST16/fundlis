# Diseño: destino LOCAL y ubicación física del producto (T3.1)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Estado | **DISEÑADO [PROP]**. Requiere aprobación del equipo (H-3) y autorización de BD (H-9) antes de escribir y aplicar `db/03_local_ubicacion.sql`. |
| Reglas cubiertas | D-19, D-20 (LOCAL), directriz §4 (separar intento / ubicación física / historial), P-05, P-08, P-18, P-23 |

## 1. Problema actual [CÓD]

- `OFERTA_X_PETICION` mezcla dos cosas: el **intento de asignación** y el **lugar donde está el producto**.
- Si un estudiante no recoge (EN_CUSTODIA → CANCELADO), las unidades vuelven a la oferta original como "disponibles". Para reasignarlas, el auxiliar tiene que crear un intento nuevo en ASIGNADO y registrar una **recepción ficticia**, aunque el producto ya está en el LIS.
- No existe LOCAL.

## 2. Requisitos

1. LOCAL es el **destinatario institucional**: no es un usuario, ni una petición, ni una FK ambigua.
2. LOCAL aparece **al final** de la lista de posibles recibidores.
3. El auxiliar puede gestionar la espera y la custodia adicional; la **aceptación** para el LIS la hace el **administrador**.
4. Separar: (a) vigencia del intento, (b) ubicación física de las unidades, (c) historial inmutable.
5. Sin recepción ni entrega parcial dentro de una asignación.
6. Reasignar desde custodia sin recepción ficticia.

## 3. Alternativas para LOCAL

| | Alternativa 1: LOCAL dentro de `OFERTA_X_PETICION` | Alternativa 2: aceptación institucional en su propia tabla (**recomendada**) |
|---|---|---|
| Modelo | `peticion_id` pasa a NULL y se agrega `destino IN ('PETICION','LOCAL')`, con un CHECK que obliga a que exista exactamente uno | Tabla `ACEPTACION_LOCAL` ligada al **lote físico**; `OFERTA_X_PETICION` no cambia |
| FK ambigua | Sí: `peticion_id` NULL cambia de significado según `destino` | No |
| Vista indexada "1 vigente por petición" | Hay que ajustarla para excluir LOCAL | No cambia |
| Plazos y ranking | Hay que excluir LOCAL de los plazos de estudiante y del ranking | No los afecta |
| Semántica | Un "intento de asignación" a una institución | Una **disposición** de unidades que ya están físicamente en el LIS: refleja que LOCAL es el destino de último recurso |

**Recomendación:** Alternativa 2. Evita la FK ambigua que prohíbe la directriz §5 y deja intactas las invariantes que ya están probadas.

## 4. Ubicación física: `LOTE_FISICO`

Cada **recepción completa** crea un lote: las unidades que el LIS tiene físicamente.

```sql
-- BOCETO, no aplicado.
CREATE TABLE LOTE_FISICO (
  id                     INT IDENTITY PRIMARY KEY,
  oferta_id              INT NOT NULL REFERENCES OFERTA(id),
  movimiento_recepcion_id INT NOT NULL UNIQUE REFERENCES MOVIMIENTO(id),
  cantidad               INT NOT NULL CHECK (cantidad > 0),
  ubicacion              VARCHAR(20) NOT NULL
      CHECK (ubicacion IN ('EN_LIS','ENTREGADO','DEVUELTO','ACEPTADO_LOCAL')),
  sin_destino_desde      DATETIME2(0) NULL,  -- inicio de la espera para LOCAL (P-08)
  actualizado_en         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

ALTER TABLE OFERTA_X_PETICION ADD lote_id INT NULL REFERENCES LOTE_FISICO(id);
ALTER TABLE OFERTA_X_PETICION ADD origen VARCHAR(15) NOT NULL DEFAULT 'DONADOR'
      CHECK (origen IN ('DONADOR','REASIGNACION'));

CREATE TABLE ACEPTACION_LOCAL (
  id             INT IDENTITY PRIMARY KEY,
  lote_id        INT NOT NULL UNIQUE REFERENCES LOTE_FISICO(id),
  solicitada_por INT NOT NULL REFERENCES USUARIO(id),   -- auxiliar
  autorizada_por INT NULL REFERENCES USUARIO(id),       -- administrador (D-20)
  estado         VARCHAR(15) NOT NULL CHECK (estado IN ('SOLICITADA','AUTORIZADA','RECHAZADA')),
  motivo         NVARCHAR(400) NOT NULL,
  solicitada_en  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  resuelta_en    DATETIME2(0) NULL,
  CONSTRAINT CK_ACEPTACION_autorizacion CHECK (estado <> 'AUTORIZADA' OR autorizada_por IS NOT NULL)
);
```

### Flujos

| Evento | Intento (`OFERTA_X_PETICION`) | Lote físico |
|---|---|---|
| Recepción completa | ASIGNADO → EN_CUSTODIA, `lote_id` asignado | Se crea el lote, `EN_LIS` |
| Entrega | EN_CUSTODIA → ENTREGADO | `ENTREGADO` |
| El estudiante no recoge y se reasigna (P-23) | El intento original pasa a CANCELADO (la petición se cierra por incumplimiento, D-16). El **intento nuevo** nace con `origen = REASIGNACION` **directamente en EN_CUSTODIA**, con el mismo `lote_id`, **sin recepción**. Su plazo de 3 días hábiles corre desde la reasignación. | Sigue `EN_LIS` |
| No hay candidatos | El intento pasa a CANCELADO | `sin_destino_desde` = ahora; empieza la espera de LOCAL (3 días hábiles [PROP], P-08) |
| El auxiliar propone LOCAL | — | `ACEPTACION_LOCAL` en SOLICITADA |
| El administrador autoriza | — | `ACEPTADO_LOCAL` (inventario institucional, P-18) |
| Devolución al donador | EN_CUSTODIA → DEVOLUCION y movimiento DEVOLUCION | `DEVUELTO` |
| Recepción incompleta (D-18) | CANCELADO (sin lote: no hay recepción parcial) | Se crea un lote con lo recibido, ligado a la **oferta nueva** que genera el sistema |

### Emparejamiento

La lista de candidatos de un lote o de una oferta = peticiones compatibles ordenadas por prioridad, **más una última fila fija "LOCAL (requiere autorización del administrador)"** (D-19).

## 5. Invariantes nuevas

1. Un lote tiene como máximo **un** intento vigente (vista indexada análoga a `VW_OXP_VIGENTE` sobre `lote_id`).
2. Si un intento tiene `origen = REASIGNACION`, entonces tiene `lote_id`, y su lote está `EN_LIS` al crearlo.
3. La suma de las cantidades de los lotes de una oferta ≤ cantidad de la oferta.
4. `ACEPTADO_LOCAL` exige una `ACEPTACION_LOCAL` en estado AUTORIZADA por un usuario con rol ADMINISTRADOR (se comprueba en el servicio; la BD obliga a registrar quién autorizó).

## 6. Decisiones que necesita el equipo

| ID | Pregunta | Propuesta |
|---|---|---|
| H-3a | ¿Alternativa 2 (tabla de aceptación + lote físico)? | Sí |
| P-08 | ¿Desde cuándo corre la espera de 3 días de LOCAL? | Desde que el lote queda sin destino (`sin_destino_desde`) |
| P-23 | ¿Qué plazo tiene el estudiante nuevo en una reasignación? | 3 días hábiles desde la reasignación |
| P-18 | ¿LOCAL crea inventario institucional permanente? | Sí: el lote queda `ACEPTADO_LOCAL`, con trazabilidad completa |
