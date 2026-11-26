import { EntityManager, IsNull } from 'typeorm';
import { DecisionTarea, Tarea } from '../entities';

/** Objeto sobre el que se hizo la accion. */
export type ObjetoTarea =
  | { asignacionId: number }
  | { destinoLocalId: number }
  /** soloSinDestino: solo las tareas del lote sin destino (no las de un destino LOCAL). */
  | { loteId: number; soloSinDestino?: boolean };

/**
 * D-56: una sola decision, varias entradas.
 *
 * Cuando una accion se ejecuta fuera de "Plazos y tareas" (Custodia, LOCAL,
 * Emparejamiento, el donador al responder) sobre un objeto que tiene una
 * tarea DEFINIR_ESTADO abierta, esa tarea se cierra EN LA MISMA TRANSACCION
 * con la decision real, el motivo y quien la tomo. Antes quedaba abierta
 * hasta la siguiente revision (y fallaba si alguien la decidia) y luego se
 * cerraba como SIN_ACCION "por otra via", lo que falseaba la auditoria.
 *
 * Si la accion viene de la propia tarea (TareasService.resolver), este
 * cierre ocurre primero y el resolver lo sobrescribe con su decision y su
 * motivo: el resultado final es el mismo.
 */
export async function cerrarTareasDe(
  mgr: EntityManager,
  objeto: ObjetoTarea,
  decision: DecisionTarea,
  motivo: string,
  actorId: number | null,
): Promise<number> {
  const where: Record<string, unknown> = { estado: 'ABIERTA' };
  if ('asignacionId' in objeto) where.asignacionId = objeto.asignacionId;
  else if ('destinoLocalId' in objeto) where.destinoLocalId = objeto.destinoLocalId;
  else {
    where.loteId = objeto.loteId;
    if (objeto.soloSinDestino) where.destinoLocalId = IsNull();
  }
  const r = await mgr.getRepository(Tarea).update(where, {
    estado: 'RESUELTA',
    decision,
    motivo: motivo.slice(0, 400),
    resueltaPor: actorId,
    resueltaEn: new Date(),
  });
  return r?.affected ?? 0;
}
