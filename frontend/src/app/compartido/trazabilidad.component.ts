import { Component, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { EventoTrazabilidad, Trazabilidad } from '../core/modelos';
import { estadoLegible, fecha, mensajeError } from '../core/utilidades';
import { FotoComponent } from './foto.component';

type Filtro = 'TODO' | 'ESTADO' | 'MOVIMIENTO' | 'FOTO';

/**
 * Correccion 10 / D-52: trazabilidad de una donacion para el administrador.
 * Para no saturar la vista: una linea por evento, filtros y el detalle
 * (explicacion completa, contraparte y FOTO) solo al expandir. Las fotos se
 * descargan unicamente cuando se abre su evento.
 */
@Component({
  selector: 'lis-trazabilidad',
  standalone: true,
  imports: [FotoComponent],
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal-panel" role="dialog" aria-label="Trazabilidad" (click)="$event.stopPropagation()">
        <header class="modal-cabecera">
          <div>
            <strong>Trazabilidad &middot; Donación #{{ ofertaId() }}</strong>
            @if (datos(); as d) { <span class="dato"> &mdash; {{ d.oferta.producto }}</span> }
          </div>
          <button type="button" class="visor-cerrar oscuro" aria-label="Cerrar" (click)="cerrar.emit()">&times;</button>
        </header>

        @if (error()) { <div class="aviso error">{{ error() }}</div> }
        @if (!datos() && !error()) { <p class="vacio">Cargando...</p> }

        @if (datos(); as d) {
          <p class="dato" style="margin:0 0 .4rem">
            {{ d.oferta.categoria }} &middot; {{ d.oferta.cantidad }} u. &middot; <strong>{{ legible(d.oferta.estado) }}</strong>
            @if (d.oferta.donador; as dn) { &middot; donador {{ dn.nombre }} ({{ dn.email }}) }
            @if (d.oferta.ofertaOrigenId) { &middot; generada por faltante de la #{{ d.oferta.ofertaOrigenId }} }
          </p>

          @if (d.asignaciones.length) {
            <div class="fila" style="gap:.35rem; margin-bottom:.4rem">
              @for (a of d.asignaciones; track a.id) {
                <span class="etiqueta gris" title="{{ a.estudiante ?? '' }}">
                  #{{ a.id }} {{ legible(a.estado) }} &rarr; petición #{{ a.peticionId }}
                </span>
              }
              @for (x of d.derivadas; track x.id) {
                <span class="etiqueta ambar">derivada #{{ x.id }} ({{ x.cantidad }} u.)</span>
              }
            </div>
          }

          <div class="fila" style="margin-bottom:.6rem">
            @for (f of filtros; track f.valor) {
              <button class="pequeno" [class.secundario]="filtro() !== f.valor" (click)="filtro.set(f.valor)">
                {{ f.texto }} ({{ cuenta(f.valor) }})
              </button>
            }
          </div>

          <ol class="linea-tiempo">
            @for (e of visibles(); track e.id) {
              <li class="evento" [class.mov]="e.clase === 'MOVIMIENTO'">
                <button type="button" class="evento-fila" (click)="alternar(e.id)" [attr.aria-expanded]="abierto() === e.id">
                  <span class="evento-fecha">{{ f(e.fecha) }}</span>
                  <span class="evento-titulo">
                    {{ titulo(e) }}
                    @if (e.evidenciaId) { <span title="Tiene foto">&#128247;</span> }
                  </span>
                  <span class="evento-meta">{{ e.referencia }} &middot; {{ e.actor }}</span>
                </button>
                @if (abierto() === e.id) {
                  <div class="evento-detalle">
                    @if (e.explicacion) { <p style="margin:0 0 .3rem">{{ e.explicacion }}</p> }
                    @if (e.contraparte) {
                      <p class="dato" style="margin:0 0 .3rem">
                        {{ e.tipoMovimiento === 'RECEPCION' ? 'Entregó' : 'Recibió' }}: <strong>{{ e.contraparte }}</strong>
                        @if (e.cantidad) { &middot; {{ e.cantidad }} u. }
                      </p>
                    }
                    @if (e.evidenciaId) {
                      <div class="evento-foto"><lis-foto [evidenciaId]="e.evidenciaId" [alt]="titulo(e)" /></div>
                    }
                    @if (!e.explicacion && !e.contraparte && !e.evidenciaId) { <p class="dato" style="margin:0">Sin detalle adicional.</p> }
                  </div>
                }
              </li>
            } @empty { <li class="vacio">No hay eventos con este filtro.</li> }
          </ol>

          @if (d.oferta.fotoId) {
            <details style="margin-top:.6rem">
              <summary class="dato">Foto de la publicación</summary>
              <div class="evento-foto"><lis-foto [evidenciaId]="d.oferta.fotoId" [alt]="d.oferta.producto" /></div>
            </details>
          }
        }
      </section>
    </div>
  `,
})
export class TrazabilidadComponent {
  private api = inject(ApiService);

  ofertaId = input.required<number>();
  cerrar = output<void>();

  datos = signal<Trazabilidad | null>(null);
  error = signal<string | null>(null);
  filtro = signal<Filtro>('TODO');
  abierto = signal<string | null>(null);
  f = fecha;
  legible = estadoLegible;

  filtros: { valor: Filtro; texto: string }[] = [
    { valor: 'TODO', texto: 'Todo' },
    { valor: 'ESTADO', texto: 'Cambios de estado' },
    { valor: 'MOVIMIENTO', texto: 'Movimientos físicos' },
    { valor: 'FOTO', texto: 'Con foto' },
  ];

  visibles = computed(() => (this.datos()?.eventos ?? []).filter((e) => this.pasa(e, this.filtro())));

  constructor() {
    effect((alLimpiar) => {
      const id = this.ofertaId();
      this.datos.set(null);
      this.error.set(null);
      this.abierto.set(null);
      const sub = this.api.trazabilidad(id).subscribe({
        next: (d) => this.datos.set(d),
        error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar la trazabilidad.')),
      });
      alLimpiar(() => sub.unsubscribe());
    });
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    // Si hay una foto ampliada abierta, Escape cierra solo la foto.
    if (document.querySelector('.visor-foto')) return;
    this.cerrar.emit();
  }

  private pasa(e: EventoTrazabilidad, f: Filtro): boolean {
    if (f === 'ESTADO') return e.clase === 'ESTADO';
    if (f === 'MOVIMIENTO') return e.clase === 'MOVIMIENTO';
    if (f === 'FOTO') return !!e.evidenciaId;
    return true;
  }

  cuenta(f: Filtro): number {
    return (this.datos()?.eventos ?? []).filter((e) => this.pasa(e, f)).length;
  }

  alternar(id: string): void {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  titulo(e: EventoTrazabilidad): string {
    if (e.clase === 'MOVIMIENTO') {
      const tipo = { RECEPCION: 'Recepción física', ENTREGA: 'Entrega al estudiante', DEVOLUCION: 'Devolución al donador' }[e.tipoMovimiento ?? ''] ?? e.tipoMovimiento;
      return `${tipo}${e.cantidad ? ` · ${e.cantidad} u.` : ''}`;
    }
    return e.estadoAnterior && e.estadoAnterior !== e.estadoNuevo
      ? `${e.estadoAnterior} → ${e.estadoNuevo}`
      : `${e.estadoNuevo}`;
  }
}
