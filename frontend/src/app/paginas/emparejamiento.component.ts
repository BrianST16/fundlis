import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { LoteFisico, OfertaCatalogo, ResultadoEmparejamiento } from '../core/modelos';
import { mensajeError } from '../core/utilidades';

/**
 * Emparejamiento en DOS FASES (D-41):
 *  A) busqueda de COMPATIBILIDAD con un KD-tree sobre atributos reales del
 *     producto (estado de conservacion, medida) dentro de la categoria;
 *  B) orden por PRIORIDAD socioeconomica (Sisben + caracterizacion +
 *     antiguedad), con los componentes a la vista. LOCAL siempre al final.
 * La decision la confirma el auxiliar.
 */
@Component({
  selector: 'lis-emparejamiento',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Emparejamiento</h1>
    <p class="subtitulo">
      Fase A: el KD-tree encuentra las peticiones <strong>compatibles</strong> con el producto.
      Fase B: se ordenan por <strong>prioridad</strong>. La asignacion la confirmas tu.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <div class="tarjeta">
      <div class="fila">
        <button class="pequeno" [class.secundario]="modo() !== 'OFERTA'" (click)="cambiarModo('OFERTA')">Desde una donacion</button>
        <button class="pequeno" [class.secundario]="modo() !== 'LOTE'" (click)="cambiarModo('LOTE')">
          Lotes en el LIS sin destino ({{ lotes().length }})
        </button>
      </div>
      @if (modo() === 'OFERTA') {
        <label>Donacion aprobada con unidades disponibles</label>
        <select [value]="seleccion()" (change)="elegir($any($event.target).value)">
          <option value="">Selecciona una donacion</option>
          @for (o of ofertas(); track o.id) {
            <option [value]="o.id">#{{ o.id }} — {{ o.nombreProducto }} ({{ o.cantidadDisponible }} disp.)</option>
          }
        </select>
      } @else {
        <label>Lote fisico sin destino (ya esta en el LIS)</label>
        <select [value]="seleccion()" (change)="elegir($any($event.target).value)">
          <option value="">Selecciona un lote</option>
          @for (l of lotes(); track l.id) {
            <option [value]="l.id">Lote #{{ l.id }} — {{ l.producto }} ({{ l.cantidad }} u.)</option>
          }
        </select>
      }
    </div>

    @if (cargando()) { <p class="vacio">Buscando candidatos...</p> }

    @if (resultado(); as r) {
      <div class="tarjeta">
        <strong>{{ r.oferta.nombreProducto }}</strong> <span class="etiqueta gris">{{ r.oferta.categoria }}</span>
        <p class="dato">
          Atributos del producto: estado <strong>{{ r.oferta.estadoConservacionTexto }}</strong>
          @if (r.oferta.medidaNombre) { &middot; {{ r.oferta.medidaNombre }} <strong>{{ r.oferta.medida ?? 'sin declarar' }}</strong> }
          &middot; {{ r.cantidadDisponible }} unidades {{ r.origen === 'LOTE' ? 'en el lote' : 'por asignar' }}
        </p>
        <p class="dato">
          <strong>Fase A — KD-tree:</strong> caja de busqueda sobre ({{ r.busqueda.dimensiones.join(', ') }}):
          min [{{ fmtCaja(r.busqueda.cajaMin) }}] &middot; max [{{ fmtCaja(r.busqueda.cajaMax) }}]
        </p>
        <p class="dato">
          {{ r.diagnostico.totalEnCategoria }} peticiones en la categoria &rarr;
          <strong>{{ r.diagnostico.compatibles }} compatibles</strong>, {{ r.diagnostico.incompatibles }} excluidas
          &middot; {{ r.diagnostico.nodosVisitados }} nodos visitados &middot; altura {{ r.diagnostico.alturaArbol }}
          &middot; construccion {{ r.diagnostico.msConstruccion }} ms, consulta {{ r.diagnostico.msConsulta }} ms
          @if (r.diagnostico.coincideConFiltroLineal) {
            <span class="etiqueta">verificado contra filtro lineal</span>
          } @else {
            <span class="etiqueta roja">discrepancia con filtro lineal</span>
          }
        </p>
        <p class="dato">
          <strong>Fase B — prioridad:</strong> P = {{ r.coeficientes.caracterizacion | number: '1.2-2' }}·C +
          {{ r.coeficientes.sisben | number: '1.2-2' }}·S + {{ r.coeficientes.antiguedad | number: '1.2-2' }}·A
          (A = dias desde la fecha original / {{ r.coeficientes.horizonteDias }}, maximo 1). {{ r.escalaPrioridad }}
        </p>
      </div>

      @if (!r.candidatos.length) {
        <p class="vacio">No hay peticiones compatibles disponibles. Puedes usar LOCAL (ultima opcion).</p>
      }

      @for (c of r.candidatos; track c.peticionId) {
        <div class="tarjeta">
          <div class="fila">
            <span class="etiqueta">#{{ c.posicion }}</span>
            <strong>{{ c.estudianteNombre }}</strong>
            <span class="dato">peticion #{{ c.peticionId }}</span>
            @if (c.grupoSisben) { <span class="etiqueta gris">Sisben {{ c.grupoSisben }} (solo admin)</span> }
          </div>
          <p style="margin:.4rem 0">{{ c.descripcionPeticion }}</p>
          <p class="dato">
            Requisitos: estado minimo {{ c.atributos.estadoMinimo }}
            @if (c.atributos.medidaMin !== null || c.atributos.medidaMax !== null) {
              &middot; medida {{ c.atributos.medidaMin ?? '—' }} a {{ c.atributos.medidaMax ?? '—' }}
            }
          </p>
          <table style="margin:.4rem 0">
            <thead><tr><th>Sisben (S)</th><th>Caracterizacion (C)</th><th>Antiguedad (A)</th><th>Prioridad total</th></tr></thead>
            <tbody><tr>
              <td>{{ c.prioridad.sisben | number: '1.3-3' }}</td>
              <td>{{ c.prioridad.caracterizacion | number: '1.3-3' }}</td>
              <td>{{ c.prioridad.antiguedad | number: '1.3-3' }}</td>
              <td><strong>{{ c.prioridad.total | number: '1.3-3' }}</strong></td>
            </tr></tbody>
          </table>
          @if (c.sinCaracterizacion) { <p class="dato">Sin caracterizacion registrada: S = C = 0.</p> }
          <div class="fila" style="margin-top:.4rem">
            @if (r.origen === 'OFERTA') {
              <input type="number" min="1" [max]="r.cantidadDisponible" [value]="cantidades()[c.peticionId] ?? 1"
                     (input)="fijarCantidad(c.peticionId, $any($event.target).value)" style="max-width:110px" />
            }
            <button class="pequeno" [disabled]="ocupado()" (click)="confirmar(r, c.peticionId)">Confirmar beneficiario</button>
          </div>
        </div>
      }

      <div class="tarjeta" style="border-style:dashed">
        <div class="fila">
          <span class="etiqueta ambar">Ultima opcion</span>
          <strong>{{ r.destinoLocal.nombre }}</strong>
        </div>
        <ul class="dato" style="margin:.4rem 0; padding-left:1.1rem">
          @for (regla of r.destinoLocal.reglas; track regla) { <li>{{ regla }}</li> }
        </ul>
        <div class="fila">
          @if (r.origen === 'OFERTA') {
            <input type="number" min="1" [max]="r.cantidadDisponible" [value]="cantidadLocal()"
                   (input)="cantidadLocal.set($any($event.target).value)" style="max-width:110px" />
          }
          <button class="secundario pequeno" [disabled]="ocupado()" (click)="destinarLocal(r)">
            Destinar a LOCAL (custodia temporal)
          </button>
        </div>
      </div>
    }
  `,
})
export class EmparejamientoComponent implements OnInit {
  private api = inject(ApiService);

  modo = signal<'OFERTA' | 'LOTE'>('OFERTA');
  ofertas = signal<OfertaCatalogo[]>([]);
  lotes = signal<LoteFisico[]>([]);
  seleccion = signal('');
  resultado = signal<ResultadoEmparejamiento | null>(null);
  cantidades = signal<Record<number, number>>({});
  cantidadLocal = signal('1');
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  cargando = signal(false);
  ocupado = signal(false);

  ngOnInit(): void {
    this.cargarListas();
  }

  private cargarListas(): void {
    this.api.catalogoOfertas().subscribe({ next: (o) => this.ofertas.set(o), error: (e) => this.error.set(mensajeError(e)) });
    this.api.lotes('SIN_DESTINO').subscribe({ next: (l) => this.lotes.set(l), error: () => this.lotes.set([]) });
  }

  cambiarModo(m: 'OFERTA' | 'LOTE'): void {
    this.modo.set(m);
    this.seleccion.set('');
    this.resultado.set(null);
  }

  fmtCaja(v: number[]): string {
    return v.map((x) => (Math.abs(x) >= 1e8 ? (x > 0 ? '+∞' : '-∞') : String(x))).join(', ');
  }

  elegir(valor: string): void {
    this.seleccion.set(valor);
    this.resultado.set(null);
    this.error.set(null);
    if (!valor) return;
    this.cargando.set(true);
    const peticion = this.modo() === 'OFERTA' ? this.api.candidatos(Number(valor)) : this.api.candidatosLote(Number(valor));
    peticion.subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron calcular los candidatos.'));
        this.cargando.set(false);
      },
    });
  }

  fijarCantidad(peticionId: number, valor: string): void {
    this.cantidades.set({ ...this.cantidades(), [peticionId]: Number(valor) });
  }

  private terminar(texto: string, r: ResultadoEmparejamiento): void {
    this.mensaje.set(texto);
    this.ocupado.set(false);
    this.cargarListas();
    if (r.origen === 'OFERTA') this.elegir(String(r.oferta.id));
    else this.resultado.set(null);
  }

  confirmar(r: ResultadoEmparejamiento, peticionId: number): void {
    this.ocupado.set(true);
    this.error.set(null);
    if (r.origen === 'LOTE' && r.loteId) {
      this.api.reasignarLote(r.loteId, peticionId).subscribe({
        next: (a) => this.terminar(`Lote reasignado: asignacion #${a.id} EN_CUSTODIA (sin nueva recepcion). Se aviso al estudiante.`, r),
        error: (e) => { this.error.set(mensajeError(e, 'No se pudo reasignar.')); this.ocupado.set(false); },
      });
      return;
    }
    const cantidad = this.cantidades()[peticionId] ?? 1;
    if (cantidad < 1 || cantidad > r.cantidadDisponible) {
      this.error.set(`La cantidad debe estar entre 1 y ${r.cantidadDisponible}.`);
      this.ocupado.set(false);
      return;
    }
    this.api.asignar({ ofertaId: r.oferta.id, peticionId, cantidad }).subscribe({
      next: (a) => this.terminar(`Asignacion #${a.id} creada (${cantidad} u.). Se aviso al donador y al estudiante.`, r),
      error: (e) => { this.error.set(mensajeError(e, 'No se pudo asignar.')); this.ocupado.set(false); },
    });
  }

  destinarLocal(r: ResultadoEmparejamiento): void {
    const motivo = prompt('Motivo para destinar a LOCAL (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.ocupado.set(true);
    this.error.set(null);
    const llamada =
      r.origen === 'LOTE' && r.loteId
        ? this.api.localDesdeLote(r.loteId, motivo.trim())
        : this.api.localDesdeOferta(r.oferta.id, Number(this.cantidadLocal()), motivo.trim());
    llamada.subscribe({
      next: (d) => this.terminar(`Destino LOCAL #${d.id} en ${d.estado}. Gestionalo en "LOCAL y lotes".`, r),
      error: (e) => { this.error.set(mensajeError(e, 'No se pudo destinar a LOCAL.')); this.ocupado.set(false); },
    });
  }
}
