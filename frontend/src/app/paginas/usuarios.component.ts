import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { UsuarioAdmin } from '../core/modelos';
import { fecha, mensajeError, porcentaje } from '../core/utilidades';

/** Gestion de usuarios y roles. Solo administrador.
 *  La caracterizacion es un dato sensible: se consulta aparte y a peticion. */
@Component({
  selector: 'lis-usuarios',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Usuarios y roles</h1>
    <p class="subtitulo">
      El perfil lo determina el dominio del correo verificado por Google y no se puede cambiar
      aqui. Los roles de auxiliar y administrador si los otorgas tu.
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
      <button class="pequeno" (click)="cargar()">Buscar</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Perfil</th>
          <th>Roles</th>
          <th>Ultimo ingreso</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        @for (u of usuarios(); track u.id) {
          <tr>
            <td>
              <strong>{{ u.nombre }}</strong><br />
              <span class="dato">{{ u.email }}</span>
              @if (!u.activo) {
                <br /><span class="etiqueta roja">Bloqueado</span>
                <span class="dato">{{ u.motivoBloqueo }}</span>
              }
            </td>
            <td><span class="etiqueta gris">{{ u.perfil }}</span></td>
            <td>
              @if (!u.roles.length) { <span class="dato">-</span> }
              @for (r of u.roles; track r) {
                <span class="etiqueta">{{ r }}</span>
              }
            </td>
            <td class="dato">{{ f(u.ultimoIngresoEn) }}</td>
            <td>
              <div class="fila">
                @if (!u.roles.includes('AUXILIAR_LIS')) {
                  <button class="secundario pequeno" (click)="otorgar(u, 'AUXILIAR_LIS')">
                    + Auxiliar
                  </button>
                } @else {
                  <button class="peligro pequeno" (click)="revocar(u, 'AUXILIAR_LIS')">
                    - Auxiliar
                  </button>
                }
                @if (!u.roles.includes('ADMINISTRADOR')) {
                  <button class="secundario pequeno" (click)="otorgar(u, 'ADMINISTRADOR')">
                    + Admin
                  </button>
                } @else {
                  <button class="peligro pequeno" (click)="revocar(u, 'ADMINISTRADOR')">
                    - Admin
                  </button>
                }
                @if (u.activo) {
                  <button class="peligro pequeno" (click)="bloquear(u)">Bloquear</button>
                } @else {
                  <button class="pequeno" (click)="desbloquear(u)">Desbloquear</button>
                }
                @if (u.perfil === 'ESTUDIANTE') {
                  <button class="secundario pequeno" (click)="verCaracterizacion(u)">
                    Caracterizacion
                  </button>
                }
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>

    @if (!usuarios().length) {
      <p class="vacio">No hay usuarios registrados todavia.</p>
    }

    @if (detalle(); as d) {
      <h2>Caracterizacion de {{ d.usuario.nombre }}</h2>
      <div class="tarjeta">
        <p class="dato">
          Grupo Sisben <strong>{{ d.grupoSisben }}</strong> ({{ d.descripcionSisben }}) &middot;
          puntaje <strong>{{ pct(d.puntajeTotal) }}</strong>
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
        <button class="secundario pequeno" style="margin-top:.75rem" (click)="detalle.set(null)">
          Cerrar
        </button>
      </div>
    }
  `,
})
export class UsuariosComponent implements OnInit {
  private api = inject(ApiService);

  usuarios = signal<UsuarioAdmin[]>([]);
  detalle = signal<any | null>(null);
  buscar = signal('');
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  f = fecha;
  pct = porcentaje;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.usuarios(this.buscar().trim() || undefined).subscribe({
      next: (u) => this.usuarios.set(u),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  otorgar(u: UsuarioAdmin, rol: string): void {
    this.api.otorgarRol(u.id, rol).subscribe({
      next: () => this.hecho(`Rol ${rol} otorgado a ${u.nombre}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  revocar(u: UsuarioAdmin, rol: string): void {
    if (!confirm(`Revocar el rol ${rol} a ${u.nombre}?`)) return;
    this.api.revocarRol(u.id, rol).subscribe({
      next: () => this.hecho(`Rol ${rol} revocado a ${u.nombre}.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  bloquear(u: UsuarioAdmin): void {
    const motivo = prompt(`Motivo del bloqueo de ${u.nombre} (minimo 5 caracteres):`);
    if (!motivo || motivo.trim().length < 5) return;
    this.api.bloquear(u.id, motivo.trim()).subscribe({
      next: () => this.hecho(`${u.nombre} quedo bloqueado.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  desbloquear(u: UsuarioAdmin): void {
    this.api.desbloquear(u.id).subscribe({
      next: () => this.hecho(`${u.nombre} quedo activo.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  verCaracterizacion(u: UsuarioAdmin): void {
    this.detalle.set(null);
    this.api.caracterizacionDe(u.id).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e) => this.error.set(mensajeError(e, 'Ese estudiante no tiene caracterizacion.')),
    });
  }

  private hecho(texto: string): void {
    this.mensaje.set(texto);
    this.error.set(null);
    this.cargar();
  }
}
