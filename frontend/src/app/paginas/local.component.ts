import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TrazabilidadComponent } from '../compartido/trazabilidad.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DestinoLocal, EstadoLocal, FotoEnviable, LoteFisico } from '../core/modelos';
import { fecha, leerComoFoto, mensajeError } from '../core/utilidades';

/**
 * LOCAL (D-43, D-50): el LIS como destino institucional.
 *  - Custodia temporal: la gestiona el auxiliar. Lo que esta en custodia se
 *    puede EMPAREJAR directo con un estudiante (sin nueva recepcion).
 *  - Quedarse el producto para el LIS: SOLO el administrador lo PROPONE y el
 *    DONADOR acepta o rechaza. Si rechaza, se le devuelve (con foto).
 */
@Component({
  selector: 'lis-local',
  standalone: true,
  imports: [CommonModule, TrazabilidadComponent],
  template: `
    <h1>LOCAL y lotes fisicos</h1>
    <p class="subtitulo">
      LOCAL no es un usuario ni una peticion: es el LIS como destino institucional. Lo que esta en
      custodia temporal se puede emparejar con un estudiante. Para que un producto quede para el
      LIS, el administrador lo propone y el donador decide.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (trazaOferta(); as id) {
      <lis-trazabilidad [ofertaId]="id" (cerrar)="trazaOferta.set(null)" />
    }

    @if (activo(); as d) {
      <div class="tarjeta">
        <strong>{{ accion() === 'recepcion' ? 'Recepcion' : 'Devolucion al donador' }} — LOCAL #{{ d.id }} ({{ d.cantidad }} u.)</strong>
        <label>Nombre de quien {{ accion() === 'recepcion' ? 'entrega' : 'recibe' }}</label>
        <input [value]="contraparte()" (input)="contraparte.set($any($event.target).value)" />
        <label>Fotografia (obligatoria)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" (change)="elegirFoto($event)" />
        <div class="fila" style="margin-top:.6rem">
          <button class="pequeno" [disabled]="!foto() || contraparte().trim().length < 3" (click)="registrar(d)">Registrar</button>
          <button class="secundario pequeno" (click)="activo.set(null)">Cerrar</button>
        </div>
      </div>
    }

    <h2>Destinos LOCAL abiertos</h2>
    @if (!abiertos().length) { <p class="vacio">No hay destinos LOCAL abiertos.</p> }
    @for (d of abiertos(); track d.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta"
                [class.ambar]="d.estado === 'ESPERA_RECEPCION' || d.estado === 'PROPUESTO_DONADOR'"
                [class.roja]="d.estado === 'POR_DEVOLVER'">{{ legible(d.estado) }}</span>
          <strong>LOCAL #{{ d.id }} — {{ d.producto }}</strong>
          <span class="etiqueta gris">{{ d.cantidad }} u.</span>
          @if (auth.esAdministrador()) {
            <button class="secundario pequeno" style="margin-left:auto" (click)="trazaOferta.set(d.ofertaId)">Trazabilidad</button>
          }
        </div>
        <p class="dato">Motivo de custodia: {{ d.motivo }} &middot; elegido {{ f(d.seleccionadoEn) }}
          @if (d.custodiaDesde) { &middot; custodia desde {{ f(d.custodiaDesde) }} }
          @if (d.loteId) { &middot; lote #{{ d.loteId }} }</p>

        @if (d.donador; as dn) {
          <p class="dato">
            Donador: <strong>{{ dn.nombre }}</strong> &middot;
            <a [href]="'mailto:' + dn.email">{{ dn.email }}</a>
          </p>
        }

        @if (d.estado === 'PROPUESTO_DONADOR') {
          <div class="aviso info" style="margin:.5rem 0">
            Propuesta enviada al donador: <em>{{ d.propuestaMotivo }}</em>.
            Debe responder antes del <strong>{{ d.propuestaLimite }}</strong> (dias habiles).
            Mientras tanto no se puede emparejar.
          </div>
        }
        @if (d.estado === 'POR_DEVOLVER') {
          <div class="aviso error" style="margin:.5rem 0">
            El donador rechazo que quede para el LIS
            @if (d.respuestaMotivo) { (“{{ d.respuestaMotivo }}”) }.
            Contactalo y registra la devolucion con foto.
          </div>
        }

        <div class="fila">
          @if (d.estado === 'ESPERA_RECEPCION') {
            <button class="pequeno" (click)="abrir(d, 'recepcion')">Registrar recepcion</button>
            <button class="peligro pequeno" (click)="cancelar(d)">Cancelar</button>
          }
          @if (d.estado === 'CUSTODIA_TEMPORAL') {
            <button class="pequeno" (click)="emparejar(d.loteId)">Emparejar con un estudiante</button>
            @if (auth.esAdministrador()) {
              <button class="secundario pequeno" (click)="proponer(d)">Proponer al donador que quede para el LIS</button>
            }
            <button class="secundario pequeno" (click)="abrir(d, 'devolucion')">Devolver al donador</button>
          }
          @if (d.estado === 'PROPUESTO_DONADOR' && auth.esAdministrador()) {
            <button class="secundario pequeno" (click)="retirar(d)">Retirar propuesta</button>
          }
          @if (d.estado === 'POR_DEVOLVER') {
            <button class="pequeno" (click)="abrir(d, 'devolucion')">Registrar devolucion (foto)</button>
          }
        </div>
      </div>
    }

    <h2>Lotes fisicos en el LIS</h2>
    <table>
      <thead><tr><th>Lote</th><th>Producto</th><th>Unidades</th><th>Ubicacion</th><th>Titular actual</th><th></th></tr></thead>
      <tbody>
        @for (l of lotes(); track l.id) {
          <tr>
            <td>#{{ l.id }}</td><td>{{ l.producto }}<br /><span class="dato">{{ l.categoria }} &middot; {{ l.origen }}</span></td>
            <td>{{ l.cantidad }}</td><td>{{ l.ubicacion }}</td>
            <td>
              @if (l.titular) { {{ l.titular.tipo }} #{{ l.titular.id }} ({{ l.titular.estado }}) }
              @else { <span class="etiqueta roja">sin destino</span> }
            </td>
            <td>
              @if (l.sinDestino || l.enCustodiaLocal) {
                <button class="secundario pequeno" (click)="emparejar(l.id)">Emparejar</button>
              }
              @if (l.sinDestino) {
                <button class="secundario pequeno" (click)="custodiaLote(l)">Custodia LOCAL</button>
              }
            </td>
          </tr>
        } @empty { <tr><td colspan="6" class="vacio">No hay lotes en el LIS.</td></tr> }
      </tbody>
    </table>

    <h2>Historial LOCAL</h2>
    <table>
      <thead><tr><th>#</th><th>Producto</th><th>Estado</th><th>Cierre</th></tr></thead>
      <tbody>
        @for (d of cerrados(); track d.id) {
          <tr><td>{{ d.id }}</td><td>{{ d.producto }} ({{ d.cantidad }} u.)</td><td>{{ legible(d.estado) }}</td>
            <td>{{ d.motivoCierre }} @if (d.aceptadoEn) { — aceptado {{ f(d.aceptadoEn) }} }</td></tr>
        } @empty { <tr><td colspan="4" class="vacio">Sin historial.</td></tr> }
      </tbody>
    </table>
  `,
})
export class LocalComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  auth = inject(AuthService);

  /** D-52: trazabilidad (solo administrador). */
  trazaOferta = signal<number | null>(null);

  abiertos = signal<DestinoLocal[]>([]);
  cerrados = signal<DestinoLocal[]>([]);
  lotes = signal<LoteFisico[]>([]);
  activo = signal<DestinoLocal | null>(null);
  accion = signal<'recepcion' | 'devolucion'>('recepcion');
  contraparte = signal('');
  foto = signal<FotoEnviable | null>(null);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    const fallo = (e: unknown) => this.error.set(mensajeError(e));
    this.api.destinosLocal('ESPERA_RECEPCION,CUSTODIA_TEMPORAL,PROPUESTO_DONADOR,POR_DEVOLVER').subscribe({ next: (x) => this.abiertos.set(x), error: fallo });
    this.api.destinosLocal('ACEPTADO,REASIGNADO,DEVUELTO,CANCELADO').subscribe({ next: (x) => this.cerrados.set(x), error: fallo });
    this.api.lotes('EN_LIS').subscribe({ next: (x) => this.lotes.set(x), error: fallo });
  }

  legible(e: EstadoLocal): string {
    const mapa: Record<EstadoLocal, string> = {
      ESPERA_RECEPCION: 'Espera recepcion',
      CUSTODIA_TEMPORAL: 'Custodia temporal',
      PROPUESTO_DONADOR: 'Esperando respuesta del donador',
      POR_DEVOLVER: 'Por devolver al donador',
      ACEPTADO: 'Aceptado por el LIS',
      REASIGNADO: 'Emparejado con un estudiante',
      DEVUELTO: 'Devuelto',
      CANCELADO: 'Cancelado',
    };
    return mapa[e] ?? e;
  }

  private ok(texto: string): void {
    this.mensaje.set(texto);
    this.error.set(null);
    this.activo.set(null);
    this.cargar();
  }

  private motivo(texto: string): string | null {
    const m = prompt(texto);
    return m && m.trim().length >= 5 ? m.trim() : null;
  }

  abrir(d: DestinoLocal, accion: 'recepcion' | 'devolucion'): void {
    this.activo.set(d);
    this.accion.set(accion);
    this.contraparte.set('');
    this.foto.set(null);
  }

  async elegirFoto(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    try {
      this.foto.set(await leerComoFoto(archivo));
    } catch (e: any) {
      this.error.set(e.message);
    }
  }

  registrar(d: DestinoLocal): void {
    const datos = { cantidad: d.cantidad, nombreContraparte: this.contraparte().trim(), foto: this.foto()! };
    const llamada = this.accion() === 'recepcion' ? this.api.localRecibir(d.id, datos) : this.api.localDevolver(d.id, datos);
    llamada.subscribe({
      next: (r) => this.ok(`LOCAL #${r.id}: ${this.legible(r.estado)}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  cancelar(d: DestinoLocal): void {
    const m = this.motivo('Motivo de la cancelacion (minimo 5 caracteres):');
    if (!m) return;
    this.api.localCancelar(d.id, m).subscribe({ next: () => this.ok(`LOCAL #${d.id} cancelado: las unidades vuelven a la oferta.`), error: (e) => this.error.set(mensajeError(e)) });
  }

  /** D-50: abre Emparejamiento (KD-tree + prioridad) para ese lote. */
  emparejar(loteId: number | null): void {
    if (!loteId) return;
    this.router.navigate(['/lis/emparejamiento'], { queryParams: { lote: loteId } });
  }

  proponer(d: DestinoLocal): void {
    const m = this.motivo(
      'Motivo para que el producto quede para el LIS (el donador lo vera y decidira si acepta). Minimo 5 caracteres:',
    );
    if (!m) return;
    this.api.localProponer(d.id, m).subscribe({
      next: (r) => this.ok(`Propuesta enviada al donador (bandeja y correo). Debe responder antes del ${r.propuestaLimite}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  retirar(d: DestinoLocal): void {
    const m = this.motivo('Motivo para retirar la propuesta (minimo 5 caracteres):');
    if (!m) return;
    this.api.localRetirarPropuesta(d.id, m).subscribe({
      next: () => this.ok(`Propuesta retirada: LOCAL #${d.id} vuelve a custodia temporal.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  custodiaLote(l: LoteFisico): void {
    const m = this.motivo('Motivo de la custodia temporal LOCAL:');
    if (!m) return;
    this.api.localDesdeLote(l.id, m).subscribe({ next: (d) => this.ok(`Lote #${l.id} en custodia temporal (LOCAL #${d.id}).`), error: (e) => this.error.set(mensajeError(e)) });
  }
}
