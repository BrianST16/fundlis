import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { rutas } from './app.routes';

export const configuracionApp: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(rutas, withComponentInputBinding()),
    // Restaurar la sesion ANTES de la navegacion inicial. Antes se hacia en
    // ngOnInit del componente raiz y los guards se evaluaban sin sesion: al
    // recargar /lis/... el usuario terminaba en el catalogo (T9.1).
    // Solo afecta la UX: la autorizacion real esta en el backend.
    provideAppInitializer(() => inject(AuthService).restaurar()),
  ],
};
