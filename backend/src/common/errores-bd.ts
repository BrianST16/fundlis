/**
 * ¿El error es una violación de unicidad? Sirve para la idempotencia de
 * tareas y avisos: si dos revisiones crean la misma fila (misma clave), el
 * índice único rechaza la segunda y se trata como "ya existía".
 *
 * PostgreSQL (D-68): SQLSTATE 23505 (unique_violation). TypeORM lo expone en
 * QueryFailedError.code y en driverError.code.
 */
export function esViolacionUnica(e: unknown): boolean {
  const err = e as { code?: string; driverError?: { code?: string } } | null;
  return err?.code === '23505' || err?.driverError?.code === '23505';
}
