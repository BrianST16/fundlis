import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adjunta el token, cierra la sesion si el backend la rechaza (401) y
 *  refresca los permisos si una operacion es denegada (403). */
export const authInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const auth = inject(AuthService);
  const token = auth.token;

  const conToken = token
    ? peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : peticion;

  return siguiente(conToken).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401 && token) {
        auth.salir();
      } else if (e.status === 403 && token && !peticion.url.endsWith('/auth/yo')) {
        // Puede que le hayan quitado un rol: se releen los permisos para que
        // el menu y la pantalla se corrijan sin recargar.
        auth.refrescarSesion();
      }
      return throwError(() => e);
    }),
  );
};
