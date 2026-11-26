import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatosMovimiento, RegistroMovimientoComponent } from '../compartido/registro-movimiento.component';
import { TrazabilidadComponent } from '../compartido/trazabilidad.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { AsignacionResumen, DecisionTarea, ItemBandejaPlazos, TareaDefinirEstado } from '../core/modelos';
import { TareasPendientesService } from '../core/tareas-pendientes.service';
import { fecha, mensajeError, puntaje } from '../core/utilidades';

type Accion = 'recepcion' | 'entrega' | 'devolucion';

/**
 * "Entregas y plazos" (D-59): todo lo de una asignacion en un solo lugar.
 *  - Ciclo fisico: recepcion, custodia, entrega y devolucion, con foto obligatoria.
 *  - Plazos en dias habiles y tareas DEFINIR_ESTADO de la asignacion: el aviso,
 *    el filtro "Vencidas" y la decision (incluido "Dar mas tiempo") viven aqui.
 * Las tareas de destinos Local y de lotes sin destino se deciden en "Local y lotes".
 */
@Component({
  selector: 'lis-custodia',
  standalone: true,
  imports: [CommonModule, TrazabilidadComponent, RegistroMovimientoComponent],
  template: `
    <h1>Entregas y plazos</h1>
    <p class="subtitulo">
      Recepción, custodia y entrega de cada asignación, con foto obligatoria. Plazos en días hábiles: 10 para que el donador entregue y 3 para que el estudiante recoja.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <!-- D-59: aviso de decisiones pendientes de las asignaciones. -->
    @if (pendientes.deAsignaciones().length; as n) {
      <div class="aviso alerta-tarea">
        &#9888; <strong>{{ n }} {{ n === 1 ? 'decisión pendiente' : 'decisiones pendientes' }}</strong> por plazos vencidos.
        @if (filtro() !== 'VENCIDAS') {
          <button class="pequeno" style="margin-left:.5rem" (click)="cambiarFiltro('VENCIDAS')">Ver solo vencidas</button>
        }
      </div>
    }
    <p class="dato">
      Los plazos se revisan automáticamente.
      <button class="secundario pequeno" (click)="revisar()">Revisar ahora</button>
    </p>

    @if (auth.esAdministrador()) {
      <div class="fila" style="margin-bottom:.75rem">
        <span class="dato">Trazabilidad de la donación #</span>
        <input type="number" min="1" style="max-width:110px" [value]="buscarOferta()"
               (input)="buscarOferta.set($any($event.target).value)" (keyup.enter)="verTraza(+buscarOferta())" />
        <button class="secundario pequeno" [disabled]="!(+buscarOferta() > 0)" (click)="verTraza(+buscarOferta())">Ver</button>
      </div>
    }
    @if (trazaOferta(); as id) {
      <lis-trazabilidad [ofertaId]="id" (cerrar)="trazaOferta.set(null)" />
    }

    <div class="fila" style="margin-bottom:1rem">
      @for (f of filtros; track f.valor) {
        <button
          class="pequeno"
          [class.secundario]="filtro() !== f.valor"
          (click)="cambiarFiltro(f.valor)"
        >{{ f.texto }}@if (f.valor === 'VENCIDAS' && vencidas() > 0) { ({{ vencidas() }}) }</button>
      }
    </div>

    @if (!vista().length) {
      <p class="vacio">No hay asignaciones en este estado.</p>
    }

    @for (a of vista(); track a.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta"
                [class.ambar]="a.estado === 'ASIGNADO' || a.estado === 'DEVOLUCION'"
                [class.gris]="a.estado === 'ENTREGADO' || a.estado === 'CANCELADO'">{{ legible(a.estado) }}</span>
          <strong>{{ a.producto }}</strong>
          <span class="dato">asignación #{{ a.id }} &middot; donación #{{ a.ofertaId }}</span>
          <!-- D-59: el plazo y la tarea DEFINIR_ESTADO de la asignacion se ven y se deciden aqui. -->
          @if (pendientes.porAsignacion().get(a.id); as t) {
            <span class="etiqueta roja">Decisión pendiente</span>
          } @else if (plazos().get(a.id)?.plazo; as p) {
            <span class="etiqueta" [class.roja]="p.estado === 'VENCIDO'" [class.ambar]="p.estado === 'POR_VENCER'" [class.gris]="p.estado === 'EN_PLAZO'">
              {{ p.estado === 'VENCIDO' ? 'Vencido' : p.estado === 'POR_VENCER' ? 'Por vencer' : 'En plazo' }} &middot; límite {{ p.fechaLimite }}
            </span>
          }
          @if (auth.esAdministrador()) {
            <button class="secundario pequeno" style="margin-left:auto" (click)="verTraza(a.ofertaId)"
                    title="Historial completo, con fotos">Trazabilidad</button>
          }
        </div>
        <p class="dato">
          {{ a.cantidadAsignada }} unidades &middot; {{ a.categoria }} &middot;
          donador <strong>{{ a.donador.nombre }}</strong> &middot;
          estudiante <strong>{{ a.estudiante.nombre }}</strong>
        </p>
        @if (pendientes.porAsignacion().get(a.id); as t) {
          <p class="aviso info" style="margin:.4rem 0">
            @if (esDevolucion(t)) {
              Devolución pendiente desde el {{ t.fechaLimite }}. Registra la salida o define el destino del producto.
            } @else {
              El plazo del {{ t.responsable === 'DONADOR' ? 'donador' : 'estudiante' }} venció el {{ t.fechaLimite }}.
            }
            @if (contacto(a); as c) { <br />Contactar a <strong>{{ c.nombre }}</strong> (<a [href]="'mailto:' + c.email">{{ c.email }}</a>). }
          </p>
        } @else if (plazos().get(a.id)?.plazo?.estado === 'POR_VENCER') {
          @if (contacto(a); as c) {
            <p class="dato">Plazo por vencer. Contactar a <strong>{{ c.nombre }}</strong> (<a [href]="'mailto:' + c.email">{{ c.email }}</a>).</p>
          }
        }
        <p class="dato">
          Asignada el {{ fe(a.asignadaEn) }}
          @if (a.recibidaEn) { &middot; recibida el {{ fe(a.recibidaEn) }} }
          @if (a.puntajePrioridad !== null) {
            &middot; prioridad {{ pt(a.puntajePrioridad) }}
          }
        </p>

        <div class="fila" style="margin-top:.6rem">
          <!-- Solo en una asignacion vencida, y solo si queda prorroga (D-58). -->
          @if (pendientes.porAsignacion().get(a.id); as t) {
            @if (t.prorroga && t.prorroga.restantes > 0) {
              <button class="pequeno" (click)="darMasTiempo(a, t)">
                Dar más tiempo {{ t.responsable === 'DONADOR' ? 'al donador' : 'al estudiante' }} (+{{ t.prorroga.dias }} días hábiles)
              </button>
            }
          }
          @if (a.estado === 'ASIGNADO') {
            <button class="pequeno" (click)="abrir(a, 'recepcion')">Registrar recepción</button>
            <button class="peligro pequeno" (click)="cancelar(a)">
              Cancelar (no entregó)
            </button>
          }
          @if (a.estado === 'EN_CUSTODIA') {
            <button class="pequeno" (click)="abrir(a, 'entrega')">Registrar entrega</button>
            @if (a.loteId) {
              <button class="secundario pequeno" (click)="reasignar(a)"
                      title="Sin repetir la recepción">
                Reasignar a otra petición
              </button>
            }
            <button class="secundario pequeno" (click)="marcarDevolucion(a)">
              Pasar a devolución
            </button>
            @if (pendientes.porAsignacion().get(a.id); as t) {
              <button class="secundario pequeno" (click)="custodiaLocal(a, t)"
                      title="El producto queda bajo custodia del LIS">Custodia Local</button>
            }
            <button class="peligro pequeno" (click)="abrirCancelacion(a)">Cancelar entrega</button>
          }
          @if (a.estado === 'DEVOLUCION') {
            <button class="pequeno" (click)="abrir(a, 'devolucion')">
              Registrar salida al donador
            </button>
            <!-- D-62: devolucion vencida que el donador no retira. -->
            @if (pendientes.porAsignacion().get(a.id); as t) {
              @if (esDevolucion(t)) {
                @if (puedeEsperarDevolucion(t)) {
                  <button class="secundario pequeno" (click)="esperarDevolucion(a, t)">{{ textoEsperaDevolucion(t) }}</button>
                }
                <button class="secundario pequeno" (click)="devolucionACustodia(a, t)"
                        title="Queda disponible para otro estudiante">
                  Pasar a custodia Local (publicar)
                </button>
                @if (auth.esAdministrador()) {
                  <button class="secundario pequeno" (click)="devolucionAlLis(a, t)"
                          title="Solo el administrador">
                    Recibir para el LIS
                  </button>
                }
              }
            }
          }
        </div>

        @if (cancelando() === a.id) {
          <!-- D-57: la causa decide si cuenta como incumplimiento del estudiante. -->
          <div class="subpanel">
            <strong>Cancelar la entrega de este producto</strong>
            <label>Causa</label>
            <label class="opcion">
              <input type="radio" name="causa-{{ a.id }}" [checked]="causa() === 'ESTUDIANTE_NO_RECOGIO'"
                     (change)="causa.set('ESTUDIANTE_NO_RECOGIO')" />
              El estudiante no recogió <span class="dato">(cuenta como incumplimiento)</span>
            </label>
            <label class="opcion">
              <input type="radio" name="causa-{{ a.id }}" [checked]="causa() === 'OTRO'" (change)="causa.set('OTRO')" />
              Otro motivo <span class="dato">(sin incumplimiento)</span>
            </label>
            <label>Motivo {{ causa() === 'OTRO' ? '(mínimo 5 caracteres)' : '(opcional)' }}</label>
            <textarea [value]="motivoCancelar()" (input)="motivoCancelar.set($any($event.target).value)"></textarea>
            <p class="dato">
              El producto queda en el LIS sin destino. Se avisa al estudiante y al donador.
            </p>
            <div class="fila" style="margin-top:.6rem">
              <button class="peligro" [disabled]="!puedeCancelar() || enviando()" (click)="confirmarCancelacion(a)">
                Confirmar cancelación
              </button>
              <button class="secundario" (click)="cancelando.set(null)">Volver</button>
            </div>
          </div>
        }

        @if (abierta() === a.id) {
          <lis-registro-movimiento
            [titulo]="tituloAccion()"
            [quien]="accion() === 'recepcion' ? 'entrega' : 'recibe'"
            [cantidadInicial]="a.cantidadAsignada"
            [cantidadEditable]="accion() === 'recepcion'"
            [enviando]="enviando()"
            (confirmar)="guardar(a, $event)"
            (cerrar)="cerrar()">
            @if (accion() === 'recepcion') {
              <p class="dato">
                Si llegan menos de {{ a.cantidadAsignada }} unidades, se crea una donación nueva con las que llegaron.
              </p>
            }
            @if (accion() === 'entrega') {
              <p class="aviso info" style="margin:.4rem 0">
                El donador verá esta foto: que no se vea el rostro ni los datos del estudiante.
              </p>
            }
          </lis-registro-movimiento>
        }
      </div>
    }
  `,
})
export class CustodiaComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  auth = inject(AuthService);
  pt = puntaje;

  /** D-52: donacion cuya trazabilidad se esta viendo (solo administrador). */
  trazaOferta = signal<number | null>(null);
  buscarOferta = signal('');

  verTraza(ofertaId: number): void {
    if (ofertaId > 0) this.trazaOferta.set(ofertaId);
  }

  pendientes = inject(TareasPendientesService);

  filtros = [
    { valor: 'ASIGNADO,EN_CUSTODIA', texto: 'Abiertas' },
    { valor: 'ASIGNADO', texto: 'Por recibir' },
    { valor: 'EN_CUSTODIA', texto: 'En custodia' },
    // D-59: filtros por plazo (antes en "Plazos y tareas").
    { valor: 'POR_VENCER', texto: 'Por vencer' },
    { valor: 'VENCIDAS', texto: 'Vencidas' },
    { valor: 'DEVOLUCION', texto: 'En devolución' },
    { valor: 'ENTREGADO', texto: 'Entregadas' },
    { valor: 'CANCELADO', texto: 'Canceladas' },
  ];

  asignaciones = signal<AsignacionResumen[]>([]);
  filtro = signal('ASIGNADO,EN_CUSTODIA');
  abierta = signal<number | null>(null);
  accion = signal<Accion>('recepcion');
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  enviando = signal(false);
  fe = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  cambiarFiltro(valor: string): void {
    this.filtro.set(valor);
    this.cerrar();
    this.cargar();
  }

  /** Plazos vigentes (con el contacto de cada parte), por asignacion. */
  plazos = signal<Map<number, ItemBandejaPlazos>>(new Map());

  private esVencida = (a: AsignacionResumen) =>
    this.pendientes.porAsignacion().has(a.id) || this.plazos().get(a.id)?.plazo.estado === 'VENCIDO';

  /** Lo que se muestra segun el filtro (los de plazo se filtran aqui). */
  vista = computed(() => {
    const f = this.filtro();
    if (f === 'VENCIDAS') return this.asignaciones().filter(this.esVencida);
    if (f === 'POR_VENCER') {
      return this.asignaciones().filter((a) => !this.esVencida(a) && this.plazos().get(a.id)?.plazo.estado === 'POR_VENCER');
    }
    return this.asignaciones();
  });

  vencidas = computed(() => this.pendientes.deAsignaciones().length);

  private cargar(): void {
    const f = this.filtro();
    const estados = f === 'VENCIDAS' || f === 'POR_VENCER' ? 'ASIGNADO,EN_CUSTODIA' : f;
    this.api.asignaciones(estados).subscribe({
      next: (a) => this.asignaciones.set(a),
      error: (e) => this.error.set(mensajeError(e)),
    });
    // Informativo: si falla, la lista principal se sigue viendo.
    this.pendientes.refrescar();
    this.api.bandejaPlazos().subscribe({
      next: (l) => this.plazos.set(new Map(l.map((i) => [i.asignacionId, i]))),
      error: () => this.plazos.set(new Map()),
    });
  }

  /** A quien contactar segun de quien es el plazo. */
  contacto(a: AsignacionResumen): { nombre: string; email: string } | null {
    const i = this.plazos().get(a.id);
    if (!i) return null;
    return i.plazo.responsable === 'DONADOR' ? i.donador : i.estudiante;
  }

  revisar(): void {
    this.api.revisarTareas().subscribe({
      next: (r) => {
        this.mensaje.set(
          `Revisión: ${r.tareasCreadas} tarea(s) nueva(s), ${r.avisosVencidos} aviso(s) de vencimiento, ` +
            `${r.avisosProximos} de proximidad, ${r.alertasNuevas ?? 0} alerta(s) de incumplimiento nueva(s).`,
        );
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Decision de la tarea DEFINIR_ESTADO desde su tarjeta. */
  // --- D-62: devolucion que el donador no retira -------------------------
  esDevolucion(t: TareaDefinirEstado): boolean {
    return t.clave.startsWith('DEVOLVER:');
  }

  /** Una espera; el administrador puede dar mas aunque se haya agotado (casos anomalos). */
  puedeEsperarDevolucion(t: TareaDefinirEstado): boolean {
    return (t.espera?.restantes ?? 0) > 0 || this.auth.esAdministrador();
  }

  textoEsperaDevolucion(t: TareaDefinirEstado): string {
    const base = `Dar más tiempo para devolver (+${t.espera?.dias ?? 5} días hábiles)`;
    return (t.espera?.restantes ?? 0) > 0 ? base : `${base} — excepción del administrador`;
  }

  esperarDevolucion(a: AsignacionResumen, t: TareaDefinirEstado): void {
    this.decidir(t, 'ESPERAR', 'Motivo para dar más tiempo al donador para retirar el producto (mínimo 5 caracteres):',
      `Asignación #${a.id}: el donador tiene ${t.espera?.dias ?? 5} días hábiles más para retirar el producto.`);
  }

  devolucionACustodia(a: AsignacionResumen, t: TareaDefinirEstado): void {
    this.decidir(t, 'CUSTODIA_LOCAL', 'Motivo para pasar el producto no retirado a custodia Local (mínimo 5 caracteres):',
      `Asignación #${a.id}: el producto queda en custodia Local, publicado para emparejar. Se avisó al donador.`);
  }

  devolucionAlLis(a: AsignacionResumen, t: TareaDefinirEstado): void {
    if (!confirm('El donador no retiró el producto. Confirmas que quede para el LIS? Queda registrado a tu nombre.')) return;
    this.decidir(t, 'RECIBIR_LIS', 'Motivo para recibir el producto para el LIS (mínimo 5 caracteres):',
      `Asignación #${a.id}: el producto quedó para el LIS. Se avisó al donador.`);
  }

  private decidir(t: TareaDefinirEstado, decision: DecisionTarea, pregunta: string, exito: string): void {
    const motivo = prompt(pregunta);
    if (!motivo || motivo.trim().length < 5) return;
    this.api.resolverTarea(t.id, { decision, motivo: motivo.trim() }).subscribe({
      next: () => {
        this.mensaje.set(exito);
        this.error.set(null);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  darMasTiempo(a: AsignacionResumen, t: TareaDefinirEstado): void {
    const donador = t.responsable === 'DONADOR';
    this.decidir(
      t,
      donador ? 'APLAZAR' : 'EXTENDER',
      `Motivo para dar más tiempo ${donador ? 'al donador' : 'al estudiante'} (+${t.prorroga?.dias} días hábiles, mínimo 5 caracteres):`,
      `Asignación #${a.id}: plazo ampliado ${t.prorroga?.dias} días hábiles. Se avisó ${donador ? 'al donador' : 'al estudiante'}.`,
    );
  }

  custodiaLocal(a: AsignacionResumen, t: TareaDefinirEstado): void {
    this.decidir(
      t,
      'CUSTODIA_LOCAL',
      'Motivo para dejar el producto en custodia temporal del LIS (mínimo 5 caracteres):',
      `Asignación #${a.id}: el producto queda en custodia Local. Gestiónalo en "Local y lotes".`,
    );
  }

  abrir(a: AsignacionResumen, accion: Accion): void {
    this.cancelando.set(null);
    this.abierta.set(a.id);
    this.accion.set(accion);
    this.error.set(null);
  }

  cerrar(): void {
    this.abierta.set(null);
  }

  tituloAccion(): string {
    const mapa: Record<Accion, string> = {
      recepcion: 'Recepción física del producto',
      entrega: 'Entrega al estudiante',
      devolucion: 'Salida del producto hacia el donador',
    };
    return mapa[this.accion()];
  }

  guardar(a: AsignacionResumen, datos: DatosMovimiento): void {
    this.enviando.set(true);
    this.error.set(null);

    const llamada =
      this.accion() === 'recepcion'
        ? this.api.registrarRecepcion(a.id, datos)
        : this.accion() === 'entrega'
          ? this.api.registrarEntrega(a.id, datos)
          : this.api.registrarDevolucion(a.id, datos);

    llamada.subscribe({
      next: (r) => {
        let texto = 'Movimiento registrado.';
        if (r?.ofertaGeneradaPorFaltante) {
          texto =
            `Recepción incompleta registrada. Se creó la donación ` +
            `#${r.ofertaGeneradaPorFaltante} con las unidades que si llegaron, lista para ` +
            'reasignar.';
        } else if (this.accion() === 'recepcion') {
          texto = 'Producto recibido y en custodia del LIS.';
        } else if (this.accion() === 'entrega') {
          texto = 'Entrega registrada. La petición queda cerrada por entrega.';
        } else {
          texto = 'Devolución registrada.';
        }
        this.mensaje.set(texto);
        this.enviando.set(false);
        this.cerrar();
        this.cargar();
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo registrar el movimiento.'));
        this.enviando.set(false);
      },
    });
  }

  /** D-57: cancelacion de un producto EN_CUSTODIA, con su causa. */
  cancelando = signal<number | null>(null);
  causa = signal<'ESTUDIANTE_NO_RECOGIO' | 'OTRO'>('ESTUDIANTE_NO_RECOGIO');
  motivoCancelar = signal('');

  abrirCancelacion(a: AsignacionResumen): void {
    this.cerrar();
    this.cancelando.set(a.id);
    this.causa.set('ESTUDIANTE_NO_RECOGIO');
    this.motivoCancelar.set('');
    this.error.set(null);
  }

  /** "No recogio" no exige motivo (agilidad); si se escribe uno, minimo 5 caracteres. */
  puedeCancelar(): boolean {
    const n = this.motivoCancelar().trim().length;
    return this.causa() === 'OTRO' ? n >= 5 : n === 0 || n >= 5;
  }

  confirmarCancelacion(a: AsignacionResumen): void {
    this.enviando.set(true);
    this.api.cancelarAsignacion(a.id, this.motivoCancelar().trim(), this.causa()).subscribe({
      next: () => {
        this.mensaje.set(
          this.causa() === 'OTRO'
            ? `Asignación #${a.id} cancelada sin incumplimiento del estudiante. El producto queda en el LIS sin destino.`
            : `Asignación #${a.id} cancelada: la petición quedó cerrada por incumplimiento. El producto queda en el LIS sin destino.`,
        );
        this.enviando.set(false);
        this.cancelando.set(null);
        this.cargar();
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.enviando.set(false);
      },
    });
  }

  /** Cancelacion antes de la recepcion (el donador no entrego). */
  cancelar(a: AsignacionResumen): void {
    const motivo = prompt('Motivo de la cancelación (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarAsignacion(a.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Asignación #${a.id} cancelada.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Abre Emparejamiento con los candidatos compatibles del lote (KD-tree +
   *  prioridad); alli se confirma la nueva peticion. */
  reasignar(a: AsignacionResumen): void {
    this.router.navigate(['/lis/emparejamiento'], {
      queryParams: { lote: a.loteId, asignacion: a.id },
    });
  }

  marcarDevolucion(a: AsignacionResumen): void {
    const motivo = prompt('Motivo de la devolución (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.marcarDevolucion(a.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Asignación #${a.id} pasa a devolución.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  legible(estado: string): string {
    const mapa: Record<string, string> = {
      ASIGNADO: 'Asignado, por recibir',
      EN_CUSTODIA: 'En custodia del LIS',
      ENTREGADO: 'Entregado',
      DEVOLUCION: 'En devolución',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado] ?? estado;
  }
}
