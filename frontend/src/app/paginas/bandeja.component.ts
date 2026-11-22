import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NotificacionBandeja } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Bandeja interna (canal 1 de D-42). El canal 2 es el correo al email registrado. */
@Component({
  selector: 'lis-bandeja',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Bandeja</h1>
    <p class="subtitulo">
      Avisos de la plataforma. Cada aviso tambien se envia a tu correo registrado cuando el
      servidor de correo esta configurado.
    </p>
    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (correo(); as c) {
      <div class="aviso" [class.info]="c.smtpConfigurado" [class.error]="!c.smtpConfigurado">
        Canal de correo: {{ c.smtpConfigurado ? 'configurado' : 'SIN configurar (solo bandeja interna)' }}
        &middot; @for (k of claves(c.porEstado); track k) { {{ k }}: {{ c.porEstado[k] }} &nbsp; }
      </div>
    }
    <div class="fila" style="margin-bottom:1rem">
      <button class="pequeno" [class.secundario]="!soloNoLeidas()" (click)="filtrar(true)">No leidas</button>
      <button class="pequeno" [class.secundario]="soloNoLeidas()" (click)="filtrar(false)">Todas</button>
      <button class="secundario pequeno" (click)="todas()">Marcar todas como leidas</button>
    </div>
    @for (n of lista(); track n.id) {
      <div class="tarjeta" [style.opacity]="n.leida ? 0.65 : 1">
        <div class="fila">
          @if (!n.leida) { <span class="etiqueta">nuevo</span> }
          <strong>{{ n.titulo }}</strong>
          <span class="dato">{{ f(n.creadaEn) }}</span>
        </div>
        <p style="margin:.4rem 0">{{ n.mensaje }}</p>
        @if (!n.leida) { <button class="secundario pequeno" (click)="leer(n)">Marcar como leida</button> }
      </div>
    } @empty { <p class="vacio">No tienes avisos.</p> }
  `,
})
export class BandejaComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  lista = signal<NotificacionBandeja[]>([]);
  soloNoLeidas = signal(false);
  correo = signal<{ smtpConfigurado: boolean; porEstado: Record<string, number> } | null>(null);
  error = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.cargar();
    if (this.auth.esAdministrador()) {
      this.api.estadoCorreo().subscribe({ next: (c) => this.correo.set(c) });
    }
  }

  private cargar(): void {
    this.api.notificaciones(this.soloNoLeidas()).subscribe({
      next: (l) => this.lista.set(l),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  filtrar(v: boolean): void {
    this.soloNoLeidas.set(v);
    this.cargar();
  }

  leer(n: NotificacionBandeja): void {
    this.api.marcarLeida(n.id).subscribe({ next: () => this.cargar() });
  }

  todas(): void {
    this.api.marcarTodasLeidas().subscribe({ next: () => this.cargar() });
  }

  claves(o: Record<string, number>): string[] {
    return Object.keys(o);
  }
}
