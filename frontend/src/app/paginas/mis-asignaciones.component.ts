import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { MiAsignacion, MiPlazo } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Lo que le concierne al usuario, sea donador o estudiante. */
@Component({
  selector: 'lis-mis-asignaciones',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Mis movimientos</h1>
    <p class="subtitulo">
      Estado de las donaciones y peticiones tuyas que ya fueron emparejadas por el LIS.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }

    @if (!lista().length) {
      <p class="vacio">Todavia no tienes asignaciones.</p>
    }

    @for (a of lista(); track a.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta" [class.gris]="a.estado === 'CANCELADO'">{{ legible(a.estado) }}</span>
          <span class="etiqueta gris">{{ a.miPapel === 'DONADOR' ? 'Donas' : 'Recibes' }}</span>
          <strong>{{ a.producto }}</strong>
        </div>
        <p class="dato">
          {{ a.cantidadAsignada }} unidades &middot; {{ a.categoria }} &middot;
          asignada el {{ f(a.asignadaEn) }}
        </p>
        <p class="dato">{{ siguientePaso(a) }}</p>
        @if (plazos().get(a.id); as p) {
          <p class="dato">
            <span class="etiqueta"
                  [class.roja]="p.estado === 'VENCIDO'"
                  [class.ambar]="p.estado === 'POR_VENCER'">
              {{ p.estado === 'VENCIDO' ? 'Plazo vencido' : p.estado === 'POR_VENCER' ? 'Plazo por vencer' : 'En plazo' }}
            </span>
            Fecha limite: <strong>{{ p.fechaLimite }}</strong> (dias habiles)
          </p>
        }
        @if (a.motivoCierre) {
          <p class="dato">Cierre: <strong>{{ a.motivoCierre }}</strong></p>
        }
      </div>
    }
  `,
})
export class MisAsignacionesComponent implements OnInit {
  private api = inject(ApiService);

  lista = signal<MiAsignacion[]>([]);
  /** Plazos propios en dias habiles (pilar B), por id de asignacion. */
  plazos = signal<Map<number, MiPlazo>>(new Map());
  error = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.api.misAsignaciones().subscribe({
      next: (a) => this.lista.set(a),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.misPlazos().subscribe({
      next: (l) => this.plazos.set(new Map(l.map((p) => [p.asignacionId, p]))),
      // Un fallo aqui no debe ocultar la lista principal.
      error: () => this.plazos.set(new Map()),
    });
  }

  siguientePaso(a: MiAsignacion): string {
    if (a.estado === 'ASIGNADO') {
      return a.miPapel === 'DONADOR'
        ? 'Debes llevar el producto al LIS para que lo reciban y lo registren.'
        : 'El donador debe llevar el producto al LIS. Te avisaran cuando puedas recogerlo.';
    }
    if (a.estado === 'EN_CUSTODIA') {
      return a.miPapel === 'ESTUDIANTE'
        ? 'El producto ya esta en el LIS: puedes ir a recogerlo.'
        : 'El producto ya fue recibido por el LIS.';
    }
    if (a.estado === 'ENTREGADO') {
      return `Entregado el ${fecha(a.entregadaEn)}.`;
    }
    if (a.estado === 'DEVOLUCION') {
      return 'El producto quedo destinado a devolucion al donador.';
    }
    return 'Este intento se cerro sin entrega.';
  }

  legible(estado: string): string {
    const mapa: Record<string, string> = {
      ASIGNADO: 'Asignado',
      EN_CUSTODIA: 'En custodia del LIS',
      ENTREGADO: 'Entregado',
      DEVOLUCION: 'En devolucion',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado] ?? estado;
  }
}
