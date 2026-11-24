import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Categoria, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

@Component({
  selector: 'lis-mis-peticiones',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h1>Mis peticiones</h1>
    <p class="subtitulo">
      Registra lo que necesitas. El personal del LIS revisa cada peticion antes de publicarla
      de forma anonima en el catalogo.
    </p>

    @if (cupo(); as c) {
      <div class="aviso" [class.info]="c.usadas < c.maximo" [class.error]="c.usadas >= c.maximo">
        Tienes {{ c.usadas }} de {{ c.maximo }} peticiones abiertas.
        @if (c.usadas >= c.maximo) {
          Cierra o cancela una para poder crear otra.
        }
      </div>
    }

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (caracterizada() === false) {
      <div class="aviso error">
        La caracterizacion es obligatoria para registrar peticiones: de ella sale tu prioridad.
        <a routerLink="/caracterizacion">Completar mi caracterizacion</a>
      </div>
    }

    <div class="tarjeta">
      <strong>Nueva peticion</strong>
      <label>Categoria</label>
      <select [value]="categoriaId()" (change)="categoriaId.set($any($event.target).value)">
        <option value="">Selecciona una categoria</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>

      <label>Que necesitas y para que</label>
      <textarea
        [value]="descripcion()"
        (input)="descripcion.set($any($event.target).value)"
        placeholder="Ejemplo: necesito una calculadora cientifica para el curso de calculo."
      ></textarea>

      <div class="fila" style="margin-top:.75rem">
        <button [disabled]="!puedeCrear() || enviando()" (click)="crear()">
          {{ enviando() ? 'Enviando...' : 'Registrar peticion' }}
        </button>
        <a routerLink="/caracterizacion" class="dato">Revisar mi caracterizacion</a>
      </div>
    </div>

    <h2>Historial ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">Todavia no has registrado peticiones.</p>
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
        @if (p.asignacionVigente; as a) {
          <p class="dato">
            Asignacion #{{ a.id }}: {{ a.cantidadAsignada }} unidades en estado
            <strong>{{ legible(a.estado) }}</strong>
          </p>
        }

        @if (p.estado === 'PENDIENTE_APROBACION' || p.estado === 'APROBADA') {
          <div class="fila" style="margin-top:.6rem">
            <button class="peligro pequeno" (click)="cancelar(p)">Cancelar peticion</button>
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
          this.mensaje.set('Peticion registrada. Queda pendiente de aprobacion del LIS.');
          this.descripcion.set('');
          this.categoriaId.set('');
          this.enviando.set(false);
          this.cargar();
        },
        error: (e) => {
          this.error.set(mensajeError(e, 'No se pudo registrar la peticion.'));
          this.enviando.set(false);
        },
      });
  }

  cancelar(p: PeticionVista): void {
    const motivo = prompt('Motivo de la cancelacion (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarPeticion(p.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Peticion #${p.id} cancelada.`);
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
      PENDIENTE_APROBACION: 'Pendiente de aprobacion',
      APROBADA: 'Aprobada',
      RECHAZADA: 'Rechazada',
      CANCELADA: 'Cancelada',
      CERRADA_ENTREGA: 'Cerrada por entrega',
      CERRADA_INCUMPLIMIENTO: 'Cerrada por incumplimiento',
      ASIGNADO: 'Asignado',
      EN_CUSTODIA: 'En custodia del LIS',
      ENTREGADO: 'Entregado',
      DEVOLUCION: 'En devolucion',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado ?? ''] ?? estado ?? '-';
  }
}
