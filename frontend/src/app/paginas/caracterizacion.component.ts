import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import {
  CertificadoMeta,
  EstadoRevisionCertificado,
  FormularioCaracterizacion,
  MiCaracterizacion,
} from '../core/modelos';
import { abrirBlob, fecha, leerComoCertificado, mensajeError, puntaje } from '../core/utilidades';

/** Caracterizacion del estudiante: preguntas de opcion unica y grupo Sisben.
 *  Es requisito para crear peticiones, porque de aqui sale el puntaje de
 *  prioridad que usa el emparejamiento. */
@Component({
  selector: 'lis-caracterizacion',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Mi caracterizacion</h1>
    <p class="subtitulo">
      Estos datos solo los consulta el administrador del LIS y se usan para calcular la
      prioridad cuando una donacion coincide con tu necesidad. Puedes actualizarlos cuando
      cambie tu situacion.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (guardado()) { <div class="aviso ok">{{ guardado() }}</div> }

    @if (actual(); as a) {
      <div class="aviso info">
        Caracterizacion registrada. Puntaje actual: <strong>{{ pt(a.puntajeTotal) }}</strong>
        <span class="dato">(escala de 0 a 1; 1 = mayor necesidad)</span>
        &middot; grupo Sisben <strong>{{ a.grupoSisben }}</strong>.
      </div>
    }

    @if (formulario(); as form) {
      <div class="tarjeta">
        @for (p of form.preguntas; track p.id) {
          <label>{{ p.orden }}. {{ p.texto }}</label>
          <select [value]="respuestas()[p.id] ?? ''" (change)="responder(p.id, $any($event.target).value)">
            <option value="">Selecciona una opcion</option>
            @for (o of p.opciones; track o.id) {
              <option [value]="o.id">{{ o.texto }}</option>
            }
          </select>
        }

        <label>Grupo Sisben</label>
        <select [value]="grupo()" (change)="grupo.set($any($event.target).value)">
          <option value="">Selecciona tu grupo</option>
          @for (g of form.gruposSisben; track g.codigo) {
            <option [value]="g.codigo">{{ g.codigo }} &mdash; {{ g.descripcion }}</option>
          }
        </select>
        <p class="dato" style="margin-top:.5rem">
          En el MVP no se exige cargar el certificado Sisben: basta con seleccionar el grupo.
        </p>

        <div class="fila" style="margin-top:1rem">
          <button [disabled]="!completo() || enviando()" (click)="guardar()">
            {{ enviando() ? 'Guardando...' : 'Guardar caracterizacion' }}
          </button>
          @if (!completo()) {
            <span class="dato">Responde todas las preguntas y elige tu grupo Sisben.</span>
          }
        </div>
      </div>
    } @else {
      <p class="vacio">Cargando formulario...</p>
    }

    <h2>Certificado de estudio vigente (opcional)</h2>
    <div class="tarjeta">
      <p class="dato">
        Ayuda al LIS a confirmar que eres estudiante (el correo institucional tambien lo tienen
        profesores y administrativos). Por ahora es opcional: no afecta tu puntaje ni te impide
        registrar peticiones. Solo lo ve el administrador. PDF, JPEG o PNG, maximo 2 MB.
      </p>

      @if (errorCert()) { <div class="aviso error">{{ errorCert() }}</div> }
      @if (mensajeCert()) { <div class="aviso ok">{{ mensajeCert() }}</div> }

      @if (certificado(); as c) {
        <div class="fila">
          <span class="etiqueta"
                [class.gris]="c.estadoRevision === 'PENDIENTE'"
                [class.roja]="c.estadoRevision === 'RECHAZADO'">{{ legibleCert(c.estadoRevision) }}</span>
          <span class="dato">{{ c.nombreOriginal ?? 'certificado' }} &middot; {{ kb(c.tamanoBytes) }} &middot; subido {{ f(c.subidoEn) }}</span>
        </div>
        @if (c.observacion) { <p class="dato">Observacion del LIS: <em>{{ c.observacion }}</em></p> }
        <div class="fila" style="margin-top:.5rem">
          <button class="secundario pequeno" (click)="verCertificado()">Ver</button>
          <button class="peligro pequeno" (click)="eliminarCertificado()">Quitar</button>
        </div>
      } @else {
        <p class="vacio">No has cargado certificado.</p>
      }

      <label>{{ certificado() ? 'Reemplazar certificado' : 'Cargar certificado' }}</label>
      <input type="file" accept="application/pdf,image/jpeg,image/png"
             [disabled]="subiendo()" (change)="subirCertificado($event)" />
      @if (subiendo()) { <span class="dato">Subiendo...</span> }
    </div>
  `,
})
export class CaracterizacionComponent implements OnInit {
  private api = inject(ApiService);

  formulario = signal<FormularioCaracterizacion | null>(null);
  actual = signal<MiCaracterizacion | null>(null);
  respuestas = signal<Record<number, number>>({});
  grupo = signal('');
  error = signal<string | null>(null);
  guardado = signal<string | null>(null);
  enviando = signal(false);
  pt = puntaje;
  f = fecha;

  certificado = signal<CertificadoMeta | null>(null);
  errorCert = signal<string | null>(null);
  mensajeCert = signal<string | null>(null);
  subiendo = signal(false);

  async subirCertificado(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.errorCert.set(null);
    this.mensajeCert.set(null);
    let datos;
    try {
      datos = await leerComoCertificado(archivo);
    } catch (e: any) {
      this.errorCert.set(e.message);
      return;
    }
    this.subiendo.set(true);
    this.api.subirCertificado(datos).subscribe({
      next: (c) => {
        this.certificado.set(c);
        this.mensajeCert.set('Certificado cargado. Queda pendiente de revision del administrador.');
        this.subiendo.set(false);
      },
      error: (e) => {
        this.errorCert.set(mensajeError(e, 'No se pudo cargar el certificado.'));
        this.subiendo.set(false);
      },
    });
  }

  verCertificado(): void {
    this.api.archivoMiCertificado().subscribe({
      next: (b) => abrirBlob(b, this.certificado()?.nombreOriginal ?? 'certificado'),
      error: (e) => this.errorCert.set(mensajeError(e, 'No se pudo abrir el certificado.')),
    });
  }

  eliminarCertificado(): void {
    if (!confirm('Quitar tu certificado de estudio?')) return;
    this.api.eliminarCertificado().subscribe({
      next: () => {
        this.certificado.set(null);
        this.mensajeCert.set('Certificado retirado.');
      },
      error: (e) => this.errorCert.set(mensajeError(e)),
    });
  }

  legibleCert(e: EstadoRevisionCertificado): string {
    return { PENDIENTE: 'Pendiente de revision', VALIDADO: 'Validado', RECHAZADO: 'Rechazado' }[e];
  }

  kb(bytes: number): string {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  ngOnInit(): void {
    this.api.miCertificado().subscribe({ next: (c) => this.certificado.set(c), error: () => {} });
    this.api.formularioCaracterizacion().subscribe({
      next: (f) => this.formulario.set(f),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el formulario.')),
    });
    this.api.miCaracterizacion().subscribe({
      next: (c) => {
        if (!c) return;
        this.actual.set(c);
        this.grupo.set(c.grupoSisben);
        const mapa: Record<number, number> = {};
        for (const r of c.respuestas) mapa[r.preguntaId] = r.opcionId;
        this.respuestas.set(mapa);
      },
      error: () => {},
    });
  }

  responder(preguntaId: number, opcionId: string): void {
    const mapa = { ...this.respuestas() };
    if (opcionId) mapa[preguntaId] = Number(opcionId);
    else delete mapa[preguntaId];
    this.respuestas.set(mapa);
  }

  completo(): boolean {
    const form = this.formulario();
    if (!form || !this.grupo()) return false;
    return form.preguntas.every((p) => this.respuestas()[p.id] !== undefined);
  }

  guardar(): void {
    this.enviando.set(true);
    this.error.set(null);
    this.guardado.set(null);
    const respuestas = Object.entries(this.respuestas()).map(([preguntaId, opcionId]) => ({
      preguntaId: Number(preguntaId),
      opcionId: Number(opcionId),
    }));
    this.api.guardarCaracterizacion({ grupoSisben: this.grupo(), respuestas }).subscribe({
      next: (r) => {
        this.guardado.set(
          `Guardada. Tu puntaje de caracterizacion es ${puntaje(r.puntajeTotal)} (escala de 0 a 1).`,
        );
        this.actual.set({ ...(this.actual() ?? ({} as MiCaracterizacion)), ...r });
        this.enviando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo guardar.'));
        this.enviando.set(false);
      },
    });
  }
}
