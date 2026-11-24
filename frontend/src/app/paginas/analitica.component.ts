import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import {
  AlertasComportamiento,
  FilaRankingDonador,
  FilaRankingEstudiante,
  Indicadores,
} from '../core/modelos';
import { mensajeError } from '../core/utilidades';

/**
 * Pilar C: indicadores operativos, rankings de comportamiento y alertas.
 * El ranking es independiente de la prioridad de emparejamiento (D-27):
 * no la modifica.
 */
@Component({
  selector: 'lis-analitica',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Analitica</h1>
    <p class="subtitulo">
      Estudiantes: reputacion = 0.85 &times; cumplimiento + 0.15 &times; actividad (pesos configurables,
      propuesta P-11), con cumplimiento = (exitos + 1) / (exitos + fallos + 2). Donadores: indicador
      directo de cumplimiento (D-40). Los rankings no alteran la prioridad socioeconomica del
      emparejamiento.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }

    @if (ind(); as i) {
      <h2>Indicadores</h2>
      <div class="rejilla">
        <div class="tarjeta"><p class="dato">Unidades ofertadas (aprobadas)</p><h3>{{ i.unidadesOfertadas }}</h3></div>
        <div class="tarjeta"><p class="dato">Unidades entregadas</p><h3>{{ i.unidadesEntregadas }}</h3></div>
        <div class="tarjeta"><p class="dato">Tasa de entrega (intentos cerrados)</p><h3>{{ pct(i.tasaEntrega) }}</h3></div>
        <div class="tarjeta"><p class="dato">Peticiones atendidas</p><h3>{{ pct(i.tasaAtencionPeticiones) }}</h3></div>
        <div class="tarjeta"><p class="dato">Dias promedio asignacion &rarr; recepcion</p><h3>{{ i.diasPromedioAsignacionARecepcion ?? '—' }}</h3></div>
        <div class="tarjeta"><p class="dato">Dias promedio recepcion &rarr; entrega</p><h3>{{ i.diasPromedioRecepcionAEntrega ?? '—' }}</h3></div>
      </div>
      <p class="dato">
        Intentos:
        @for (e of claves(i.asignacionesPorEstado); track e) { {{ e }} {{ i.asignacionesPorEstado[e] }} &middot; }
      </p>
    }

    @if (alertas(); as a) {
      <h2>Alertas de incumplimiento</h2>
      <p class="dato">
        Se alerta con {{ a.regla.umbralFallos }} o mas fallos, o con reputacion (estudiantes) o
        cumplimiento (donadores) menor a {{ pct(a.regla.umbralReputacion) }} cuando hay historial.
        Es informativo: no bloquea a nadie.
      </p>
      @if (!a.estudiantes.length && !a.donadores.length) { <p class="vacio">Sin alertas.</p> }
      @for (x of a.estudiantes; track x.usuarioId) {
        <div class="aviso error">Estudiante <strong>{{ x.nombre }}</strong> ({{ x.email }}): {{ x.motivos.join(', ') }}
          &middot; incumplimientos {{ x.incumplimientos }}</div>
      }
      @for (x of a.donadores; track x.usuarioId) {
        <div class="aviso error">Donador <strong>{{ x.nombre }}</strong> ({{ x.email }}): {{ x.motivos.join(', ') }}
          &middot; fallidas {{ x.fallidas }}</div>
      }
    }

    <h2>Ranking de estudiantes</h2>
    <table>
      <thead><tr><th>#</th><th>Estudiante</th><th>Peticiones</th><th>Ayudas</th><th>Incumplimientos</th><th>Cumplimiento</th><th>Reputacion</th></tr></thead>
      <tbody>
        @for (f of estudiantes(); track f.usuarioId) {
          <tr><td>{{ f.posicion }}</td><td>{{ f.nombre }}<br /><span class="dato">{{ f.email }}</span></td>
            <td>{{ f.peticiones }}</td><td>{{ f.ayudasRecibidas }}</td><td>{{ f.incumplimientos }}</td>
            <td>{{ f.cumplimiento | number: '1.3-3' }}</td><td><strong>{{ f.reputacion | number: '1.3-3' }}</strong></td></tr>
        } @empty { <tr><td colspan="7" class="vacio">Sin datos.</td></tr> }
      </tbody>
    </table>

    <h2>Ranking de donadores</h2>
    <p class="dato">
      Cumplimiento = donaciones completadas / (completadas + fallidas). Completada: el producto llego
      completo al LIS. Las pendientes no cuentan hasta cerrarse.
      @if (donadores().length) {
        &#9733; Recurrente: {{ donadores()[0].umbralRecurrente }} o mas donaciones completadas.
      }
    </p>
    <table>
      <thead><tr><th>#</th><th>Donador</th><th>Compromisos</th><th>Completadas</th><th>Fallidas</th><th>Pendientes</th><th>Cumplimiento</th></tr></thead>
      <tbody>
        @for (f of donadores(); track f.usuarioId) {
          <tr><td>{{ f.posicion }}</td>
            <td>
              {{ f.nombre }}
              @if (f.recurrente) { <span class="etiqueta" title="{{ f.umbralRecurrente }} o mas donaciones completadas">&#9733; Recurrente</span> }
              <br /><span class="dato">{{ f.email }}</span>
            </td>
            <td>{{ f.compromisos }}</td><td>{{ f.completadas }}</td><td>{{ f.fallidas }}</td><td>{{ f.pendientes }}</td>
            <td><strong>{{ pct(f.tasaCumplimiento) }}</strong>
              @if (f.tasaCumplimiento === null) { <br /><span class="dato">sin donaciones cerradas</span> }
            </td></tr>
        } @empty { <tr><td colspan="7" class="vacio">Sin datos.</td></tr> }
      </tbody>
    </table>
  `,
})
export class AnaliticaComponent implements OnInit {
  private api = inject(ApiService);

  ind = signal<Indicadores | null>(null);
  estudiantes = signal<FilaRankingEstudiante[]>([]);
  donadores = signal<FilaRankingDonador[]>([]);
  alertas = signal<AlertasComportamiento | null>(null);
  error = signal<string | null>(null);

  ngOnInit(): void {
    const fallo = (e: unknown) => this.error.set(mensajeError(e));
    this.api.indicadores().subscribe({ next: (x) => this.ind.set(x), error: fallo });
    this.api.rankingEstudiantes().subscribe({ next: (x) => this.estudiantes.set(x), error: fallo });
    this.api.rankingDonadores().subscribe({ next: (x) => this.donadores.set(x), error: fallo });
    this.api.alertasComportamiento().subscribe({ next: (x) => this.alertas.set(x), error: fallo });
  }

  pct(x: number | null): string {
    return x === null ? '—' : `${(x * 100).toFixed(1)} %`;
  }

  claves(o: Record<string, number>): string[] {
    return Object.keys(o);
  }
}
