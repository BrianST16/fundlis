import { Routes } from '@angular/router';
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
    path: 'mis-asignaciones',
    canActivate: [guardaSesion],
    loadComponent: () =>
      import('./paginas/mis-asignaciones.component').then((m) => m.MisAsignacionesComponent),
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
  {
    path: 'lis/plazos',
    canActivate: [guardaSesion, guardaPersonalLis],
    loadComponent: () =>
      import('./paginas/vencimientos.component').then((m) => m.VencimientosComponent),
  },
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
