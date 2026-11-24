import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FotoComponent } from '../compartido/foto.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { FilaRankingDonador, OfertaCatalogo, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Cola de revision del personal del LIS: ofertas y peticiones pendientes. */
@Component({
  selector: 'lis-aprobaciones',
  standalone: true,
  imports: [CommonModule, FotoComponent],
  template: `
    <h1>Aprobaciones</h1>
    <p class="subtitulo">
      Revisa lo que publican donadores y estudiantes. Solo lo aprobado entra al catalogo y al
      emparejamiento.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <h2>Donaciones pendientes ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">No hay donaciones por revisar.</p>
    }
    <div class="rejilla">
      @for (o of ofertas(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <lis-foto [evidenciaId]="o.fotoId" [alt]="o.nombreProducto" />
          }
          <span class="etiqueta gris">{{ o.categoria.nombre }}</span>
          <h3 style="margin:.5rem 0 .25rem; font-size:1rem">{{ o.nombreProducto }}</h3>
          <p class="dato">{{ o.descripcion }}</p>
          <p class="dato">
            Cantidad: <strong>{{ o.cantidadOfertada }}</strong>
          </p>
          @if (o.donador; as d) {
            <p class="dato">Donador: <strong>{{ d.nombre }}</strong> &middot; {{ d.email }}</p>
            @if (historialDonador(d.id); as h) {
              @if (h.recurrente) {
                <span class="etiqueta" title="Tiene {{ h.umbralRecurrente }} o mas donaciones que llegaron completas al LIS">
                  &#9733; Donador recurrente
                </span>
              }
              <p class="dato" style="margin:.3rem 0 0">
                {{ h.completadas }} completada(s) &middot; {{ h.fallidas }} fallida(s)
                @if (h.tasaCumplimiento !== null) { &middot; cumplimiento {{ pct(h.tasaCumplimiento) }} }
              </p>
            } @else {
              <p class="dato" style="margin:.3rem 0 0">Donador nuevo: aun sin donaciones completadas.</p>
            }
          }
          <p class="dato">#{{ o.id }} &middot; {{ f(o.publicadaEn) }}</p>
          @if (esPropia(o)) {
            <span class="etiqueta ambar">Tu donacion</span>
          }
          @if (esPropia(o) && !auth.esAdministrador()) {
            <p class="dato" style="margin-top:.6rem">
              No puedes revisar tu propia donacion: la aprueba o rechaza otro auxiliar o un
              administrador.
            </p>
          } @else {
            <div class="fila" style="margin-top:.6rem">
              <button class="pequeno" (click)="aprobarOferta(o)">
                {{ esPropia(o) ? 'Aprobar (propia)' : 'Aprobar' }}
              </button>
              <button class="peligro pequeno" (click)="rechazarOferta(o)">Rechazar</button>
            </div>
          }
        </div>
      }
    </div>

    <h2>Peticiones pendientes ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">No hay peticiones por revisar.</p>
    }
    <div class="rejilla">
      @for (p of peticiones(); track p.id) {
        <div class="tarjeta">
          <span class="etiqueta gris">{{ p.categoria.nombre }}</span>
          <p style="margin:.5rem 0 .25rem">{{ p.descripcion }}</p>
          @if (p.estudiante; as e) {
            <p class="dato">Estudiante: <strong>{{ e.nombre }}</strong> &middot; {{ e.email }}</p>
          }
          <p class="dato">#{{ p.id }} &middot; {{ f(p.publicadaEn) }}</p>
          <div class="fila" style="margin-top:.6rem">
            <button class="pequeno" (click)="aprobarPeticion(p)">Aprobar</button>
            <button class="peligro pequeno" (click)="rechazarPeticion(p)">Rechazar</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AprobacionesComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  /** Ayuda visual; la regla real (D-47) la aplica el backend. */
  esPropia(o: OfertaCatalogo): boolean {
    return !!o.donador && o.donador.id === this.auth.sesion()?.sub;
  }

  ofertas = signal<OfertaCatalogo[]>([]);
  peticiones = signal<PeticionVista[]>([]);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  f = fecha;

  /** D-49: historial de cada donador segun el ranking (pilar analitico). */
  private ranking = signal<Map<number, FilaRankingDonador>>(new Map());

  /** null si el donador aun no tiene compromisos registrados. */
  historialDonador(donadorId: number): FilaRankingDonador | null {
    const h = this.ranking().get(donadorId);
    return h && h.compromisos > 0 ? h : null;
  }

  pct(x: number): string {
    return `${Math.round(x * 100)}%`;
  }

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    // Si el ranking falla, las aprobaciones siguen funcionando sin insignias.
    this.api.rankingDonadores().subscribe({
      next: (r) => this.ranking.set(new Map(r.map((f) => [f.usuarioId, f]))),
      error: () => this.ranking.set(new Map()),
    });
    this.api.ofertasPendientes().subscribe({
      next: (o) => this.ofertas.set(o),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.peticionesPendientes().subscribe({
      next: (p) => this.peticiones.set(p),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  aprobarOferta(o: OfertaCatalogo): void {
    this.api.aprobarOferta(o.id).subscribe({
      next: () => this.hecho(`Donacion #${o.id} aprobada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  rechazarOferta(o: OfertaCatalogo): void {
    const motivo = prompt('Motivo del rechazo (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.rechazarOferta(o.id, motivo.trim()).subscribe({
      next: () => this.hecho(`Donacion #${o.id} rechazada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  aprobarPeticion(p: PeticionVista): void {
    this.api.aprobarPeticion(p.id).subscribe({
      next: () => this.hecho(`Peticion #${p.id} aprobada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  rechazarPeticion(p: PeticionVista): void {
    const motivo = prompt('Motivo del rechazo (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.rechazarPeticion(p.id, motivo.trim()).subscribe({
      next: () => this.hecho(`Peticion #${p.id} rechazada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private hecho(texto: string): void {
    this.mensaje.set(texto);
    this.error.set(null);
    this.cargar();
  }
}
