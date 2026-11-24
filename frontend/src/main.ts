import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { configuracionApp } from './app/app.config';

bootstrapApplication(AppComponent, configuracionApp).catch((e) => {
    console.error(e);
    const raiz = document.querySelector('lis-raiz');
  if (raiz) {
    raiz.innerHTML =
      '<div style="padding:2rem;font-family:sans-serif">' +
      '<h2>No se pudo cargar LIS Dona</h2>' +
      '<p>Revisa tu conexión y vuelve a intentar.</p>' +
      '<a href="/">Volver al inicio</a></div>';
  }
});