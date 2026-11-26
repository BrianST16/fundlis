import { Component, input } from '@angular/core';
import { MiAsignacion, MiPlazo } from '../core/modelos';
import { fecha } from '../core/utilidades';

/**
 * Seguimiento de las asignaciones de UNA donacion o UNA peticion propia
 * (reemplaza la antigua pagina "Mis movimientos"). Muestra el estado, el
 * siguiente paso y el plazo en dias habiles. Los intentos cerrados se ven
 * atenuados, debajo del vigente.
 */
@Component({
  selector: 'lis-seguimiento',
  standalone: true,
  template: `
    @if (asignaciones().length) {
      <div class="seguimiento">
        @for (a of asignaciones(); track a.id) {
          <div class="paso" [class.cerrado]="cerrada(a)">
            <div class="fila">
              <span class="etiqueta" [class.gris]="cerrada(a)" [class.ambar]="a.estado === 'ASIGNADO'">{{ legible(a.estado) }}</span>
              <span class="dato">{{ a.cantidadAsignada }} u. &middot; asignada el {{ f(a.asignadaEn) }}</span>
              @if (plazos().get(a.id); as p) {
                <span class="etiqueta"
                      [class.roja]="p.estado === 'VENCIDO'"
                      [class.ambar]="p.estado === 'POR_VENCER'">
                  {{ p.estado === 'VENCIDO' ? 'Plazo vencido' : p.estado === 'POR_VENCER' ? 'Por vencer' : 'En plazo' }}
                  &middot; límite {{ p.fechaLimite }}
                </span>
              }
            </div>
            <p class="dato">
              {{ siguientePaso(a) }}
              @if (a.motivoCierre) { &middot; Cierre: <strong>{{ a.motivoCierre }}</strong> }
            </p>
          </div>
        }
      </div>
    }
  `,
})
export class SeguimientoComponent {
  asignaciones = input.required<MiAsignacion[]>();
  /** Plazos propios (dias habiles) por id de asignacion. */
  plazos = input<Map<number, MiPlazo>>(new Map());
  f = fecha;

  cerrada(a: MiAsignacion): boolean {
    return a.estado === 'CANCELADO' || a.estado === 'ENTREGADO';
  }

  siguientePaso(a: MiAsignacion): string {
    if (a.estado === 'ASIGNADO') {
      return a.miPapel === 'DONADOR'
        ? 'Lleva el producto al LIS para que lo reciban y lo registren.'
        : 'El donador debe llevar el producto al LIS. Te avisaremos cuando puedas recogerlo.';
    }
    if (a.estado === 'EN_CUSTODIA') {
      return a.miPapel === 'ESTUDIANTE'
        ? 'El producto ya está en el LIS: puedes ir a recogerlo.'
        : 'El LIS ya recibió el producto.';
    }
    if (a.estado === 'ENTREGADO') return `Entregado el ${fecha(a.entregadaEn)}.`;
    if (a.estado === 'DEVOLUCION') return 'El producto quedó destinado a devolución al donador.';
    return 'Este intento se cerró sin entrega.';
  }

  legible(estado: string): string {
    const mapa: Record<string, string> = {
      ASIGNADO: 'Asignado',
      EN_CUSTODIA: 'En custodia del LIS',
      ENTREGADO: 'Entregado',
      DEVOLUCION: 'En devolución',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado] ?? estado;
  }
}
