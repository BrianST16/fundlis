import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { PaginadorComponent, Paginado } from '../compartido/paginador.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CertificadoMeta, UsuarioAdmin } from '../core/modelos';
import { abrirBlob, estadoLegible, fecha, mensajeError, puntaje } from '../core/utilidades';

/** Gestion de usuarios y roles. Solo administrador.
 *  La caracterizacion es un dato sensible: se consulta aparte y a peticion. */
@Component({
  selector: 'lis-usuarios',
  standalone: true,
  imports: [CommonModule, PaginadorComponent],
  template: `
    <h1>Usuarios y roles</h1>
    <p class="subtitulo">
      El perfil depende del correo. Los auxiliares los gestiona el administrador; los administradores, un superusuario.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <div class="fila" style="margin-bottom:1rem">
      <input
        placeholder="Buscar por nombre o correo"
        style="max-width:320px"
        [value]="buscar()"
        (input)="buscar.set($any($event.target).value)"
      />
      <button class="pequeno" (click)="buscarUsuarios()">Buscar</button>
    </div>

    <table #tUsuarios>
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Perfil</th>
          <th>Roles</th>
          <th>Último ingreso</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        @for (u of pag.visibles(); track u.id) {
          <tr [id]="'fila-usuario-' + u.id" [class.seleccionada]="seleccionado()?.id === u.id">
            <td>
              <strong>{{ u.nombre }}</strong><br />
              <span class="dato">{{ u.email }}</span>
              @if (!u.activo) {
                <br /><span class="etiqueta roja">Bloqueado</span>
                <span class="dato">{{ u.motivoBloqueo }}</span>
              }
            </td>
            <td><span class="etiqueta gris">{{ perfil(u.perfil) }}</span></td>
            <td>
              @if (!u.roles.length) { <span class="dato">-</span> }
              @for (r of u.roles; track r) {
                <span class="etiqueta">{{ rol(r) }}</span>
              }
            </td>
            <td class="dato">{{ f(u.ultimoIngresoEn) }}</td>
            <td>
              <div class="fila">
                @if (u.roles.includes('SUPERUSUARIO')) {
                  <span class="dato">Superusuario</span>
                } @else {
                  @if (!u.roles.includes('AUXILIAR_LIS')) {
                    <button class="secundario pequeno" (click)="otorgar(u, 'AUXILIAR_LIS')">
                      + Auxiliar
                    </button>
                  } @else {
                    <button class="peligro pequeno" (click)="revocar(u, 'AUXILIAR_LIS')">
                      - Auxiliar
                    </button>
                  }
                  @if (auth.esSuperusuario()) {
                    @if (!u.roles.includes('ADMINISTRADOR')) {
                      <button class="secundario pequeno" (click)="otorgar(u, 'ADMINISTRADOR')">
                        + Admin
                      </button>
                    } @else {
                      <button class="peligro pequeno" (click)="revocar(u, 'ADMINISTRADOR')">
                        - Admin
                      </button>
                    }
                  }
                  @if (puedeBloquear(u)) {
                    @if (u.activo) {
                      <button class="peligro pequeno" (click)="bloquear(u)">Bloquear</button>
                    } @else {
                      <button class="pequeno" (click)="desbloquear(u)">Desbloquear</button>
                    }
                  }
                }
                @if (u.perfil === 'ESTUDIANTE') {
                  <button class="secundario pequeno" (click)="verCaracterizacion(u)">
                    Caracterización
                  </button>
                }
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
    <lis-paginador [control]="pag" [destino]="tUsuarios" />

    @if (!usuarios().length) {
      <p class="vacio">No hay usuarios registrados todavía.</p>
    }

    @if (seleccionado(); as s) {
      <h2 id="panel-caracterizacion" style="scroll-margin-top:1rem">Caracterización de {{ s.nombre }}</h2>
      <div class="tarjeta">
        @if (detalle(); as d) {
          <p class="dato">
            Sisbén <strong>{{ d.grupoSisben }}</strong> ({{ d.descripcionSisben }}) &middot; puntaje <strong>{{ pt(d.puntajeTotal) }}</strong>
          </p>
          <table>
            <tbody>
              @for (r of d.respuestas; track r.pregunta) {
                <tr>
                  <td>{{ r.pregunta }}</td>
                  <td><strong>{{ r.respuesta }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="vacio">Sin caracterización.</p>
        }

        <h3 style="margin-top:1rem">Certificado de estudio (opcional)</h3>
        @if (certificado(); as c) {
          <div class="fila">
            <span class="etiqueta"
                  [class.gris]="c.estadoRevision === 'PENDIENTE'"
                  [class.roja]="c.estadoRevision === 'RECHAZADO'">{{ estadoCertificado(c.estadoRevision) }}</span>
            <span class="dato">{{ c.nombreOriginal ?? 'certificado' }} &middot; subido {{ f(c.subidoEn) }}</span>
            @if (c.revisadoEn) { <span class="dato">&middot; revisado {{ f(c.revisadoEn) }}</span> }
          </div>
          @if (c.observacion) { <p class="dato">Observación: <em>{{ c.observacion }}</em></p> }
          <div class="fila" style="margin-top:.5rem">
            <button class="secundario pequeno" (click)="verCertificado(s)">Ver certificado</button>
            @if (c.estadoRevision !== 'VALIDADO') {
              <button class="pequeno" (click)="revisarCertificado(s, 'VALIDADO')">Validar</button>
            }
            @if (c.estadoRevision !== 'RECHAZADO') {
              <button class="peligro pequeno" (click)="revisarCertificado(s, 'RECHAZADO')">Rechazar</button>
            }
          </div>
        } @else {
          <p class="vacio">No ha cargado certificado.</p>
        }

        <button class="secundario pequeno" style="margin-top:.75rem" (click)="cerrarDetalle()">
          Cerrar
        </button>
      </div>
    }
  `,
})
export class UsuariosComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  usuarios = signal<UsuarioAdmin[]>([]);
  pag = new Paginado(this.usuarios, 25);
  detalle = signal<any | null>(null);
  seleccionado = signal<UsuarioAdmin | null>(null);
  certificado = signal<CertificadoMeta | null>(null);
  buscar = signal('');
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  f = fecha;
  pt = puntaje;
  perfil = estadoLegible;
  rol = estadoLegible;
  estadoCertificado = estadoLegible;

  ngOnInit(): void {
    this.cargar();
  }

  /** Boton "Buscar": nueva busqueda, vuelve a la primera hoja. */
  buscarUsuarios(): void {
    this.pag.reiniciar();
    this.cargar();
  }

  cargar(): void {
    this.api.usuarios(this.buscar().trim() || undefined).subscribe({
      next: (u) => this.usuarios.set(u),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  /** Solo es una ayuda visual: el backend aplica la misma regla (D-45). */
  puedeBloquear(u: UsuarioAdmin): boolean {
    if (u.id === this.auth.sesion()?.sub) return false;
    if (u.roles.includes('SUPERUSUARIO')) return false;
    if (u.roles.includes('ADMINISTRADOR')) return this.auth.esSuperusuario();
    return true;
  }

  otorgar(u: UsuarioAdmin, rol: string): void {
    this.api.otorgarRol(u.id, rol).subscribe({
      next: () => this.hecho(`Rol ${rol} otorgado a ${u.nombre}.`, u),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  revocar(u: UsuarioAdmin, rol: string): void {
    if (!confirm(`Revocar el rol ${rol} a ${u.nombre}?`)) return;
    this.api.revocarRol(u.id, rol).subscribe({
      next: () => this.hecho(`Rol ${rol} revocado a ${u.nombre}.`, u),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  bloquear(u: UsuarioAdmin): void {
    const motivo = prompt(
      `Motivo del bloqueo de ${u.nombre} (mínimo 5 caracteres).\n` +
        'Se cerrarán sus donaciones y peticiones publicadas. Si tiene mediaciones en proceso, primero hay que resolverlas.',
    );
    if (!motivo || motivo.trim().length < 5) return;
    this.api.bloquear(u.id, motivo.trim()).subscribe({
      next: (r) => {
        // D-64 (C2): al bloquear se cierran sus publicaciones abiertas. Si tenia
        // mediaciones en proceso, el servidor lo rechaza y el aviso dice cuales.
        const c = r?.cerradas;
        const cerradas = c && (c.ofertas || c.peticiones)
          ? ` Se cerraron ${c.ofertas} donación(es) y ${c.peticiones} petición(es) que tenia publicadas.`
          : '';
        this.hecho(`${u.nombre} quedó bloqueado.${cerradas}`);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  desbloquear(u: UsuarioAdmin): void {
    this.api.desbloquear(u.id).subscribe({
      next: () => this.hecho(`${u.nombre} quedó activo.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  verCaracterizacion(u: UsuarioAdmin): void {
    this.seleccionado.set(u);
    this.detalle.set(null);
    this.certificado.set(null);
    // El panel se dibuja al final de la pagina: se baja hasta el
    // automaticamente (setTimeout espera a que Angular lo renderice).
    this.desplazarA('panel-caracterizacion');
    this.api.caracterizacionDe(u.id).subscribe({
      next: (d) => this.detalle.set(d),
      // 404 = aun no se caracterizo: se muestra en la tarjeta, no es un error.
      error: (e) => { if (e?.status !== 404) this.error.set(mensajeError(e)); },
    });
    this.api.certificadoDe(u.id).subscribe({
      next: (c) => this.certificado.set(c),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  cerrarDetalle(): void {
    const id = this.seleccionado()?.id;
    this.seleccionado.set(null);
    this.detalle.set(null);
    this.certificado.set(null);
    // Al cerrar, se vuelve a la fila del usuario que se estaba revisando.
    if (id) this.desplazarA(`fila-usuario-${id}`, 'center');
  }

  private desplazarA(idElemento: string, bloque: ScrollLogicalPosition = 'start'): void {
    setTimeout(() =>
      document.getElementById(idElemento)?.scrollIntoView({ behavior: 'smooth', block: bloque }),
    );
  }

  verCertificado(u: UsuarioAdmin): void {
    this.api.archivoCertificadoDe(u.id).subscribe({
      next: (b) => abrirBlob(b, this.certificado()?.nombreOriginal ?? `certificado-${u.id}`),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo abrir el certificado.')),
    });
  }

  revisarCertificado(u: UsuarioAdmin, estado: 'VALIDADO' | 'RECHAZADO'): void {
    let observacion: string | undefined;
    if (estado === 'RECHAZADO') {
      const motivo = prompt('Motivo del rechazo (mínimo 5 caracteres):');
      if (!motivo || motivo.trim().length < 5) return;
      observacion = motivo.trim();
    }
    this.api.revisarCertificado(u.id, estado, observacion).subscribe({
      next: (c) => {
        this.certificado.set(c);
        this.mensaje.set(`Certificado de ${u.nombre}: ${estado}.`);
        this.error.set(null);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private hecho(texto: string, afectado?: UsuarioAdmin): void {
    this.mensaje.set(texto);
    this.error.set(null);
    this.cargar();
    // Si cambie mis propios roles, mi menu y permisos se actualizan ya.
    if (afectado && afectado.id === this.auth.sesion()?.sub) this.auth.refrescarSesion();
  }
}
