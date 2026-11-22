export const environment = {
  produccion: false,
  /** URL base del backend. Debe terminar en /api. */
  apiUrl: 'http://localhost:3000/api',
  /**
   * Client ID de Google. Tiene que ser EXACTAMENTE el mismo que usa el
   * backend en GOOGLE_CLIENT_ID. Se crea en Google Cloud Console como
   * credencial de tipo "ID de cliente de OAuth" / "Aplicacion web", con
   * http://localhost:4200 entre los origenes autorizados.
   */
  googleClientId: '476444670258-cpeeedfg805cebs3739sjdg4hne3cku2.apps.googleusercontent.com',
};
