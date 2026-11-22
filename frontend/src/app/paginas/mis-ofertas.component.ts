import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Categoria, ESTADOS_CONSERVACION, FotoEnviable, OfertaCatalogo } from '../core/modelos';
import { fecha, leerComoFoto, mensajeError } from '../core/utilidades';

@Component({
  selector: 'lis-mis-ofertas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Mis donaciones</h1>
    <p class="subtitulo">
      Publica lo que quieres donar. El personal del LIS revisa cada publicacion y, una vez
      aprobada, aparece de forma anonima en el catalogo.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <div class="tarjeta">
      <strong>Nueva donacion</strong>

      <label>Categoria</label>
      <select [value]="categoriaId()" (change)="categoriaId.set($any($event.target).value)">
        <option value="">Selecciona una categoria</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>

      <label>Producto</label>
      <input
        [value]="nombre()"
        (input)="nombre.set($any($event.target).value)"
        placeholder="Ejemplo: calculadora cientifica Casio fx-570"
      />

      <label>Descripcion y estado del producto</label>
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

      <label>Estado de conservacion (se usa para encontrar peticiones compatibles)</label>
      <select [value]="conservacion()" (change)="conservacion.set($any($event.target).value)">
        @for (e of estados; track e.valor) { <option [value]="e.valor">{{ e.texto }}</option> }
      </select>

      @if (categoriaElegida()?.medidaNombre; as medida) {
        <label>{{ medida }} ({{ categoriaElegida()!.medidaUnidad }})</label>
        <input type="number" [min]="categoriaElegida()!.medidaMin ?? 0" [max]="categoriaElegida()!.medidaMax ?? 0"
               [value]="medida_()" (input)="medida_.set($any($event.target).value)" />
      }

      <label>Fotografia del producto (opcional)</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" (change)="elegirFoto($event)" />
      @if (foto()) { <p class="dato">Imagen lista: {{ foto()!.nombreOriginal }}</p> }

      <div class="fila" style="margin-top:.85rem">
        <button [disabled]="!puedeCrear() || enviando()" (click)="crear()">
          {{ enviando() ? 'Publicando...' : 'Publicar donacion' }}
        </button>
      </div>
    </div>

    <h2>Historial ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">Todavia no has publicado donaciones.</p>
    }
    <div class="rejilla">
      @for (o of ofertas(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <img class="foto" [src]="api.urlFoto(o.fotoId)" [alt]="o.nombreProducto" />
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
            Estado: <strong>{{ o.estadoConservacionTexto }}</strong>
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

          @if (o.estado === 'PENDIENTE_APROBACION' || o.estado === 'APROBADA') {
            <button class="peligro pequeno" (click)="cancelar(o)">Cancelar</button>
          }
        </div>
      }
    </div>
  `,
})
export class MisOfertasComponent implements OnInit {
  api = inject(ApiService);

  categorias = signal<Categoria[]>([]);
  ofertas = signal<OfertaCatalogo[]>([]);
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
            this.mensaje.set('Donacion publicada. Queda pendiente de aprobacion del LIS.');
            this.nombre.set('');
            this.descripcion.set('');
            this.cantidad.set('1');
            this.categoriaId.set('');
            this.foto.set(null);
            this.enviando.set(false);
            this.cargar();
          },
          error: (e) => {
            this.error.set(mensajeError(e, 'No se pudo publicar la donacion.'));
            this.enviando.set(false);
          },
        });

    const imagen = this.foto();
    if (imagen) {
      this.api.subirFoto(imagen).subscribe({
        next: (r) => publicar(r.id),
        error: (e) => {
          this.error.set(mensajeError(e, 'No se pudo subir la fotografia.'));
          this.enviando.set(false);
        },
      });
    } else {
      publicar();
    }
  }

  cancelar(o: OfertaCatalogo): void {
    const motivo = prompt('Motivo de la cancelacion (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarOferta(o.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Donacion #${o.id} cancelada.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cancelar.')),
    });
  }

  legible(estado?: string): string {
    const mapa: Record<string, string> = {
      PENDIENTE_APROBACION: 'Pendiente de aprobacion',
      APROBADA: 'Aprobada',
      RECHAZADA: 'Rechazada',
      CANCELADA: 'Cancelada',
      CERRADA: 'Cerrada',
    };
    return mapa[estado ?? ''] ?? estado ?? '-';
  }
}
