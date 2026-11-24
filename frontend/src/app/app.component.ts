import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ApiService } from './core/api.service';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'lis-raiz',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="barra">
      <span class="marca">LIS Dona</span>

      <a routerLink="/catalogo" routerLinkActive="activo">Catalogo</a>

      @if (auth.esEstudiante()) {
        <a routerLink="/mis-peticiones" routerLinkActive="activo">Mis peticiones</a>
        <a routerLink="/caracterizacion" routerLinkActive="activo">Mi caracterizacion</a>
      }

      @if (auth.esDonador()) {
        <a routerLink="/mis-ofertas" routerLinkActive="activo">Mis donaciones</a>
      }

      @if (auth.autenticado()) {
        <a routerLink="/mis-asignaciones" routerLinkActive="activo">Mis movimientos</a>
        <a routerLink="/bandeja" routerLinkActive="activo">
          Bandeja @if (noLeidas() > 0) { <span class="etiqueta ambar">{{ noLeidas() }}</span> }
        </a>
      }

      @if (auth.esPersonalLis()) {
        <a routerLink="/lis/aprobaciones" routerLinkActive="activo">Aprobaciones</a>
        <a routerLink="/lis/emparejamiento" routerLinkActive="activo">Emparejamiento</a>
        <a routerLink="/lis/custodia" routerLinkActive="activo">Custodia y entregas</a>
        <a routerLink="/lis/local" routerLinkActive="activo">LOCAL y lotes</a>
        <a routerLink="/lis/plazos" routerLinkActive="activo">Plazos y tareas</a>
        <a routerLink="/lis/analitica" routerLinkActive="activo">Analitica</a>
      }

      @if (auth.esAdministrador()) {
        <a routerLink="/admin/usuarios" routerLinkActive="activo">Usuarios</a>
      }

      <span class="derecha">
        @if (auth.sesion(); as s) {
          <span class="quien">{{ s.nombre }} &middot; {{ etiquetaPapel() }}</span>
          <button class="secundario pequeno" (click)="auth.salir()">Salir</button>
        }
      </span>
    </nav>

    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(ApiService);
  // La sesion se restaura en un inicializador de la aplicacion (app.config.ts),
  // antes de la primera navegacion, para que los guards ya la vean.

  /** Avisos sin leer de la bandeja interna (se refresca cada minuto). */
  noLeidas = signal(0);
  private temporizador: ReturnType<typeof setInterval> | null = null;
  /** Al volver a la pestana se releen avisos y permisos (roles cambiados). */
  private alEnfocar = () => this.refrescar(true);

  ngOnInit(): void {
    this.refrescar();
    this.temporizador = setInterval(() => this.refrescar(true), 60_000);
    window.addEventListener('focus', this.alEnfocar);
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    window.removeEventListener('focus', this.alEnfocar);
  }

  private refrescar(conSesion = false): void {
    if (!this.auth.autenticado()) {
      this.noLeidas.set(0);
      return;
    }
    // Al arrancar la sesion ya se acaba de validar (app.config.ts); despues,
    // se relee para reflejar cambios de rol sin recargar la pagina.
    if (conSesion) this.auth.refrescarSesion();
    this.api.noLeidas().subscribe({ next: (r) => this.noLeidas.set(r.noLeidas), error: () => undefined });
  }

  etiquetaPapel(): string {
    if (this.auth.esSuperusuario()) return 'Superusuario';
    if (this.auth.esAdministrador()) return 'Administrador';
    if (this.auth.tieneRol('AUXILIAR_LIS')) return 'Auxiliar LIS';
    return this.auth.sesion()?.perfil === 'ESTUDIANTE' ? 'Estudiante' : 'Donador';
  }
}
