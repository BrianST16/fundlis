import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withNavigationErrorHandler} from '@angular/router';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { rutas } from './app.routes';

export const configuracionApp: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(
      rutas,
      withComponentInputBinding(),
      withNavigationErrorHandler((e) => {
        console.error('Error de navegacion', e.error);
        alert('No se pudo abrir esta pantalla. Recarga la pagina o vuelve al inicio.');
  }),
),
    provideAppInitializer(() => inject(AuthService).restaurar()),
  ],
};
