import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { TareaDefinirEstado } from './modelos';

/**
 * D-59: tareas DEFINIR_ESTADO abiertas, una sola fuente para el menu y las
 * paginas. Cada tarea se muestra y se decide donde vive su objeto:
 *  - de asignaciones        -> "Entregas y plazos";
 *  - de destinos Local/lotes -> "Local y lotes".
 * El menu lateral muestra los contadores (se refresca cada minuto).
 */
@Injectable({ providedIn: 'root' })
export class TareasPendientesService {
  private api = inject(ApiService);

  readonly abiertas = signal<TareaDefinirEstado[]>([]);

  readonly deAsignaciones = computed(() => this.abiertas().filter((t) => !!t.asignacionId));
  readonly deLocal = computed(() => this.abiertas().filter((t) => !t.asignacionId));

  /** Por id de asignacion. */
  readonly porAsignacion = computed(
    () => new Map(this.deAsignaciones().map((t) => [t.asignacionId as number, t])),
  );
  /** Por id de destino Local (propuesta sin respuesta, recepcion o custodia vencidas). */
  readonly porDestino = computed(
    () => new Map(this.deLocal().filter((t) => t.destinoLocalId).map((t) => [t.destinoLocalId as number, t])),
  );
  /** Lotes sin destino (sin destino Local asociado). */
  readonly porLote = computed(
    () => new Map(this.deLocal().filter((t) => t.loteId && !t.destinoLocalId).map((t) => [t.loteId as number, t])),
  );

  refrescar(): void {
    this.api.tareas('ABIERTA').subscribe({
      next: (l) => this.abiertas.set(l),
      // Informativo: un fallo no debe tumbar la pagina.
      error: () => undefined,
    });
  }

  limpiar(): void {
    this.abiertas.set([]);
  }
}
