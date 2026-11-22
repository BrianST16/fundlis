import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const guardaSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.autenticado()) return true;
  inject(Router).navigateByUrl('/catalogo');
  return false;
};

export const guardaEstudiante: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.esEstudiante()) return true;
  inject(Router).navigateByUrl(auth.rutaInicial());
  return false;
};

export const guardaDonador: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.esDonador()) return true;
  inject(Router).navigateByUrl(auth.rutaInicial());
  return false;
};

export const guardaPersonalLis: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.esPersonalLis()) return true;
  inject(Router).navigateByUrl(auth.rutaInicial());
  return false;
};

export const guardaAdministrador: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.esAdministrador()) return true;
  inject(Router).navigateByUrl(auth.rutaInicial());
  return false;
};
