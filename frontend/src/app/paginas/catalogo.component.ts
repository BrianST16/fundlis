import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FotoComponent } from '../compartido/foto.component';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Categoria, OfertaCatalogo, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Catalogo anonimo. Es la unica pantalla accesible sin cuenta: muestra
 *  productos y necesidades sin revelar quien los publico. */
@Component({
  selector: 'lis-catalogo',
  standalone: true,
  imports: [CommonModule, FotoComponent, PaginadorComponent],
  template: `
    <h1>Catálogo</h1>
    <p class="subtitulo">
      Donaciones disponibles y necesidades registradas, sin datos de quien las publica.
    </p>

    @if (!auth.autenticado()) {
      <p class="dato">
        Para donar o pedir, inicia sesión desde el menú.
      </p>
    }

    @if (error()) {
      <div class="aviso error">{{ error() }}</div>
    }

    <div class="fila" style="margin: 1.25rem 0 .5rem">
      <label style="margin:0">Filtrar por categoría</label>
      <select style="max-width:280px" (change)="filtrar($any($event.target).value)">
        <option value="">Todas</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>
    </div>

    <h2 #tOfertas>Donaciones disponibles ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">No hay donaciones disponibles en este momento.</p>
    }
    <div class="rejilla">
      @for (o of pagOfertas.visibles(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <lis-foto [evidenciaId]="o.fotoId" [alt]="o.nombreProducto" />
          }
          <span class="etiqueta">{{ o.categoria.nombre }}</span>
          <h3 style="margin:.5rem 0 .25rem; font-size:1rem">{{ o.nombreProducto }}</h3>
          <p class="dato">{{ o.descripcion }}</p>
          <p class="dato">
            <strong>{{ o.cantidadDisponible }}</strong> de {{ o.cantidadOfertada }} disponibles &middot; {{ f(o.publicadaEn) }}
          </p>
        </div>
      }
    </div>

    <lis-paginador [control]="pagOfertas" [destino]="tOfertas" />

    <h2 #tPeticiones>Necesidades registradas ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">No hay necesidades aprobadas en este momento.</p>
    }
    <div class="rejilla">
      @for (p of pagPeticiones.visibles(); track p.id) {
        <div class="tarjeta">
          <span class="etiqueta gris">{{ p.categoria.nombre }}</span>
          <p style="margin:.5rem 0 .25rem">{{ p.descripcion }}</p>
          <p class="dato">{{ f(p.publicadaEn) }}</p>
        </div>
      }
    </div>
    <lis-paginador [control]="pagPeticiones" [destino]="tPeticiones" />
  `,
})
export class CatalogoComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  categorias = signal<Categoria[]>([]);
  ofertas = signal<OfertaCatalogo[]>([]);
  peticiones = signal<PeticionVista[]>([]);
  pagOfertas = new Paginado(this.ofertas, 12);
  pagPeticiones = new Paginado(this.peticiones, 12);
  error = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.api.categorias().subscribe({
      next: (c) => this.categorias.set(c),
      error: (e) => this.error.set(mensajeError(e, 'No se pudieron cargar las categorías.')),
    });
    this.cargar();
  }

  filtrar(valor: string): void {
    this.pagOfertas.reiniciar();
    this.pagPeticiones.reiniciar();
    this.cargar(valor ? Number(valor) : undefined);
  }

  private cargar(categoriaId?: number): void {
    this.api.catalogoOfertas(categoriaId).subscribe({
      next: (o) => this.ofertas.set(o),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el catálogo de donaciones.')),
    });
    this.api.catalogoPeticiones(categoriaId).subscribe({
      next: (p) => this.peticiones.set(p),
      error: () => this.peticiones.set([]),
    });
  }
}
