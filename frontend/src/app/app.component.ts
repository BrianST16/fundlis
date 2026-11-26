import { Component, ElementRef, HostListener, OnDestroy, OnInit, effect, inject, signal, viewChild } from '@angular/core';
import { ApiService } from './core/api.service';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { TareasPendientesService } from './core/tareas-pendientes.service';

type Grupo = 'cuenta' | 'lis';

/** localStorage puede no estar disponible (modo privado estricto): no es critico. */
function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin persistencia: el menu funciona igual */
  }
}

@Component({
  selector: 'lis-raiz',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- Barra superior: solo en pantallas pequenas (abre el menu lateral). -->
    <header class="barra-movil">
      <button class="boton-menu" (click)="menuAbierto.set(true)" aria-label="Abrir menú">&#9776;</button>
      <span class="marca">LIS Dona</span>
      @if (!auth.autenticado()) {
        <button class="secundario pequeno" (click)="abrirLogin()">Iniciar sesión</button>
      }
      @if (noLeidas() > 0) {
        <a routerLink="/bandeja" class="etiqueta ambar" title="Avisos sin leer">{{ noLeidas() }}</a>
      }
    </header>

    @if (menuAbierto()) {
      <div class="lateral-fondo" (click)="menuAbierto.set(false)"></div>
    }

    <aside class="lateral" [class.abierta]="menuAbierto()" [class.compacta]="compacto()" (click)="alElegir($event)">
      <div class="lateral-cabecera">
        <span class="marca">LIS <span class="marca-2">Dona</span></span>
        <!-- Escritorio: contraer a una franja de iconos. Movil: cerrar el panel. -->
        <button class="boton-menu contraer" (click)="alternarCompacto()"
                [attr.aria-label]="compacto() ? 'Expandir menú' : 'Contraer menú'"
                [title]="compacto() ? 'Expandir menú' : 'Contraer menú'">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button class="boton-menu cerrar" (click)="menuAbierto.set(false)" aria-label="Cerrar menú">&times;</button>
      </div>

      <!-- Grupo 1: lo propio de la cuenta. -->
      <nav class="grupo-menu" [class.plegado]="!grupoAbierto('cuenta')">
        <button class="grupo-titulo" (click)="alternarGrupo('cuenta')" title="Mi cuenta"
                [attr.aria-expanded]="grupoAbierto('cuenta')">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
          @if (noLeidas() > 0) { <span class="punto" title="Avisos sin leer"></span> }
          <span class="texto">Mi cuenta</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div class="enlaces">
          <a routerLink="/catalogo" routerLinkActive="activo">Catálogo</a>
          @if (auth.esEstudiante()) {
            <a routerLink="/mis-peticiones" routerLinkActive="activo">Mis peticiones</a>
            <a routerLink="/caracterizacion" routerLinkActive="activo">Mi caracterización</a>
          }
          @if (auth.esDonador()) {
            <a routerLink="/mis-ofertas" routerLinkActive="activo">Mis donaciones</a>
          }
          @if (auth.autenticado()) {
            <a routerLink="/bandeja" routerLinkActive="activo">
              Bandeja @if (noLeidas() > 0) { <span class="etiqueta ambar">{{ noLeidas() }}</span> }
            </a>
          }
        </div>
      </nav>

      <!-- Grupo 2: solo personal del LIS. -->
      @if (auth.esPersonalLis()) {
        <nav class="grupo-menu lis" [class.plegado]="!grupoAbierto('lis')">
          <button class="grupo-titulo" (click)="alternarGrupo('lis')" title="Gestión LIS"
                  [attr.aria-expanded]="grupoAbierto('lis')">
            <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></svg>
            @if (pendientes.abiertas().length > 0) { <span class="punto rojo" title="Decisiones pendientes"></span> }
            <span class="texto">Gestión LIS</span>
            <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div class="enlaces">
            <a routerLink="/lis/aprobaciones" routerLinkActive="activo">Aprobaciones</a>
            <a routerLink="/lis/emparejamiento" routerLinkActive="activo">Emparejamiento</a>
            <!-- D-59: cada contador lleva a la pagina donde se decide su tarea DEFINIR_ESTADO. -->
            <a routerLink="/lis/custodia" routerLinkActive="activo">
              Entregas y plazos
              @if (pendientes.deAsignaciones().length; as n) { <span class="etiqueta roja" title="Decisiones pendientes">{{ n }}</span> }
            </a>
            <a routerLink="/lis/local" routerLinkActive="activo">
              Local y lotes
              @if (pendientes.deLocal().length; as n) { <span class="etiqueta roja" title="Decisiones pendientes">{{ n }}</span> }
            </a>
            <a routerLink="/lis/analitica" routerLinkActive="activo">Analítica</a>
            @if (auth.esAdministrador()) {
              <a routerLink="/admin/usuarios" routerLinkActive="activo">Usuarios</a>
            }
          </div>
        </nav>
      }

      @if (auth.sesion(); as s) {
        <div class="lateral-pie">
          <span class="quien">{{ s.nombre }}</span>
          <span class="papel">{{ etiquetaPapel() }}</span>
          <button class="salir" (click)="auth.salir()" title="Salir">
            <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>
            <span class="texto">Salir</span>
          </button>
          <button class="tema" (click)="alternarTema()" [title]="tema() === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
            @if (tema() === 'oscuro') {
              <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              <span class="texto">Modo claro</span>
            } @else {
              <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              <span class="texto">Modo oscuro</span>
            }
          </button>
        </div>
      } @else {
        <!-- Invitado: el inicio de sesion vive en el menu, no en el catalogo. -->
        <div class="lateral-pie">
          <button class="salir" (click)="abrirLogin()" title="Iniciar sesión">
            <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M14 17l5-5-5-5M19 12H8" /></svg>
            <span class="texto">Iniciar sesión</span>
          </button>
          <button class="tema" (click)="alternarTema()" [title]="tema() === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
            @if (tema() === 'oscuro') {
              <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              <span class="texto">Modo claro</span>
            } @else {
              <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              <span class="texto">Modo oscuro</span>
            }
          </button>
        </div>
      }
    </aside>

    @if (loginAbierto()) {
      <div class="modal-fondo" (click)="loginAbierto.set(false)">
        <section class="modal-panel login" role="dialog" aria-label="Iniciar sesión" (click)="$event.stopPropagation()">
          <header class="modal-cabecera">
            <strong>Iniciar sesión</strong>
            <button class="secundario pequeno" (click)="loginAbierto.set(false)" aria-label="Cerrar">&times;</button>
          </header>
          <p class="dato">
            Con tu correo &#64;udea.edu.co entras como <strong>estudiante</strong>; con otra cuenta de Google, como <strong>donador</strong>.
          </p>
          <div #botonGoogle class="boton-google"></div>
          @if (auth.cargando()) { <p class="dato">Ingresando...</p> }
          @if (auth.error()) { <div class="aviso error">{{ auth.error() }}</div> }
        </section>
      </div>
    }

    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(ApiService);
  pendientes = inject(TareasPendientesService);
  // La sesion se restaura en un inicializador de la aplicacion (app.config.ts),
  // antes de la primera navegacion, para que los guards ya la vean.

  /**
   * Modo claro u oscuro. Se recuerda en el navegador; la primera vez sigue la
   * preferencia del sistema. index.html lo aplica antes de cargar Angular
   * para que la pagina no parpadee en blanco.
   */
  tema = signal<'claro' | 'oscuro'>(
    leer('lis.tema') === 'oscuro' ||
      (leer('lis.tema') === null && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'oscuro'
      : 'claro',
  );

  private aplicarTema = effect(() => {
    document.documentElement.dataset['tema'] = this.tema();
    guardar('lis.tema', this.tema());
  });

  alternarTema(): void {
    this.tema.update((t) => (t === 'oscuro' ? 'claro' : 'oscuro'));
  }

  /** Ventana de inicio de sesion con Google (invitados). */
  loginAbierto = signal(false);
  private botonGoogle = viewChild<ElementRef<HTMLElement>>('botonGoogle');

  /** Dibuja el boton oficial de Google al abrir la ventana. El script de
   *  Google puede llegar despues del render: se reintenta unas veces. */
  private dibujarGoogle = effect((alLimpiar) => {
    const el = this.botonGoogle()?.nativeElement;
    if (!el) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const intentar = (restantes: number) => {
      this.auth.iniciarBotonGoogle(el);
      if (!el.childElementCount && restantes > 0) espera = setTimeout(() => intentar(restantes - 1), 400);
    };
    intentar(8);
    alLimpiar(() => clearTimeout(espera));
  });

  /** Al iniciar sesion se cierra la ventana (AuthService ya redirige). */
  private cerrarLoginAlEntrar = effect(() => {
    if (this.auth.autenticado()) this.loginAbierto.set(false);
  });

  abrirLogin(): void {
    this.auth.error.set(null);
    this.menuAbierto.set(false);
    this.loginAbierto.set(true);
  }

  /** Menu lateral desplegado (solo aplica en pantallas pequenas). */
  menuAbierto = signal(false);

  /** Escritorio: menu contraido a una franja de iconos. Se recuerda entre visitas. */
  compacto = signal(leer('lis.menu.compacto') === '1');
  /** Grupos plegables ("Mi cuenta" y "Gestion LIS"); se recuerda su estado. */
  private grupos = signal<Record<Grupo, boolean>>({
    cuenta: leer('lis.menu.cuenta') !== '0',
    lis: leer('lis.menu.lis') !== '0',
  });

  private persistir = effect(() => {
    const g = this.grupos();
    guardar('lis.menu.compacto', this.compacto() ? '1' : '0');
    guardar('lis.menu.cuenta', g.cuenta ? '1' : '0');
    guardar('lis.menu.lis', g.lis ? '1' : '0');
    // El contenido se corre segun el ancho del menu (ver styles.css).
    document.body.classList.toggle('menu-compacto', this.compacto());
  });

  grupoAbierto(g: Grupo): boolean {
    return this.grupos()[g];
  }

  alternarCompacto(): void {
    this.compacto.update((v) => !v);
  }

  /** Con el menu contraido, el icono del grupo expande el menu y abre ese grupo. */
  alternarGrupo(g: Grupo): void {
    if (this.compacto()) {
      this.compacto.set(false);
      this.grupos.update((x) => ({ ...x, [g]: true }));
      return;
    }
    this.grupos.update((x) => ({ ...x, [g]: !x[g] }));
  }

  /** En movil, elegir una opcion del menu lo cierra. */
  alElegir(evento: Event): void {
    if ((evento.target as HTMLElement).closest('a')) this.menuAbierto.set(false);
  }

  @HostListener('document:keydown.escape')
  cerrarMenu(): void {
    this.menuAbierto.set(false);
    this.loginAbierto.set(false);
  }

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
    // D-59: contadores DEFINIR_ESTADO del menu (solo el personal del LIS los ve).
    if (this.auth.esPersonalLis()) this.pendientes.refrescar();
    else this.pendientes.limpiar();
  }

  etiquetaPapel(): string {
    if (this.auth.esSuperusuario()) return 'Superusuario';
    if (this.auth.esAdministrador()) return 'Administrador';
    if (this.auth.tieneRol('AUXILIAR_LIS')) return 'Auxiliar LIS';
    return this.auth.sesion()?.perfil === 'ESTUDIANTE' ? 'Estudiante' : 'Donador';
  }
}
