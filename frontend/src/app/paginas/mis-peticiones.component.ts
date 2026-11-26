import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeguimientoComponent } from '../compartido/seguimiento.component';
import { ApiService } from '../core/api.service';
import { Categoria, MiAsignacion, MiPlazo, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

@Component({
  selector: 'lis-mis-peticiones',
  standalone: true,
  imports: [CommonModule, RouterLink, SeguimientoComponent],
  template: `
    <h1>Mis peticiones</h1>
    <p class="subtitulo">
      Registra lo que necesitas. Al aprobarse, aparece en el catálogo sin tus datos.
    </p>

    @if (cupo(); as c) {
      <div class="aviso" [class.info]="c.usadas < c.maximo" [class.error]="c.usadas >= c.maximo">
        Tienes {{ c.usadas }} de {{ c.maximo }} peticiones abiertas.
        @if (c.usadas >= c.maximo) {
          Cancela una para crear otra.
        }
      </div>
    }

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (caracterizada() === false) {
      <div class="aviso error">
        Completa tu caracterización para registrar peticiones.
        <a routerLink="/caracterizacion">Completar mi caracterización</a>
      </div>
    }

    <div class="tarjeta">
      <strong>Nueva petición</strong>
      <label>Categoría</label>
      <select [value]="categoriaId()" (change)="categoriaId.set($any($event.target).value)">
        <option value="">Selecciona una categoría</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>

      <label>¿Qué necesitas y para qué?</label>
      <textarea
        [value]="descripcion()"
        (input)="descripcion.set($any($event.target).value)"
        placeholder="Ejemplo: necesito una calculadora científica para el curso de cálculo."
      ></textarea>

      <div class="fila" style="margin-top:.75rem">
        <button [disabled]="!puedeCrear() || enviando()" (click)="crear()">
          {{ enviando() ? 'Enviando...' : 'Registrar petición' }}
        </button>
        <a routerLink="/caracterizacion" class="dato">Revisar mi caracterización</a>
      </div>
    </div>

    <h2>Historial ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">Todavía no has registrado peticiones.</p>
    }
    @for (p of peticiones(); track p.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta" [class.gris]="esCerrada(p)" [class.ambar]="p.estado === 'PENDIENTE_APROBACION'" [class.roja]="p.estado === 'RECHAZADA'">
            {{ legible(p.estado) }}
          </span>
          <span class="etiqueta gris">{{ p.categoria.nombre }}</span>
          <span class="dato">#{{ p.id }} &middot; {{ f(p.publicadaEn) }}</span>
        </div>
        <p style="margin:.6rem 0 .25rem">{{ p.descripcion }}</p>

        @if (p.motivoRechazo) {
          <p class="dato">Motivo del rechazo: <strong>{{ p.motivoRechazo }}</strong></p>
        }
        @if (p.motivoCierre) {
          <p class="dato">Cierre: <strong>{{ p.motivoCierre }}</strong></p>
        }
        <!-- Seguimiento: asignacion vigente e intentos anteriores (antes "Mis movimientos"). -->
        <lis-seguimiento [asignaciones]="asignacionesDe(p.id)" [plazos]="plazos()" />

        @if (p.estado === 'PENDIENTE_APROBACION' || p.estado === 'APROBADA') {
          <div class="fila" style="margin-top:.6rem">
            <button class="peligro pequeno" (click)="cancelar(p)">Cancelar petición</button>
          </div>
        }
      </div>
    }
  `,
})
export class MisPeticionesComponent implements OnInit {
  private api = inject(ApiService);

  categorias = signal<Categoria[]>([]);
  peticiones = signal<PeticionVista[]>([]);
  cupo = signal<{ usadas: number; maximo: number } | null>(null);
  categoriaId = signal('');
  descripcion = signal('');
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  enviando = signal(false);
  f = fecha;
  /** null = aun no se sabe; el backend tambien lo exige (peticiones.service). */
  caracterizada = signal<boolean | null>(null);

  ngOnInit(): void {
    this.api.categorias().subscribe({ next: (c) => this.categorias.set(c) });
    this.api.miCaracterizacion().subscribe({
      next: (c) => this.caracterizada.set(!!c),
      error: () => this.caracterizada.set(null),
    });
    this.cargar();
  }

  private cargar(): void {
    this.api.misPeticiones().subscribe({
      next: (p) => this.peticiones.set(p),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.miCupo().subscribe({ next: (c) => this.cupo.set(c) });
    this.api.misAsignaciones().subscribe({
      next: (a) => this.asignaciones.set(a),
      error: () => this.asignaciones.set([]),
    });
    this.api.misPlazos().subscribe({
      next: (l) => this.plazos.set(new Map(l.map((x) => [x.asignacionId, x]))),
      error: () => this.plazos.set(new Map()), // no debe ocultar la lista principal
    });
  }

  /** Asignaciones propias y sus plazos (dias habiles), para el seguimiento. */
  asignaciones = signal<MiAsignacion[]>([]);
  plazos = signal<Map<number, MiPlazo>>(new Map());

  asignacionesDe(peticionId: number): MiAsignacion[] {
    return this.asignaciones().filter((a) => a.peticionId === peticionId);
  }

  puedeCrear(): boolean {
    const c = this.cupo();
    return this.caracterizada() !== false &&
      !!this.categoriaId() && this.descripcion().trim().length >= 10 &&
      (!c || c.usadas < c.maximo);
  }

  crear(): void {
    this.enviando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.api
      .crearPeticion({
        categoriaId: Number(this.categoriaId()),
        descripcion: this.descripcion().trim(),
      })
      .subscribe({
        next: () => {
          this.mensaje.set('Petición registrada. Queda pendiente de aprobación del LIS.');
          this.descripcion.set('');
          this.categoriaId.set('');
          this.enviando.set(false);
          this.cargar();
        },
        error: (e) => {
          this.error.set(mensajeError(e, 'No se pudo registrar la petición.'));
          this.enviando.set(false);
        },
      });
  }

  cancelar(p: PeticionVista): void {
    const motivo = prompt('Motivo de la cancelación (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarPeticion(p.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Petición #${p.id} cancelada.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cancelar.')),
    });
  }

  esCerrada(p: PeticionVista): boolean {
    return ['CANCELADA', 'CERRADA_ENTREGA', 'CERRADA_INCUMPLIMIENTO'].includes(p.estado ?? '');
  }

  legible(estado?: string): string {
    const mapa: Record<string, string> = {
      PENDIENTE_APROBACION: 'Pendiente de aprobación',
      APROBADA: 'Aprobada',
      RECHAZADA: 'Rechazada',
      CANCELADA: 'Cancelada',
      CERRADA_ENTREGA: 'Cerrada por entrega',
      CERRADA_INCUMPLIMIENTO: 'Cerrada por incumplimiento',
      ASIGNADO: 'Asignado',
      EN_CUSTODIA: 'En custodia del LIS',
      ENTREGADO: 'Entregado',
      DEVOLUCION: 'En devolución',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado ?? ''] ?? estado ?? '-';
  }
}
