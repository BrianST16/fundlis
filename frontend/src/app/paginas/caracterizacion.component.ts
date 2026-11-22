import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { FormularioCaracterizacion, MiCaracterizacion } from '../core/modelos';
import { mensajeError, porcentaje } from '../core/utilidades';

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
        Caracterizacion registrada. Puntaje actual: <strong>{{ pct(a.puntajeTotal) }}</strong>
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
          En el MVP no se exige cargar el certificado: basta con seleccionar el grupo.
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
  pct = porcentaje;

  ngOnInit(): void {
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
          `Guardada. Tu puntaje de caracterizacion es ${porcentaje(r.puntajeTotal)}.`,
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
