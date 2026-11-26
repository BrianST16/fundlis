import { Component, Signal, WritableSignal, computed, input, linkedSignal } from '@angular/core';

/**
 * Paginacion en el cliente para listas ya cargadas: evita mostrar listas
 * gigantes cuando hay mas contenido debajo.
 *
 *   pag = new Paginado(this.ofertas, 15);
 *   @for (o of pag.visibles(); ...) ...
 *   <lis-paginador [control]="pag" [destino]="titulo" />
 *
 * Si la lista cambia (p. ej. se aprueba un elemento y se recarga), se
 * conserva la hoja actual mientras exista; reiniciar() vuelve a la 1
 * (usar al cambiar un filtro o una busqueda).
 */
export class Paginado<T> {
  readonly pagina: WritableSignal<number>;
  readonly totalElementos: Signal<number>;
  readonly totalPaginas: Signal<number>;
  readonly visibles: Signal<T[]>;

  constructor(
    fuente: Signal<T[]>,
    readonly tamano: number,
  ) {
    this.pagina = linkedSignal<T[], number>({
      source: fuente,
      computation: (lista, previo) => Math.min(previo?.value ?? 1, paginas(lista.length, tamano)),
    });
    this.totalElementos = computed(() => fuente().length);
    this.totalPaginas = computed(() => paginas(fuente().length, tamano));
    this.visibles = computed(() => {
      const desde = (this.pagina() - 1) * tamano;
      return fuente().slice(desde, desde + tamano);
    });
  }

  ir(p: number): void {
    this.pagina.set(Math.min(Math.max(1, p), this.totalPaginas()));
  }

  reiniciar(): void {
    this.pagina.set(1);
  }
}

function paginas(n: number, tamano: number): number {
  return Math.max(1, Math.ceil(n / tamano));
}

/** Controles "‹ 1 2 3 … 9 ›". No se muestra si todo cabe en una hoja. */
@Component({
  selector: 'lis-paginador',
  standalone: true,
  template: `
    @if (control().totalPaginas() > 1) {
      <nav class="paginador" aria-label="Páginas">
        <button class="secundario pequeno" [disabled]="control().pagina() === 1"
                (click)="ir(control().pagina() - 1)" aria-label="Hoja anterior">&lsaquo;</button>
        @for (p of numeros(); track $index) {
          @if (p === 0) {
            <span class="dato">&hellip;</span>
          } @else {
            <button class="pequeno" [class.secundario]="p !== control().pagina()"
                    [attr.aria-current]="p === control().pagina() ? 'page' : null" (click)="ir(p)">{{ p }}</button>
          }
        }
        <button class="secundario pequeno" [disabled]="control().pagina() === control().totalPaginas()"
                (click)="ir(control().pagina() + 1)" aria-label="Hoja siguiente">&rsaquo;</button>
        <span class="dato">{{ desde() }}&ndash;{{ hasta() }} de {{ control().totalElementos() }}</span>
      </nav>
    }
  `,
})
export class PaginadorComponent {
  control = input.required<Paginado<unknown>>();
  /** Elemento al que se desplaza la vista al cambiar de hoja (p. ej. el titulo de la lista). */
  destino = input<HTMLElement | null>(null);

  desde = computed(() => (this.control().pagina() - 1) * this.control().tamano + 1);
  hasta = computed(() => Math.min(this.control().pagina() * this.control().tamano, this.control().totalElementos()));

  /** Primera, ultima, la actual y sus vecinas; 0 = puntos suspensivos. */
  numeros = computed(() => {
    const total = this.control().totalPaginas();
    const actual = this.control().pagina();
    const salida: number[] = [];
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || Math.abs(p - actual) <= 1) salida.push(p);
      else if (salida[salida.length - 1] !== 0) salida.push(0);
    }
    return salida;
  });

  ir(p: number): void {
    this.control().ir(p);
    const d = this.destino();
    if (d && d.getBoundingClientRect().top < 0) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
