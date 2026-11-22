import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Rol, Sesion } from './modelos';

const CLAVE = 'lis_dona_token';

declare const google: any;

/** Sesion del usuario. El rol lo decide el backend: aqui solo se usa para
 *  mostrar u ocultar pantallas, nunca como control de acceso real. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly sesion = signal<Sesion | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly autenticado = computed(() => this.sesion() !== null);
  readonly esEstudiante = computed(() => this.sesion()?.perfil === 'ESTUDIANTE');
  readonly esDonador = computed(() => this.sesion()?.perfil === 'DONADOR');
  readonly esAdministrador = computed(() => this.tieneRol('ADMINISTRADOR'));
  readonly esPersonalLis = computed(
    () => this.tieneRol('AUXILIAR_LIS') || this.tieneRol('ADMINISTRADOR'),
  );

  get token(): string | null {
    return localStorage.getItem(CLAVE);
  }

  tieneRol(rol: Rol): boolean {
    return this.sesion()?.roles?.includes(rol) ?? false;
  }

  /** Restaura la sesion al abrir la aplicacion, revalidando contra el backend. */
  async restaurar(): Promise<void> {
    if (!this.token) return;
    try {
      const sesion = await firstValueFrom(
        this.http.get<Sesion>(`${environment.apiUrl}/auth/yo`),
      );
      this.sesion.set(sesion);
    } catch {
      this.limpiar();
    }
  }

  /** Dibuja el boton oficial de Google y conecta el callback. */
  iniciarBotonGoogle(contenedor: HTMLElement): void {
    if (typeof google === 'undefined' || !google?.accounts?.id) {
      this.error.set(
        'No se pudo cargar Google Identity Services. Revisa tu conexion y vuelve a intentar.',
      );
      return;
    }
    if (environment.googleClientId.startsWith('PON_AQUI')) {
      this.error.set(
        'Falta configurar googleClientId en src/environments/environment.ts.',
      );
      return;
    }
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (respuesta: { credential: string }) => this.entrar(respuesta.credential),
    });
    google.accounts.id.renderButton(contenedor, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      locale: 'es',
    });
  }

  private async entrar(credential: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<{ token: string; usuario: Sesion }>(
          `${environment.apiUrl}/auth/google`,
          { credential },
        ),
      );
      localStorage.setItem(CLAVE, r.token);
      this.sesion.set(r.usuario);
      this.router.navigateByUrl(this.rutaInicial());
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'No se pudo iniciar sesion.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** Cada perfil aterriza donde le sirve. */
  rutaInicial(): string {
    if (this.esPersonalLis()) return '/lis/aprobaciones';
    if (this.esEstudiante()) return '/mis-peticiones';
    if (this.esDonador()) return '/mis-ofertas';
    return '/catalogo';
  }

  salir(): void {
    if (typeof google !== 'undefined' && google?.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
    this.limpiar();
    this.router.navigateByUrl('/catalogo');
  }

  private limpiar(): void {
    localStorage.removeItem(CLAVE);
    this.sesion.set(null);
  }
}
