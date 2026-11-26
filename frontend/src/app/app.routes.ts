import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from './core/auth.service';
import {
  guardaAdministrador,
  guardaDonador,
  guardaEstudiante,
  guardaPersonalLis,
  guardaSesion,
} from './core/guards';

export const rutas: Routes = [
  { path: '', redirectTo: 'catalogo', pathMatch: 'full' },
  {
    path: 'catalogo',
    loadComponent: () => import('./paginas/catalogo.component').then((m) => m.CatalogoComponent),
  },
  {
    path: 'caracterizacion',
    canActivate: [guardaSesion, guardaEstudiante],
    loadComponent: () =>
      import('./paginas/caracterizacion.component').then((m) => m.CaracterizacionComponent),
  },
  {
    path: 'mis-peticiones',
    canActivate: [guardaSesion, guardaEstudiante],
    loadComponent: () =>
      import('./paginas/mis-peticiones.component').then((m) => m.MisPeticionesComponent),
  },
  {
    path: 'mis-ofertas',
    canActivate: [guardaSesion, guardaDonador],
    loadComponent: () =>
      import('./paginas/mis-ofertas.component').then((m) => m.MisOfertasComponent),
  },
  {
    // La antigua pagina "Mis movimientos" se integro en Mis donaciones /
    // Mis peticiones (seguimiento dentro de cada tarjeta). Enlaces viejos
    // llevan a la pagina propia del perfil.
    // (rutaInicial ya devuelve /catalogo si no hay sesion; Angular no admite
    // guards en una ruta de redireccion).
    path: 'mis-asignaciones',
    redirectTo: () => inject(AuthService).rutaInicial(),
  },
  {
    path: 'lis/aprobaciones',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () =>
      import('./paginas/aprobaciones.component').then((m) => m.AprobacionesComponent),
  },
  {
    path: 'lis/emparejamiento',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () =>
      import('./paginas/emparejamiento.component').then((m) => m.EmparejamientoComponent),
  },
  {
    path: 'lis/custodia',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () => import('./paginas/custodia.component').then((m) => m.CustodiaComponent),
  },
  {
    path: 'bandeja',
    canActivate: [guardaSesion],
    loadComponent: () => import('./paginas/bandeja.component').then((m) => m.BandejaComponent),
  },
  {
    path: 'lis/local',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () => import('./paginas/local.component').then((m) => m.LocalComponent),
  },
  // D-59: "Plazos y tareas" se repartio entre "Entregas y plazos" (tareas de
  // asignaciones) y "Local y lotes" (tareas de Local y de lotes).
  { path: 'lis/plazos', redirectTo: 'lis/custodia' },
  {
    path: 'lis/analitica',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () =>
      import('./paginas/analitica.component').then((m) => m.AnaliticaComponent),
  },
  {
    path: 'admin/usuarios',
    canActivate: [guardaSesion, guardaAdministrador],
    loadComponent: () => import('./paginas/usuarios.component').then((m) => m.UsuariosComponent),
  },
  { path: '**', redirectTo: 'catalogo' },
];
