import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Categoria, OfertaCatalogo, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Catalogo anonimo. Es la unica pantalla accesible sin cuenta: muestra
 *  productos y necesidades sin revelar quien los publico. */
@Component({
  selector: 'lis-catalogo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Catalogo del LIS</h1>
    <p class="subtitulo">
      Donaciones disponibles y necesidades registradas. La informacion se muestra de forma
      anonima: ni los donadores ni los estudiantes aparecen identificados.
    </p>

    @if (!auth.autenticado()) {
      <div class="tarjeta">
        <strong>Inicia sesion con Google para participar</strong>
        <p class="dato">
          Con correo institucional &#64;udea.edu.co entras como estudiante y puedes registrar
          peticiones. Con cualquier otra cuenta de Google entras como donador y puedes publicar
          donaciones.
        </p>
        <div #botonGoogle></div>
        @if (auth.error()) {
          <div class="aviso error">{{ auth.error() }}</div>
        }
      </div>
    }

    @if (error()) {
      <div class="aviso error">{{ error() }}</div>
    }

    <div class="fila" style="margin: 1.25rem 0 .5rem">
      <label style="margin:0">Filtrar por categoria</label>
      <select style="max-width:280px" (change)="filtrar($any($event.target).value)">
        <option value="">Todas</option>
        @for (c of categorias(); track c.id) {
          <option [value]="c.id">{{ c.nombre }}</option>
        }
      </select>
    </div>

    <h2>Donaciones disponibles ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">No hay donaciones disponibles en este momento.</p>
    }
    <div class="rejilla">
      @for (o of ofertas(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <img class="foto" [src]="api.urlFoto(o.fotoId)" [alt]="o.nombreProducto" />
          }
          <span class="etiqueta">{{ o.categoria.nombre }}</span>
          <h3 style="margin:.5rem 0 .25rem; font-size:1rem">{{ o.nombreProducto }}</h3>
          <p class="dato">{{ o.descripcion }}</p>
          <p class="dato">
            <strong>{{ o.cantidadDisponible }}</strong> de {{ o.cantidadOfertada }} unidades sin
            asignar &middot; publicada el {{ f(o.publicadaEn) }}
          </p>
        </div>
      }
    </div>

    <h2>Necesidades registradas ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">No hay necesidades aprobadas en este momento.</p>
    }
    <div class="rejilla">
      @for (p of peticiones(); track p.id) {
        <div class="tarjeta">
          <span class="etiqueta gris">{{ p.categoria.nombre }}</span>
          <p style="margin:.5rem 0 .25rem">{{ p.descripcion }}</p>
          <p class="dato">Registrada el {{ f(p.publicadaEn) }}</p>
        </div>
      }
    </div>
  `,
})
export class CatalogoComponent implements OnInit, AfterViewInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  @ViewChild('botonGoogle') botonGoogle?: ElementRef<HTMLElement>;

  categorias = signal<Categoria[]>([]);
  ofertas = signal<OfertaCatalogo[]>([]);
  peticiones = signal<PeticionVista[]>([]);
  error = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.api.categorias().subscribe({
      next: (c) => this.categorias.set(c),
      error: (e) => this.error.set(mensajeError(e, 'No se pudieron cargar las categorias.')),
    });
    this.cargar();
  }

  ngAfterViewInit(): void {
    // El script de Google puede llegar despues del render.
    if (!this.auth.autenticado() && this.botonGoogle) {
      const intentar = (restantes: number) => {
        if (!this.botonGoogle) return;
        this.auth.iniciarBotonGoogle(this.botonGoogle.nativeElement);
        if (!this.botonGoogle.nativeElement.childElementCount && restantes > 0) {
          setTimeout(() => intentar(restantes - 1), 400);
        }
      };
      intentar(8);
    }
  }

  filtrar(valor: string): void {
    this.cargar(valor ? Number(valor) : undefined);
  }

  private cargar(categoriaId?: number): void {
    this.api.catalogoOfertas(categoriaId).subscribe({
      next: (o) => this.ofertas.set(o),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el catalogo de donaciones.')),
    });
    this.api.catalogoPeticiones(categoriaId).subscribe({
      next: (p) => this.peticiones.set(p),
      error: () => this.peticiones.set([]),
    });
  }
}
