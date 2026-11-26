import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import {
  AlertasComportamiento,
  FilaRankingDonador,
  FilaRankingEstudiante,
  Indicadores,
} from '../core/modelos';
import { estadoLegible, mensajeError } from '../core/utilidades';

/**
 * Pilar C: indicadores operativos, rankings de comportamiento y alertas.
 * El ranking es independiente de la prioridad de emparejamiento (D-27):
 * no la modifica.
 */
@Component({
  selector: 'lis-analitica',
  standalone: true,
  imports: [CommonModule, PaginadorComponent],
  template: `
    <h1>Analítica</h1>
    <p class="subtitulo">
      Indicadores, alertas y cumplimiento. No cambian la prioridad del emparejamiento.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }

    @if (ind(); as i) {
      <h2>Indicadores</h2>
      <div class="rejilla">
        <div class="tarjeta"><p class="dato">Unidades ofertadas (aprobadas)</p><h3>{{ i.unidadesOfertadas }}</h3></div>
        <div class="tarjeta"><p class="dato">Unidades entregadas</p><h3>{{ i.unidadesEntregadas }}</h3></div>
        <div class="tarjeta"><p class="dato">Tasa de entrega</p><h3>{{ pct(i.tasaEntrega) }}</h3></div>
        <div class="tarjeta"><p class="dato">Peticiones atendidas</p><h3>{{ pct(i.tasaAtencionPeticiones) }}</h3></div>
        <div class="tarjeta"><p class="dato">Días promedio asignación &rarr; recepción</p><h3>{{ i.diasPromedioAsignacionARecepcion ?? '—' }}</h3></div>
        <div class="tarjeta"><p class="dato">Días promedio recepción &rarr; entrega</p><h3>{{ i.diasPromedioRecepcionAEntrega ?? '—' }}</h3></div>
      </div>
      <p class="dato">
        Asignaciones: @for (e of claves(i.asignacionesPorEstado); track e) { {{ estadoAsignacion(e) }} {{ i.asignacionesPorEstado[e] }} &middot; }
      </p>
    }

    @if (alertas(); as a) {
      <h2>Alertas de incumplimiento</h2>
      <p class="dato">
        Con {{ a.regla.umbralFallos }} o más fallos, o cumplimiento menor a {{ pct(a.regla.umbralReputacion) }}. Es informativo y se avisa al personal del LIS.
      </p>
      @if (!a.estudiantes.length && !a.donadores.length) { <p class="vacio">Sin alertas.</p> }
      @for (x of a.estudiantes; track x.usuarioId) {
        <div class="aviso error">Estudiante <strong>{{ x.nombre }}</strong> ({{ x.email }}): {{ motivosLegibles(x.motivos) }}
          &middot; incumplimientos {{ x.incumplimientos }}</div>
      }
      @for (x of a.donadores; track x.usuarioId) {
        <div class="aviso error">Donador <strong>{{ x.nombre }}</strong> ({{ x.email }}): {{ motivosLegibles(x.motivos) }}
          &middot; fallidas {{ x.fallidas }}</div>
      }
    }

    <h2 #tEstudiantes>Ranking de estudiantes</h2>
    <div class="fila" style="margin-bottom:.6rem">
      <button class="pequeno" [class.secundario]="soloRiesgo()" (click)="verSoloRiesgo(false)">Todos ({{ estudiantes().length }})</button>
      <button class="pequeno" [class.secundario]="!soloRiesgo()" (click)="verSoloRiesgo(true)">
        &#9888; Solo en riesgo ({{ riesgo().size }})
      </button>
    </div>
    <table>
      <thead><tr><th>#</th><th>Estudiante</th><th>Peticiones</th><th>Ayudas</th><th>Incumplimientos</th><th>Cumplimiento</th><th>Reputación</th></tr></thead>
      <tbody>
        @for (f of pagEstudiantes.visibles(); track f.usuarioId) {
          <tr [class.en-riesgo]="riesgo().has(f.usuarioId)">
            <td>{{ f.posicion }}</td>
            <td>
              {{ f.nombre }}
              @if (riesgo().get(f.usuarioId); as motivos) {
                <span class="etiqueta roja" [title]="'Motivos: ' + motivosLegibles(motivos)">&#9888; En riesgo</span>
                <br /><span class="dato riesgo">{{ motivosLegibles(motivos) }}</span>
              }
              <br /><span class="dato">{{ f.email }}</span>
            </td>
            <td>{{ f.peticiones }}</td><td>{{ f.ayudasRecibidas }}</td><td>{{ f.incumplimientos }}</td>
            <td>{{ f.cumplimiento | number: '1.3-3' }}</td><td><strong>{{ f.reputacion | number: '1.3-3' }}</strong></td></tr>
        } @empty { <tr><td colspan="7" class="vacio">{{ soloRiesgo() ? 'Ningún estudiante en riesgo.' : 'Sin datos.' }}</td></tr> }
      </tbody>
    </table>
    <lis-paginador [control]="pagEstudiantes" [destino]="tEstudiantes" />

    <h2 #tDonadores>Ranking de donadores</h2>
    <p class="dato">
      Cumplimiento: donaciones completas sobre las cerradas.
      @if (donadores().length) {
        &#9733; Recurrente: {{ donadores()[0].umbralRecurrente }} o más completadas. }
    </p>
    <table>
      <thead><tr><th>#</th><th>Donador</th><th>Compromisos</th><th>Completadas</th><th>Fallidas</th><th>Pendientes</th><th>Cumplimiento</th></tr></thead>
      <tbody>
        @for (f of pagDonadores.visibles(); track f.usuarioId) {
          <tr><td>{{ f.posicion }}</td>
            <td>
              {{ f.nombre }}
              @if (f.recurrente) { <span class="etiqueta" title="{{ f.umbralRecurrente }} o más donaciones completadas">&#9733; Recurrente</span> }
              <br /><span class="dato">{{ f.email }}</span>
            </td>
            <td>{{ f.compromisos }}</td><td>{{ f.completadas }}</td><td>{{ f.fallidas }}</td><td>{{ f.pendientes }}</td>
            <td><strong>{{ pct(f.tasaCumplimiento) }}</strong>
              @if (f.tasaCumplimiento === null) { <br /><span class="dato">sin donaciones cerradas</span> }
            </td></tr>
        } @empty { <tr><td colspan="7" class="vacio">Sin datos.</td></tr> }
      </tbody>
    </table>
    <lis-paginador [control]="pagDonadores" [destino]="tDonadores" />
  `,
})
export class AnaliticaComponent implements OnInit {
  estadoAsignacion = estadoLegible;
  private api = inject(ApiService);

  ind = signal<Indicadores | null>(null);
  estudiantes = signal<FilaRankingEstudiante[]>([]);
  donadores = signal<FilaRankingDonador[]>([]);
  alertas = signal<AlertasComportamiento | null>(null);
  error = signal<string | null>(null);

  /** Estudiantes en alerta de incumplimiento (misma regla del backend), por id. */
  riesgo = computed(() => new Map((this.alertas()?.estudiantes ?? []).map((x) => [x.usuarioId, x.motivos])));
  soloRiesgo = signal(false);
  private estudiantesVista = computed(() =>
    this.soloRiesgo() ? this.estudiantes().filter((f) => this.riesgo().has(f.usuarioId)) : this.estudiantes(),
  );
  pagEstudiantes = new Paginado(this.estudiantesVista, 15);
  pagDonadores = new Paginado(this.donadores, 15);

  verSoloRiesgo(v: boolean): void {
    this.soloRiesgo.set(v);
    this.pagEstudiantes.reiniciar();
  }

  motivosLegibles(m: string[]): string {
    const mapa: Record<string, string> = {
      FALLOS_REPETIDOS: 'fallos repetidos',
      REPUTACION_BAJA: 'reputación baja',
      TASA_BAJA: 'cumplimiento bajo',
    };
    return m.map((x) => mapa[x] ?? x).join(', ');
  }

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
