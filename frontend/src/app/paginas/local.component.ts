import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatosMovimiento, RegistroMovimientoComponent } from '../compartido/registro-movimiento.component';
import { TrazabilidadComponent } from '../compartido/trazabilidad.component';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DecisionTarea, DestinoLocal, EstadoLocal, LoteFisico, TareaDefinirEstado } from '../core/modelos';
import { TareasPendientesService } from '../core/tareas-pendientes.service';
import { estadoLegible, fecha, mensajeError } from '../core/utilidades';

/**
 * Local (D-43, D-50): el LIS como destino institucional.
 *  - Custodia temporal: la gestiona el auxiliar. Lo que esta en custodia se
 *    puede EMPAREJAR directo con un estudiante (sin nueva recepcion).
 *  - Quedarse el producto para el LIS: SOLO el administrador lo PROPONE y el
 *    DONADOR acepta o rechaza. Si rechaza, se le devuelve (con foto).
 *  - D-59: las tareas DEFINIR_ESTADO de destinos Local y de lotes sin destino
 *    se ven y se deciden aqui, en la tarjeta o fila de su objeto.
 */
@Component({
  selector: 'lis-local',
  standalone: true,
  imports: [CommonModule, TrazabilidadComponent, RegistroMovimientoComponent, PaginadorComponent],
  template: `
    <h1>Local y lotes físicos</h1>
    <p class="subtitulo">
      Productos bajo custodia del LIS. Para quedarse con uno, el administrador lo propone y el donador decide.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <!-- D-59: aviso de decisiones pendientes de Local y de lotes (aparecen primero en su lista). -->
    @if (pendientes.deLocal().length; as n) {
      <div class="aviso alerta-tarea">
        &#9888; <strong>{{ n }} {{ n === 1 ? 'decisión pendiente' : 'decisiones pendientes' }}</strong> por plazos vencidos. Aparecen primero.
      </div>
    }

    @if (trazaOferta(); as id) {
      <lis-trazabilidad [ofertaId]="id" (cerrar)="trazaOferta.set(null)" />
    }


    <h2 #tAbiertos>Destinos Local abiertos ({{ abiertos().length }})</h2>
    @if (!abiertos().length) { <p class="vacio">No hay destinos Local abiertos.</p> }
    @for (d of pagAbiertos.visibles(); track d.id) {
      <div class="tarjeta" [class.con-tarea]="pendientes.porDestino().has(d.id)">
        <div class="fila">
          <span class="etiqueta"
                [class.ambar]="d.estado === 'ESPERA_RECEPCION' || d.estado === 'PROPUESTO_DONADOR' || d.estado === 'POR_DEVOLVER'">{{ legible(d.estado) }}</span>
          <strong>Local #{{ d.id }} — {{ d.producto }}</strong>
          <span class="etiqueta gris">{{ d.cantidad }} u.</span>
          @if (pendientes.porDestino().get(d.id); as t) {
            <span class="etiqueta roja">Decisión pendiente</span>
          }
          @if (auth.esAdministrador()) {
            <button class="secundario pequeno" style="margin-left:auto" (click)="trazaOferta.set(d.ofertaId)">Trazabilidad</button>
          }
        </div>
        <p class="dato">{{ d.motivo }} &middot; {{ f(d.seleccionadoEn) }}
          @if (d.custodiaDesde) { &middot; en el LIS desde {{ f(d.custodiaDesde) }} }
          @if (d.loteId) { &middot; lote #{{ d.loteId }} }</p>

        @if (d.donador; as dn) {
          <p class="dato">
            Donador: <strong>{{ dn.nombre }}</strong> &middot;
            <a [href]="'mailto:' + dn.email">{{ dn.email }}</a>
          </p>
        }

        @if (d.estado === 'PROPUESTO_DONADOR') {
          <div class="aviso info" style="margin:.5rem 0">
            Propuesta enviada: <em>{{ d.propuestaMotivo }}</em>. Responde hasta el <strong>{{ d.propuestaLimite }}</strong>.
          </div>
        }
        @if (pendientes.porDestino().get(d.id); as t) {
          <p class="aviso info" style="margin:.5rem 0">
            {{ explicarTarea(t) }} (límite {{ t.fechaLimite }}).
          </p>
        }
        @if (d.estado === 'POR_DEVOLVER') {
          <div class="aviso info" style="margin:.5rem 0">
            El donador pidió que se le devuelva
            @if (d.respuestaMotivo) { (“{{ d.respuestaMotivo }}”) }.
            
          </div>
        }

        <div class="fila">
          @if (d.estado === 'ESPERA_RECEPCION') {
            <button class="pequeno" (click)="abrir(d, 'recepcion')">Registrar recepción</button>
            <button class="peligro pequeno" (click)="cancelar(d)">Cancelar</button>
          }
          @if (d.estado === 'CUSTODIA_TEMPORAL') {
            <button class="pequeno" (click)="emparejar(d.loteId)">Emparejar con un estudiante</button>
            @if (auth.esAdministrador()) {
              <button class="secundario pequeno" (click)="proponer(d)">Proponer que quede para el LIS</button>
            }
            <button class="secundario pequeno" (click)="abrir(d, 'devolucion')">Devolver al donador</button>
          }
          @if (d.estado === 'PROPUESTO_DONADOR' && auth.esAdministrador()) {
            <button class="secundario pequeno" (click)="retirar(d)">Retirar propuesta</button>
          }
          @if (d.estado === 'POR_DEVOLVER') {
            <button class="pequeno" (click)="abrir(d, 'devolucion')">Registrar devolución</button>
          }
          <!-- D-59: las decisiones que solo tiene la tarea (las demas ya estan arriba). -->
          @if (pendientes.porDestino().get(d.id); as t) {
            @for (x of decisionesPropias(t); track x.codigo) {
              <button class="secundario pequeno" (click)="decidir(t, x.codigo, x.texto)">{{ x.texto }}</button>
            }
          }
        </div>

        @if (activo()?.id === d.id) {
          <!-- Mismo formulario de movimiento fisico que "Entregas y plazos". -->
          <lis-registro-movimiento
            [titulo]="accion() === 'recepcion' ? 'Recepción en el LIS' : 'Devolución al donador'"
            [quien]="accion() === 'recepcion' ? 'entrega' : 'recibe'"
            [cantidadInicial]="d.cantidad"
            [enviando]="enviando()"
            (confirmar)="registrar(d, $event)"
            (cerrar)="activo.set(null)" />
        }
      </div>
    }

    <lis-paginador [control]="pagAbiertos" [destino]="tAbiertos" />

    <h2 #tLotes>Lotes físicos en el LIS ({{ lotes().length }})</h2>
    <table>
      <thead><tr><th>Lote</th><th>Producto</th><th>Unidades</th><th>Destino</th><th></th></tr></thead>
      <tbody>
        @for (l of pagLotes.visibles(); track l.id) {
          <tr [class.con-tarea]="pendientes.porLote().has(l.id)">
            <td>#{{ l.id }}</td><td>{{ l.producto }}<br /><span class="dato">{{ l.categoria }}</span></td>
            <td>{{ l.cantidad }}</td>
            <td>
              @if (l.titular) { {{ titular(l) }} }
              @else { <span class="etiqueta ambar">Sin destino</span> }
              @if (pendientes.porLote().get(l.id); as t) {
                <br /><span class="etiqueta roja">Decisión pendiente</span>
              }
            </td>
            <td>
              <!-- D-56: un lote en custodia Local se empareja desde su tarjeta de destino, arriba. -->
              @if (l.sinDestino) {
                <button class="secundario pequeno" (click)="emparejar(l.id)">Emparejar</button>
                <button class="secundario pequeno" (click)="custodiaLote(l)">Custodia Local</button>
                @if (pendientes.porLote().get(l.id); as t) {
                  @for (x of decisionesPropias(t); track x.codigo) {
                    <button class="secundario pequeno" (click)="decidir(t, x.codigo, x.texto)">{{ x.texto }}</button>
                  }
                }
              } @else if (l.enCustodiaLocal) {
                <span class="dato">En custodia Local</span>
              }
            </td>
          </tr>
        } @empty { <tr><td colspan="6" class="vacio">No hay lotes en el LIS.</td></tr> }
      </tbody>
    </table>
    <lis-paginador [control]="pagLotes" [destino]="tLotes" />

    <h2 #tHistorial>Historial Local ({{ cerrados().length }})</h2>
    <table>
      <thead><tr><th>#</th><th>Producto</th><th>Estado</th><th>Cierre</th></tr></thead>
      <tbody>
        @for (d of pagHistorial.visibles(); track d.id) {
          <tr><td>{{ d.id }}</td><td>{{ d.producto }} ({{ d.cantidad }} u.)</td><td>{{ legible(d.estado) }}</td>
            <td>{{ d.motivoCierre }} @if (d.aceptadoEn) { — aceptado {{ f(d.aceptadoEn) }} }</td></tr>
        } @empty { <tr><td colspan="4" class="vacio">Sin historial.</td></tr> }
      </tbody>
    </table>
    <lis-paginador [control]="pagHistorial" [destino]="tHistorial" />
  `,
})
export class LocalComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  auth = inject(AuthService);

  /** D-52: trazabilidad (solo administrador). */
  trazaOferta = signal<number | null>(null);

  pendientes = inject(TareasPendientesService);

  abiertos = signal<DestinoLocal[]>([]);
  cerrados = signal<DestinoLocal[]>([]);
  lotes = signal<LoteFisico[]>([]);
  /** D-59: lo que tiene una tarea DEFINIR_ESTADO abierta va primero en su lista. */
  private abiertosOrdenados = computed(() => primeroConTarea(this.abiertos(), this.pendientes.porDestino()));
  private lotesOrdenados = computed(() => primeroConTarea(this.lotes(), this.pendientes.porLote()));
  pagAbiertos = new Paginado(this.abiertosOrdenados, 10);
  pagLotes = new Paginado(this.lotesOrdenados, 15);
  pagHistorial = new Paginado(this.cerrados, 15);
  activo = signal<DestinoLocal | null>(null);
  accion = signal<'recepcion' | 'devolucion'>('recepcion');
  enviando = signal(false);
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
    this.pendientes.refrescar();
  }

  /** Que vencio, en palabras del auxiliar. */
  explicarTarea(t: TareaDefinirEstado): string {
    if (t.clave.startsWith('PROPUESTA:')) return 'El donador no respondió la propuesta a tiempo';
    if (t.clave.startsWith('DEVOLVER:')) {
      return 'La devolución al donador sigue pendiente: contáctalo para coordinar el retiro. Si no lo retira, define el destino del producto';
    }
    if (t.responsable === 'DONADOR') {
      const agotada = t.prorroga && t.prorroga.restantes <= 0;
      return 'El donador no llevo el producto al LIS a tiempo' + (agotada ? ' (ya se le dio más tiempo: cancela el destino Local)' : '');
    }
    return 'La custodia temporal superó su plazo sin destino' + this.textoEsperas(t);
  }

  /**
   * Solo las decisiones que la tarjeta no ofrece ya (sin duplicados): esperar
   * con el donador contactado, o pasar a devolucion una propuesta sin
   * respuesta. Cancelar, emparejar, devolver y retirar ya son botones arriba
   * y, al usarlos, resuelven la tarea (D-56).
   */
  decisionesPropias(t: TareaDefinirEstado): { codigo: DecisionTarea; texto: string }[] {
    if (t.clave.startsWith('PROPUESTA:')) {
      // D-61: hablando con el donador se le da mas tiempo, sin tope, hasta
      // que el administrador decida (retirar la propuesta o devolver).
      return [
        { codigo: 'ESPERAR', texto: `Dar más tiempo para responder (+${t.espera?.dias ?? 5} días hábiles)` },
        { codigo: 'DEVOLUCION', texto: 'Pasar a devolución al donador' },
      ];
    }
    if (t.responsable === 'DONADOR') {
      // D-61: como en una asignacion, UNA prorroga; despues, cancelar (boton de la tarjeta).
      return t.prorroga && t.prorroga.restantes > 0
        ? [{ codigo: 'APLAZAR', texto: `Dar más tiempo al donador (+${t.prorroga.dias} días hábiles)` }]
        : [];
    }
    if (t.clave.startsWith('DEVOLVER:')) {
      // D-62: una espera (el administrador puede dar mas en casos anomalos);
      // luego custodia Local (publicado) o, solo el administrador, recibir para el LIS.
      const quedan = (t.espera?.restantes ?? 0) > 0;
      const opciones: { codigo: DecisionTarea; texto: string }[] = [];
      if (quedan || this.auth.esAdministrador()) {
        opciones.push({
          codigo: 'ESPERAR',
          texto: `Dar más tiempo para devolver (+${t.espera?.dias ?? 5} días hábiles)${quedan ? '' : ' — excepcion del administrador'}`,
        });
      }
      opciones.push({ codigo: 'CUSTODIA_LOCAL', texto: 'Pasar a custodia Local (publicar)' });
      if (this.auth.esAdministrador()) opciones.push({ codigo: 'RECIBIR_LIS', texto: 'Recibir para el LIS' });
      return opciones;
    }
    // D-60: custodia Local y lote sin destino: esperar siempre con fecha nueva,
    // y solo mientras queden esperas.
    if (!t.espera || t.espera.restantes === null || t.espera.restantes <= 0) return [];
    return [{ codigo: 'ESPERAR', texto: `Esperar ${t.espera.dias} días hábiles más` }];
  }

  /** "(queda 1 espera)" o "(ya no quedan esperas: decide el destino)". */
  private textoEsperas(t: TareaDefinirEstado): string {
    if (!t.espera || t.espera.restantes === null) return '';
    if (t.espera.restantes <= 0) return ' (ya no quedan esperas: decide el destino)';
    return t.espera.restantes === 1 ? ' (queda 1 espera)' : ` (quedan ${t.espera.restantes} esperas)`;
  }

  decidir(t: TareaDefinirEstado, decision: DecisionTarea, texto: string): void {
    if (decision === 'RECIBIR_LIS' && !confirm('El donador no retiró el producto. Confirmas que quede para el LIS? Queda registrado a tu nombre.')) return;
    const motivo = this.motivo(`${texto}. Motivo (mínimo 5 caracteres):`);
    if (!motivo) return;
    this.api.resolverTarea(t.id, { decision, motivo }).subscribe({
      next: () => this.ok(`Tarea #${t.id} resuelta: ${texto.toLowerCase()}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Destino actual de un lote: asignacion o destino Local, en palabras. */
  titular(l: LoteFisico): string {
    if (!l.titular) return '';
    const tipo = l.titular.tipo === 'LOCAL' ? 'Local' : 'Asignación';
    return `${tipo} #${l.titular.id} (${estadoLegible(l.titular.estado).toLowerCase()})`;
  }

  legible(e: EstadoLocal): string {
    const mapa: Record<EstadoLocal, string> = {
      ESPERA_RECEPCION: 'Espera recepción',
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
  }

  registrar(d: DestinoLocal, datos: DatosMovimiento): void {
    this.enviando.set(true);
    const llamada = this.accion() === 'recepcion' ? this.api.localRecibir(d.id, datos) : this.api.localDevolver(d.id, datos);
    llamada.subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.ok(`Local #${r.id}: ${this.legible(r.estado)}.`);
      },
      error: (e) => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  cancelar(d: DestinoLocal): void {
    const m = this.motivo('Motivo de la cancelación (mínimo 5 caracteres):');
    if (!m) return;
    this.api.localCancelar(d.id, m).subscribe({ next: () => this.ok(`Local #${d.id} cancelado: las unidades vuelven a la oferta.`), error: (e) => this.error.set(mensajeError(e)) });
  }

  /** D-50: abre Emparejamiento (KD-tree + prioridad) para ese lote. */
  emparejar(loteId: number | null): void {
    if (!loteId) return;
    this.router.navigate(['/lis/emparejamiento'], { queryParams: { lote: loteId } });
  }

  proponer(d: DestinoLocal): void {
    const m = this.motivo(
      'Motivo para que el producto quede para el LIS (el donador lo verá y decidira si acepta). Mínimo 5 caracteres:',
    );
    if (!m) return;
    this.api.localProponer(d.id, m).subscribe({
      next: (r) => this.ok(`Propuesta enviada a la bandeja del donador. Debe responder antes del ${r.propuestaLimite}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  retirar(d: DestinoLocal): void {
    const m = this.motivo('Motivo para retirar la propuesta (mínimo 5 caracteres):');
    if (!m) return;
    this.api.localRetirarPropuesta(d.id, m).subscribe({
      next: () => this.ok(`Propuesta retirada: Local #${d.id} vuelve a custodia temporal.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  custodiaLote(l: LoteFisico): void {
    const m = this.motivo('Motivo de la custodia Local:');
    if (!m) return;
    this.api.localDesdeLote(l.id, m).subscribe({ next: (d) => this.ok(`Lote #${l.id} en custodia temporal (Local #${d.id}).`), error: (e) => this.error.set(mensajeError(e)) });
  }
}

/** Ordena poniendo primero los que tienen tarea abierta (el resto conserva su orden). */
function primeroConTarea<T extends { id: number }>(lista: T[], conTarea: Map<number, unknown>): T[] {
  return [...lista.filter((x) => conTarea.has(x.id)), ...lista.filter((x) => !conTarea.has(x.id))];
}
