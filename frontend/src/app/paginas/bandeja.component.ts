import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import { FotoComponent } from '../compartido/foto.component';
import { NotificacionBandeja } from '../core/modelos';
import { fecha, mensajeError, textoLegible } from '../core/utilidades';

/** Bandeja interna: unico canal de notificaciones mientras el correo esta
 *  fuera del alcance (D-53). */
@Component({
  selector: 'lis-bandeja',
  standalone: true,
  imports: [CommonModule, FotoComponent, PaginadorComponent],
  template: `
    <h1 #tBandeja>Bandeja</h1>
    <p class="subtitulo">
      Avisos sobre tus donaciones, peticiones y plazos.
    </p>
    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    <div class="fila" style="margin-bottom:1rem">
      <button class="pequeno" [class.secundario]="!soloNoLeidas()" (click)="filtrar(true)">No leídas</button>
      <button class="pequeno" [class.secundario]="soloNoLeidas()" (click)="filtrar(false)">Todas</button>
      <button class="secundario pequeno" (click)="todas()">Marcar todas como leídas</button>
    </div>
    @for (n of pag.visibles(); track n.id) {
      <div class="tarjeta" [style.opacity]="n.leida ? 0.65 : 1">
        <div class="fila">
          @if (!n.leida) { <span class="etiqueta">Nuevo</span> }
          <strong>{{ legible(n.titulo) }}</strong>
          <span class="dato">{{ f(n.creadaEn) }}</span>
        </div>
        <p style="margin:.4rem 0">{{ legible(n.mensaje) }}</p>
        @if (n.evidenciaId) {
          <!-- D-51: foto adjunta (p. ej. entrega final). Clic para ampliar. -->
          <div style="max-width:260px; margin-bottom:.4rem">
            <lis-foto [evidenciaId]="n.evidenciaId" [alt]="n.titulo" />
          </div>
        }
        @if (!n.leida) { <button class="secundario pequeno" (click)="leer(n)">Marcar como leída</button> }
      </div>
    } @empty { <p class="vacio">No tienes avisos.</p> }
    <lis-paginador [control]="pag" [destino]="tBandeja" />
  `,
})
export class BandejaComponent implements OnInit {
  private api = inject(ApiService);

  lista = signal<NotificacionBandeja[]>([]);
  pag = new Paginado(this.lista, 50);
  soloNoLeidas = signal(false);
  error = signal<string | null>(null);
  f = fecha;
  /** Titulos y mensajes del servidor sin codigos internos. */
  legible = textoLegible;

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api.notificaciones(this.soloNoLeidas()).subscribe({
      next: (l) => this.lista.set(l),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  filtrar(v: boolean): void {
    this.pag.reiniciar();
    this.soloNoLeidas.set(v);
    this.cargar();
  }

  leer(n: NotificacionBandeja): void {
    this.api.marcarLeida(n.id).subscribe({ next: () => this.cargar() });
  }

  todas(): void {
    this.api.marcarTodasLeidas().subscribe({ next: () => this.cargar() });
  }
}
