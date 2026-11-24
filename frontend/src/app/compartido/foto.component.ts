import { Component, HostListener, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

/**
 * Fotografia de evidencia (producto, recepcion, entrega...).
 *
 * - Se descarga con HttpClient, para que el interceptor adjunte el token.
 *   Una etiqueta <img src="/api/evidencias/:id"> NO envia el token, y el
 *   backend solo sirve sin sesion las fotos de ofertas ya aprobadas: por eso
 *   antes las fotos se veian en el catalogo pero no en Aprobaciones ni en
 *   Mis donaciones.
 * - Clic en la imagen: se abre a pantalla completa. Se cierra con clic,
 *   con el boton x o con la tecla Escape.
 * - El permiso real lo decide el backend (EvidenciasService.puedeVer).
 */
@Component({
  selector: 'lis-foto',
  standalone: true,
  template: `
    @if (url(); as u) {
      <img
        class="foto ampliable"
        [src]="u"
        [alt]="alt()"
        title="Clic para ampliar"
        (click)="abrir()"
      />
    } @else {
      <div class="foto foto-vacia">{{ error() ? 'Imagen no disponible' : 'Cargando imagen...' }}</div>
    }

    @if (ampliada() && url()) {
      <div class="visor-foto" role="dialog" aria-label="Imagen ampliada" (click)="cerrar()">
        <button type="button" class="visor-cerrar" aria-label="Cerrar" (click)="cerrar()">&times;</button>
        <img [src]="url()" [alt]="alt()" (click)="$event.stopPropagation()" />
        @if (alt()) { <p class="visor-pie">{{ alt() }}</p> }
      </div>
    }
  `,
})
export class FotoComponent implements OnDestroy {
  private api = inject(ApiService);

  evidenciaId = input.required<number>();
  alt = input('');

  url = signal<string | null>(null);
  error = signal(false);
  ampliada = signal(false);

  constructor() {
    // Se vuelve a descargar si cambia el id; la URL anterior se libera.
    effect((alLimpiar) => {
      const id = this.evidenciaId();
      this.error.set(false);
      const sub = this.api.fotoBlob(id).subscribe({
        next: (blob) => {
          this.liberar();
          this.url.set(URL.createObjectURL(blob));
        },
        error: () => this.error.set(true),
      });
      alLimpiar(() => sub.unsubscribe());
    });
  }

  abrir(): void {
    this.ampliada.set(true);
  }

  cerrar(): void {
    this.ampliada.set(false);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    if (this.ampliada()) this.cerrar();
  }

  ngOnDestroy(): void {
    this.liberar();
  }

  private liberar(): void {
    const actual = this.url();
    if (actual) URL.revokeObjectURL(actual);
    this.url.set(null);
  }
}
