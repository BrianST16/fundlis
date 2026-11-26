import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FotoComponent } from '../compartido/foto.component';
import { SeguimientoComponent } from '../compartido/seguimiento.component';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import { Categoria, ESTADOS_CONSERVACION, FotoEnviable, MiAsignacion, MiPlazo, OfertaCatalogo, PropuestaLocal } from '../core/modelos';
import { fecha, leerComoFoto, mensajeError } from '../core/utilidades';

@Component({
  selector: 'lis-mis-ofertas',
  standalone: true,
  imports: [CommonModule, FotoComponent, SeguimientoComponent, PaginadorComponent],
  template: `
    <h1>Mis donaciones</h1>
    <p class="subtitulo">
      Publica lo que quieres donar. Al aprobarse, aparece en el catálogo sin tus datos.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (propuestasPendientes().length) {
      <h2>El LIS quiere quedarse con tu donación ({{ propuestasPendientes().length }})</h2>
      @for (p of propuestasPendientes(); track p.id) {
        <div class="tarjeta destacada">
          @if (p.fotoId) { <lis-foto [evidenciaId]="p.fotoId" [alt]="p.producto" /> }
          <strong>{{ p.producto }}</strong> <span class="etiqueta gris">{{ p.cantidad }} u.</span>
          <p style="margin:.5rem 0">
            El LIS propone quedarse con esta donación. <strong>Motivo:</strong> {{ p.motivo }}
          </p>
          <p class="dato">
            Responde hasta el <strong>{{ p.limite }}</strong>. Si no aceptas, se te devolverá.
          </p>
          <div class="fila" style="margin-top:.5rem">
            <button class="pequeno" [disabled]="respondiendo()" (click)="responder(p, true)">Acepto que quede para el LIS</button>
            <button class="peligro pequeno" [disabled]="respondiendo()" (click)="responder(p, false)">No, prefiero que me la devuelvan</button>
          </div>
        </div>
      }
    }

    <div class="tarjeta">
      <strong>Nueva donación</strong>

      <label>Categoría</label>
      <select [value]="categoriaId()" (change)="categoriaId.set($any($event.target).value)">
        <option value="">Selecciona una categoría</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>

      <label>Producto</label>
      <input
        [value]="nombre()"
        (input)="nombre.set($any($event.target).value)"
        placeholder="Ejemplo: calculadora científica Casio fx-570"
      />

      <label>Descripción y estado del producto</label>
      <textarea
        [value]="descripcion()"
        (input)="descripcion.set($any($event.target).value)"
        placeholder="Describe el estado, si incluye accesorios, etc."
      ></textarea>

      <label>Cantidad</label>
      <input
        type="number"
        min="1"
        [value]="cantidad()"
        (input)="cantidad.set($any($event.target).value)"
      />

      <label>Estado de conservación</label>
      <select [value]="conservacion()" (change)="conservacion.set($any($event.target).value)">
        @for (e of estados; track e.valor) { <option [value]="e.valor">{{ e.texto }}</option> }
      </select>

      @if (categoriaElegida()?.medidaNombre; as medida) {
        <label>{{ medida }} ({{ categoriaElegida()!.medidaUnidad }})</label>
        <input type="number" [min]="categoriaElegida()!.medidaMin ?? 0" [max]="categoriaElegida()!.medidaMax ?? 0"
               [value]="medida_()" (input)="medida_.set($any($event.target).value)" />
      }

      <label>Fotografía del producto (opcional)</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" (change)="elegirFoto($event)" />
      @if (foto()) { <p class="dato">Imagen lista: {{ foto()!.nombreOriginal }}</p> }

      <div class="fila" style="margin-top:.85rem">
        <button [disabled]="!puedeCrear() || enviando()" (click)="crear()">
          {{ enviando() ? 'Publicando...' : 'Publicar donación' }}
        </button>
      </div>
    </div>

    <h2 #tHistorial>Historial ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">Todavía no has publicado donaciones.</p>
    }
    <div class="rejilla">
      @for (o of pagHistorial.visibles(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <lis-foto [evidenciaId]="o.fotoId" [alt]="o.nombreProducto" />
          }
          <div class="fila">
            <span
              class="etiqueta"
              [class.ambar]="o.estado === 'PENDIENTE_APROBACION'"
              [class.roja]="o.estado === 'RECHAZADA'"
              [class.gris]="o.estado === 'CANCELADA' || o.estado === 'CERRADA'"
            >{{ legible(o.estado) }}</span>
            <span class="etiqueta gris">{{ o.categoria.nombre }}</span>
          </div>
          <h3 style="margin:.5rem 0 .25rem; font-size:1rem">{{ o.nombreProducto }}</h3>
          <p class="dato">{{ o.descripcion }}</p>
          <p class="dato">
            Conservación: <strong>{{ o.estadoConservacionTexto }}</strong>
            @if (o.medidaNombre) { &middot; {{ o.medidaNombre }} <strong>{{ o.medida }}</strong> }
          </p>

          @if (o.saldo; as s) {
            <p class="dato">
              Ofertadas <strong>{{ s.ofertada }}</strong> &middot;
              comprometidas <strong>{{ s.comprometida }}</strong> &middot;
              entregadas <strong>{{ s.entregada }}</strong> &middot;
              disponibles <strong>{{ s.disponible }}</strong>
            </p>
          }
          @if (o.motivoRechazo) {
            <p class="dato">Motivo del rechazo: <strong>{{ o.motivoRechazo }}</strong></p>
          }
          <p class="dato">#{{ o.id }} &middot; {{ f(o.publicadaEn) }}</p>
          <!-- Seguimiento de cada entrega comprometida (antes "Mis movimientos"). -->
          <lis-seguimiento [asignaciones]="asignacionesDe(o.id)" [plazos]="plazos()" />

          <!-- D-64 (C3): solo si el servidor lo permitiria (sin ninguna asignacion). -->
          @if (o.puedeCancelar) {
            <button class="peligro pequeno" (click)="cancelar(o)">Cancelar</button>
          }
        </div>
      }
    </div>
    <lis-paginador [control]="pagHistorial" [destino]="tHistorial" />
  `,
})
export class MisOfertasComponent implements OnInit {
  api = inject(ApiService);

  categorias = signal<Categoria[]>([]);
  ofertas = signal<OfertaCatalogo[]>([]);
  pagHistorial = new Paginado(this.ofertas, 15);
  categoriaId = signal('');
  nombre = signal('');
  descripcion = signal('');
  cantidad = signal('1');
  foto = signal<FotoEnviable | null>(null);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  enviando = signal(false);
  conservacion = signal('3');
  medida_ = signal('');
  estados = ESTADOS_CONSERVACION;
  f = fecha;

  categoriaElegida(): Categoria | undefined {
    return this.categorias().find((c) => String(c.id) === String(this.categoriaId()));
  }

  ngOnInit(): void {
    this.api.categorias().subscribe({ next: (c) => this.categorias.set(c) });
    this.cargar();
  }

  private cargar(): void {
    this.api.misOfertas().subscribe({
      next: (o) => this.ofertas.set(o),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.misAsignaciones().subscribe({
      next: (a) => this.asignaciones.set(a),
      error: () => this.asignaciones.set([]),
    });
    this.api.misPlazos().subscribe({
      next: (l) => this.plazos.set(new Map(l.map((p) => [p.asignacionId, p]))),
      error: () => this.plazos.set(new Map()), // no debe ocultar la lista principal
    });
    this.api.misPropuestasLocal().subscribe({
      next: (p) => this.propuestas.set(p),
      error: () => this.propuestas.set([]),
    });
  }

  /** Asignaciones propias y sus plazos (dias habiles), para el seguimiento. */
  asignaciones = signal<MiAsignacion[]>([]);
  plazos = signal<Map<number, MiPlazo>>(new Map());

  asignacionesDe(ofertaId: number): MiAsignacion[] {
    return this.asignaciones().filter((a) => a.ofertaId === ofertaId);
  }

  // --- D-50 / correccion 8: el donador decide si su donacion queda para el LIS ---
  propuestas = signal<PropuestaLocal[]>([]);
  respondiendo = signal(false);

  propuestasPendientes(): PropuestaLocal[] {
    return this.propuestas().filter((p) => p.estado === 'PROPUESTO_DONADOR');
  }

  responder(p: PropuestaLocal, acepta: boolean): void {
    let motivo: string | undefined;
    if (acepta) {
      if (!confirm(`Confirmas que "${p.producto}" quede como donativo del LIS?`)) return;
    } else {
      const m = prompt('Opcional: cuentanos por que prefieres que te la devuelvan.');
      if (m === null) return; // cancelo el dialogo
      motivo = m.trim() || undefined;
    }
    this.respondiendo.set(true);
    this.api.responderPropuestaLocal(p.id, acepta, motivo).subscribe({
      next: () => {
        this.mensaje.set(
          acepta
            ? `Gracias: "${p.producto}" queda como donativo del LIS.`
            : `Registramos tu respuesta. El LIS se comunicará contigo para devolverte "${p.producto}".`,
        );
        this.error.set(null);
        this.respondiendo.set(false);
        this.cargar();
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.respondiendo.set(false);
      },
    });
  }

  async elegirFoto(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    try {
      this.foto.set(await leerComoFoto(archivo));
      this.error.set(null);
    } catch (e: any) {
      this.foto.set(null);
      this.error.set(e.message);
    }
  }

  puedeCrear(): boolean {
    return (
      !!this.categoriaId() &&
      this.nombre().trim().length >= 3 &&
      this.descripcion().trim().length >= 10 &&
      Number(this.cantidad()) >= 1 &&
      (!this.categoriaElegida()?.medidaNombre || this.medida_() !== '')
    );
  }

  crear(): void {
    this.enviando.set(true);
    this.error.set(null);
    this.mensaje.set(null);

    const publicar = (fotoId?: number) =>
      this.api
        .crearOferta({
          categoriaId: Number(this.categoriaId()),
          nombreProducto: this.nombre().trim(),
          descripcion: this.descripcion().trim(),
          cantidad: Number(this.cantidad()),
          fotoId,
          estadoConservacion: Number(this.conservacion()),
          medida: this.categoriaElegida()?.medidaNombre ? Number(this.medida_()) : null,
        })
        .subscribe({
          next: () => {
            this.mensaje.set('Donación publicada. Queda pendiente de aprobación del LIS.');
            this.nombre.set('');
            this.descripcion.set('');
            this.cantidad.set('1');
            this.categoriaId.set('');
            this.foto.set(null);
            this.enviando.set(false);
            this.cargar();
          },
          error: (e) => {
            this.error.set(mensajeError(e, 'No se pudo publicar la donación.'));
            this.enviando.set(false);
          },
        });

    const imagen = this.foto();
    if (imagen) {
      this.api.subirFoto(imagen).subscribe({
        next: (r) => publicar(r.id),
        error: (e) => {
          this.error.set(mensajeError(e, 'No se pudo subir la fotografía.'));
          this.enviando.set(false);
        },
      });
    } else {
      publicar();
    }
  }

  cancelar(o: OfertaCatalogo): void {
    const motivo = prompt('Motivo de la cancelación (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarOferta(o.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Donación #${o.id} cancelada.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cancelar.')),
    });
  }

  legible(estado?: string): string {
    const mapa: Record<string, string> = {
      PENDIENTE_APROBACION: 'Pendiente de aprobación',
      APROBADA: 'Aprobada',
      RECHAZADA: 'Rechazada',
      CANCELADA: 'Cancelada',
      CERRADA: 'Completada',
    };
    return mapa[estado ?? ''] ?? estado ?? '-';
  }
}
