import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TrazabilidadComponent } from '../compartido/trazabilidad.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { AsignacionResumen, FotoEnviable } from '../core/modelos';
import { fecha, leerComoFoto, mensajeError, puntaje } from '../core/utilidades';

type Accion = 'recepcion' | 'entrega' | 'devolucion';

/** Recepcion fisica, custodia y entrega. La fotografia es obligatoria en
 *  todo movimiento fisico. */
@Component({
  selector: 'lis-custodia',
  standalone: true,
  imports: [CommonModule, TrazabilidadComponent],
  template: `
    <h1>Custodia y entregas</h1>
    <p class="subtitulo">
      Registra lo que entra y sale del LIS. Cada movimiento exige fotografia y el nombre de
      quien entrega o recibe.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    @if (auth.esAdministrador()) {
      <div class="fila" style="margin-bottom:.75rem">
        <span class="dato">Trazabilidad de la donacion #</span>
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
        >{{ f.texto }}</button>
      }
    </div>

    @if (!asignaciones().length) {
      <p class="vacio">No hay asignaciones en este estado.</p>
    }

    @for (a of asignaciones(); track a.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta" [class.ambar]="a.estado === 'ASIGNADO'">{{ legible(a.estado) }}</span>
          <strong>{{ a.producto }}</strong>
          <span class="dato">asignacion #{{ a.id }} &middot; donacion #{{ a.ofertaId }}</span>
          @if (auth.esAdministrador()) {
            <button class="secundario pequeno" style="margin-left:auto" (click)="verTraza(a.ofertaId)"
                    title="Linea de tiempo completa: estados, movimientos, responsables y fotos">Trazabilidad</button>
          }
        </div>
        <p class="dato">
          {{ a.cantidadAsignada }} unidades &middot; {{ a.categoria }} &middot;
          donador <strong>{{ a.donador.nombre }}</strong> &middot;
          estudiante <strong>{{ a.estudiante.nombre }}</strong>
        </p>
        <p class="dato">
          Asignada el {{ fe(a.asignadaEn) }}
          @if (a.recibidaEn) { &middot; recibida el {{ fe(a.recibidaEn) }} }
          @if (a.puntajePrioridad !== null) {
            &middot; prioridad al asignar {{ pt(a.puntajePrioridad) }} <span class="dato">(0 a 1)</span>
          }
        </p>

        <div class="fila" style="margin-top:.6rem">
          @if (a.estado === 'ASIGNADO') {
            <button class="pequeno" (click)="abrir(a, 'recepcion')">Registrar recepcion</button>
            <button class="peligro pequeno" (click)="cancelar(a)">
              Cancelar (el donador no entrego)
            </button>
          }
          @if (a.estado === 'EN_CUSTODIA') {
            <button class="pequeno" (click)="abrir(a, 'entrega')">Registrar entrega</button>
            @if (a.loteId) {
              <button class="secundario pequeno" (click)="reasignar(a)"
                      title="El producto ya esta en el LIS: pasa directo a custodia de la nueva peticion, sin repetir la recepcion">
                Reasignar a otra peticion
              </button>
            }
            <button class="secundario pequeno" (click)="marcarDevolucion(a)">
              Pasar a devolucion
            </button>
            <button class="peligro pequeno" (click)="cancelar(a)">
              Cancelar (el estudiante no recogio)
            </button>
          }
          @if (a.estado === 'DEVOLUCION') {
            <button class="pequeno" (click)="abrir(a, 'devolucion')">
              Registrar salida al donador
            </button>
          }
        </div>

        @if (abierta() === a.id) {
          <div class="tarjeta" style="margin:.85rem 0 0; background:var(--gris)">
            <strong>{{ tituloAccion() }}</strong>

            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              [value]="cantidad()"
              (input)="cantidad.set($any($event.target).value)"
            />
            @if (accion() === 'recepcion') {
              <p class="dato">
                Si llegan menos unidades de las {{ a.cantidadAsignada }} asignadas, el intento se
                cancela y el sistema crea una donacion nueva, ya aprobada, por las unidades que
                si llegaron. No hay recepcion parcial.
              </p>
            }
            @if (accion() === 'entrega') {
              <p class="dato">
                La entrega debe ser por las {{ a.cantidadAsignada }} unidades completas.
              </p>
              <p class="aviso info" style="margin:.4rem 0">
                Esta foto se enviara al donador por su bandeja. Fotografia el producto entregado y
                evita que se vea el rostro o datos del estudiante.
              </p>
            }

            <label>Nombre de quien {{ accion() === 'recepcion' ? 'entrega' : 'recibe' }}</label>
            <input
              [value]="contraparte()"
              (input)="contraparte.set($any($event.target).value)"
              placeholder="Nombre completo"
            />

            <label>Fotografia (obligatoria)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              (change)="elegirFoto($event)"
            />
            @if (foto()) { <p class="dato">Imagen lista: {{ foto()!.nombreOriginal }}</p> }

            <label>Observaciones (opcional)</label>
            <textarea
              [value]="observaciones()"
              (input)="observaciones.set($any($event.target).value)"
            ></textarea>

            <div class="fila" style="margin-top:.75rem">
              <button [disabled]="!puedeGuardar() || enviando()" (click)="guardar(a)">
                {{ enviando() ? 'Guardando...' : 'Confirmar movimiento' }}
              </button>
              <button class="secundario" (click)="cerrar()">Cancelar</button>
            </div>
          </div>
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

  filtros = [
    { valor: 'ASIGNADO,EN_CUSTODIA', texto: 'Abiertas' },
    { valor: 'ASIGNADO', texto: 'Por recibir' },
    { valor: 'EN_CUSTODIA', texto: 'En custodia' },
    { valor: 'DEVOLUCION', texto: 'En devolucion' },
    { valor: 'ENTREGADO', texto: 'Entregadas' },
    { valor: 'CANCELADO', texto: 'Canceladas' },
  ];

  asignaciones = signal<AsignacionResumen[]>([]);
  filtro = signal('ASIGNADO,EN_CUSTODIA');
  abierta = signal<number | null>(null);
  accion = signal<Accion>('recepcion');
  cantidad = signal('1');
  contraparte = signal('');
  observaciones = signal('');
  foto = signal<FotoEnviable | null>(null);
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

  private cargar(): void {
    this.api.asignaciones(this.filtro()).subscribe({
      next: (a) => this.asignaciones.set(a),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  abrir(a: AsignacionResumen, accion: Accion): void {
    this.abierta.set(a.id);
    this.accion.set(accion);
    this.cantidad.set(String(a.cantidadAsignada));
    this.contraparte.set('');
    this.observaciones.set('');
    this.foto.set(null);
    this.error.set(null);
  }

  cerrar(): void {
    this.abierta.set(null);
    this.foto.set(null);
  }

  tituloAccion(): string {
    const mapa: Record<Accion, string> = {
      recepcion: 'Recepcion fisica del producto',
      entrega: 'Entrega al estudiante',
      devolucion: 'Salida del producto hacia el donador',
    };
    return mapa[this.accion()];
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

  puedeGuardar(): boolean {
    return (
      !!this.foto() && this.contraparte().trim().length >= 3 && Number(this.cantidad()) >= 1
    );
  }

  guardar(a: AsignacionResumen): void {
    this.enviando.set(true);
    this.error.set(null);
    const datos = {
      cantidad: Number(this.cantidad()),
      nombreContraparte: this.contraparte().trim(),
      foto: this.foto(),
      observaciones: this.observaciones().trim() || undefined,
    };

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
            `Recepcion incompleta registrada. Se creo la donacion ` +
            `#${r.ofertaGeneradaPorFaltante} con las unidades que si llegaron, lista para ` +
            'reasignar.';
        } else if (this.accion() === 'recepcion') {
          texto = 'Producto recibido y en custodia del LIS.';
        } else if (this.accion() === 'entrega') {
          texto = 'Entrega registrada. La peticion queda cerrada por entrega.';
        } else {
          texto = 'Devolucion registrada.';
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

  cancelar(a: AsignacionResumen): void {
    const motivo = prompt('Motivo de la cancelacion (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.cancelarAsignacion(a.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Asignacion #${a.id} cancelada.`);
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
    const motivo = prompt('Motivo de la devolucion (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.marcarDevolucion(a.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Asignacion #${a.id} pasa a devolucion.`);
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
      DEVOLUCION: 'En devolucion',
      CANCELADO: 'Cancelado',
    };
    return mapa[estado] ?? estado;
  }
}
