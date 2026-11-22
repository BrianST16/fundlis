import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DestinoLocal, FotoEnviable, LoteFisico } from '../core/modelos';
import { fecha, leerComoFoto, mensajeError } from '../core/utilidades';

/**
 * LOCAL (D-43): el LIS como destino institucional. Custodia TEMPORAL la
 * gestiona el auxiliar; la ACEPTACION como donativo la autoriza SOLO el
 * administrador. Tambien muestra la ubicacion fisica actual (lotes).
 */
@Component({
  selector: 'lis-local',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h1>LOCAL y lotes fisicos</h1>
    <p class="subtitulo">
      LOCAL no es un usuario ni una peticion: es el LIS como destino institucional. La custodia
      temporal la gestiona el auxiliar; la aceptacion como donativo del LIS solo la autoriza el
      administrador.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (activo(); as d) {
      <div class="tarjeta">
        <strong>{{ accion() === 'recepcion' ? 'Recepcion' : 'Devolucion' }} — LOCAL #{{ d.id }} ({{ d.cantidad }} u.)</strong>
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
    @if (!abiertos().length) { <p class="vacio">No hay destinos LOCAL en espera ni en custodia.</p> }
    @for (d of abiertos(); track d.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta" [class.ambar]="d.estado === 'ESPERA_RECEPCION'">{{ d.estado }}</span>
          <strong>LOCAL #{{ d.id }} — {{ d.producto }}</strong>
          <span class="etiqueta gris">{{ d.cantidad }} u.</span>
          @if (d.aceptacionSolicitada) { <span class="etiqueta ambar">aceptacion solicitada</span> }
        </div>
        <p class="dato">Motivo: {{ d.motivo }} &middot; elegido {{ f(d.seleccionadoEn) }}
          @if (d.custodiaDesde) { &middot; custodia desde {{ f(d.custodiaDesde) }} }
          @if (d.loteId) { &middot; lote #{{ d.loteId }} }</p>
        <div class="fila">
          @if (d.estado === 'ESPERA_RECEPCION') {
            <button class="pequeno" (click)="abrir(d, 'recepcion')">Registrar recepcion</button>
            <button class="peligro pequeno" (click)="cancelar(d)">Cancelar</button>
          }
          @if (d.estado === 'CUSTODIA_TEMPORAL') {
            @if (!d.aceptacionSolicitada) {
              <button class="secundario pequeno" (click)="solicitar(d)">Solicitar aceptacion institucional</button>
            }
            @if (auth.esAdministrador()) {
              <button class="pequeno" (click)="aceptar(d)">Aceptar como donativo del LIS (administrador)</button>
            }
            <button class="secundario pequeno" (click)="reasignar(d)">Reasignar a una peticion</button>
            <button class="secundario pequeno" (click)="abrir(d, 'devolucion')">Devolver al donador</button>
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
              @if (l.sinDestino) {
                <a routerLink="/lis/emparejamiento">Reasignar</a> ·
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
          <tr><td>{{ d.id }}</td><td>{{ d.producto }} ({{ d.cantidad }} u.)</td><td>{{ d.estado }}</td>
            <td>{{ d.motivoCierre }} @if (d.aceptadoEn) { — aceptado {{ f(d.aceptadoEn) }} }</td></tr>
        } @empty { <tr><td colspan="4" class="vacio">Sin historial.</td></tr> }
      </tbody>
    </table>
  `,
})
export class LocalComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

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
    this.api.destinosLocal('ESPERA_RECEPCION,CUSTODIA_TEMPORAL').subscribe({ next: (x) => this.abiertos.set(x), error: fallo });
    this.api.destinosLocal('ACEPTADO,REASIGNADO,DEVUELTO,CANCELADO').subscribe({ next: (x) => this.cerrados.set(x), error: fallo });
    this.api.lotes('EN_LIS').subscribe({ next: (x) => this.lotes.set(x), error: fallo });
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
      next: (r) => this.ok(`LOCAL #${r.id} ahora esta en ${r.estado}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  cancelar(d: DestinoLocal): void {
    const m = this.motivo('Motivo de la cancelacion (minimo 5 caracteres):');
    if (!m) return;
    this.api.localCancelar(d.id, m).subscribe({ next: () => this.ok(`LOCAL #${d.id} cancelado: las unidades vuelven a la oferta.`), error: (e) => this.error.set(mensajeError(e)) });
  }

  solicitar(d: DestinoLocal): void {
    const m = this.motivo('Por que proponer aceptarlo como donativo del LIS?');
    if (!m) return;
    this.api.localSolicitarAceptacion(d.id, m).subscribe({ next: () => this.ok('Solicitud enviada a los administradores.'), error: (e) => this.error.set(mensajeError(e)) });
  }

  aceptar(d: DestinoLocal): void {
    const m = this.motivo('Motivo de la aceptacion institucional:');
    if (!m) return;
    this.api.localAceptar(d.id, m).subscribe({ next: () => this.ok(`LOCAL #${d.id} aceptado como patrimonio del LIS.`), error: (e) => this.error.set(mensajeError(e)) });
  }

  reasignar(d: DestinoLocal): void {
    const id = prompt('Numero de la peticion compatible a la que se reasigna (ver Emparejamiento):');
    if (!id || !Number(id)) return;
    this.api.localReasignar(d.id, Number(id)).subscribe({
      next: (r) => this.ok(`Reasignado: asignacion #${r.asignacionId} EN_CUSTODIA, sin nueva recepcion.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  custodiaLote(l: LoteFisico): void {
    const m = this.motivo('Motivo de la custodia temporal LOCAL:');
    if (!m) return;
    this.api.localDesdeLote(l.id, m).subscribe({ next: (d) => this.ok(`Lote #${l.id} en custodia temporal (LOCAL #${d.id}).`), error: (e) => this.error.set(mensajeError(e)) });
  }
}
