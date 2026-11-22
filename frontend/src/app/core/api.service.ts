import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AlertasComportamiento,
  AsignacionResumen,
  Candidato,
  Categoria,
  DecisionTarea,
  DestinoLocal,
  EstadoPlazo,
  LoteFisico,
  NotificacionBandeja,
  TareaDefinirEstado,
  FilaRankingDonador,
  FilaRankingEstudiante,
  FormularioCaracterizacion,
  FotoEnviable,
  Indicadores,
  ItemBandejaPlazos,
  MiAsignacion,
  MiCaracterizacion,
  MiPlazo,
  OfertaCatalogo,
  PeticionVista,
  ResultadoEmparejamiento,
  ResumenPlazos,
  UsuarioAdmin,
} from './modelos';

/** Unico punto de contacto con el backend. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // --- salud ---
  salud(): Observable<any> {
    return this.http.get(`${this.base}/salud`);
  }

  // --- categorias ---
  categorias(todas = false): Observable<Categoria[]> {
    const params = todas ? new HttpParams().set('todas', 'true') : undefined;
    return this.http.get<Categoria[]>(`${this.base}/categorias`, { params });
  }

  crearCategoria(datos: { nombre: string; descripcion?: string }): Observable<Categoria> {
    return this.http.post<Categoria>(`${this.base}/categorias`, datos);
  }

  // --- catalogo publico ---
  catalogoOfertas(categoriaId?: number): Observable<OfertaCatalogo[]> {
    const params = categoriaId ? new HttpParams().set('categoriaId', categoriaId) : undefined;
    return this.http.get<OfertaCatalogo[]>(`${this.base}/ofertas/catalogo`, { params });
  }

  catalogoPeticiones(categoriaId?: number): Observable<PeticionVista[]> {
    const params = categoriaId ? new HttpParams().set('categoriaId', categoriaId) : undefined;
    return this.http.get<PeticionVista[]>(`${this.base}/peticiones/catalogo`, { params });
  }

  urlFoto(evidenciaId: number): string {
    return `${this.base}/evidencias/${evidenciaId}`;
  }

  // --- evidencias ---
  subirFoto(foto: FotoEnviable): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/evidencias`, foto);
  }

  // --- ofertas (donador) ---
  misOfertas(): Observable<OfertaCatalogo[]> {
    return this.http.get<OfertaCatalogo[]>(`${this.base}/ofertas/mias`);
  }

  crearOferta(datos: {
    categoriaId: number;
    nombreProducto: string;
    descripcion: string;
    cantidad: number;
    fotoId?: number;
    estadoConservacion: number;
    medida?: number | null;
  }): Observable<OfertaCatalogo> {
    return this.http.post<OfertaCatalogo>(`${this.base}/ofertas`, datos);
  }

  cancelarOferta(id: number, motivo: string): Observable<OfertaCatalogo> {
    return this.http.patch<OfertaCatalogo>(`${this.base}/ofertas/${id}/cancelar`, { motivo });
  }

  // --- ofertas (LIS) ---
  ofertasPendientes(): Observable<OfertaCatalogo[]> {
    return this.http.get<OfertaCatalogo[]>(`${this.base}/ofertas/pendientes`);
  }

  aprobarOferta(id: number): Observable<OfertaCatalogo> {
    return this.http.patch<OfertaCatalogo>(`${this.base}/ofertas/${id}/aprobar`, {});
  }

  rechazarOferta(id: number, motivo: string): Observable<OfertaCatalogo> {
    return this.http.patch<OfertaCatalogo>(`${this.base}/ofertas/${id}/rechazar`, { motivo });
  }

  // --- caracterizacion ---
  formularioCaracterizacion(): Observable<FormularioCaracterizacion> {
    return this.http.get<FormularioCaracterizacion>(`${this.base}/caracterizacion/formulario`);
  }

  miCaracterizacion(): Observable<MiCaracterizacion | null> {
    return this.http.get<MiCaracterizacion | null>(`${this.base}/caracterizacion/mia`);
  }

  guardarCaracterizacion(datos: {
    grupoSisben: string;
    respuestas: { preguntaId: number; opcionId: number }[];
  }): Observable<any> {
    return this.http.put(`${this.base}/caracterizacion/mia`, datos);
  }

  // --- peticiones (estudiante) ---
  misPeticiones(): Observable<PeticionVista[]> {
    return this.http.get<PeticionVista[]>(`${this.base}/peticiones/mias`);
  }

  miCupo(): Observable<{ usadas: number; maximo: number }> {
    return this.http.get<{ usadas: number; maximo: number }>(`${this.base}/peticiones/mi-cupo`);
  }

  crearPeticion(datos: {
    categoriaId: number;
    descripcion: string;
    estadoMinimo?: number;
    medidaMin?: number | null;
    medidaMax?: number | null;
  }): Observable<PeticionVista> {
    return this.http.post<PeticionVista>(`${this.base}/peticiones`, datos);
  }

  cancelarPeticion(id: number, motivo: string): Observable<PeticionVista> {
    return this.http.patch<PeticionVista>(`${this.base}/peticiones/${id}/cancelar`, { motivo });
  }

  // --- peticiones (LIS) ---
  peticionesPendientes(): Observable<PeticionVista[]> {
    return this.http.get<PeticionVista[]>(`${this.base}/peticiones/pendientes`);
  }

  aprobarPeticion(id: number): Observable<PeticionVista> {
    return this.http.patch<PeticionVista>(`${this.base}/peticiones/${id}/aprobar`, {});
  }

  rechazarPeticion(id: number, motivo: string): Observable<PeticionVista> {
    return this.http.patch<PeticionVista>(`${this.base}/peticiones/${id}/rechazar`, { motivo });
  }

  // --- emparejamiento (fase A: KD-tree de compatibilidad; fase B: prioridad) ---
  candidatos(ofertaId: number, limite = 20): Observable<ResultadoEmparejamiento> {
    const params = new HttpParams().set('limite', limite);
    return this.http.get<ResultadoEmparejamiento>(`${this.base}/emparejamiento/oferta/${ofertaId}`, { params });
  }

  candidatosLote(loteId: number, limite = 20): Observable<ResultadoEmparejamiento> {
    const params = new HttpParams().set('limite', limite);
    return this.http.get<ResultadoEmparejamiento>(`${this.base}/emparejamiento/lote/${loteId}`, { params });
  }

  reasignarLote(loteId: number, peticionId: number): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/desde-lote`, { loteId, peticionId });
  }

  // --- LOCAL y lotes fisicos ---
  lotes(filtro: 'SIN_DESTINO' | 'EN_LIS' | 'TODOS' = 'EN_LIS'): Observable<LoteFisico[]> {
    return this.http.get<LoteFisico[]>(`${this.base}/local/lotes`, { params: new HttpParams().set('filtro', filtro) });
  }

  destinosLocal(estado?: string): Observable<DestinoLocal[]> {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http.get<DestinoLocal[]>(`${this.base}/local`, { params });
  }

  localDesdeOferta(ofertaId: number, cantidad: number, motivo: string): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/desde-oferta`, { ofertaId, cantidad, motivo });
  }

  localDesdeLote(loteId: number, motivo: string): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/desde-lote`, { loteId, motivo });
  }

  localRecibir(id: number, datos: any): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/${id}/recepcion`, datos);
  }

  localCancelar(id: number, motivo: string): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/${id}/cancelar`, { motivo });
  }

  localSolicitarAceptacion(id: number, motivo: string): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/${id}/solicitar-aceptacion`, { motivo });
  }

  localAceptar(id: number, motivo: string): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/${id}/aceptar`, { motivo });
  }

  localDevolver(id: number, datos: any): Observable<DestinoLocal> {
    return this.http.post<DestinoLocal>(`${this.base}/local/${id}/devolucion`, datos);
  }

  localReasignar(id: number, peticionId: number): Observable<any> {
    return this.http.post(`${this.base}/local/${id}/reasignar`, { peticionId });
  }

  // --- bandeja interna ---
  notificaciones(soloNoLeidas = false): Observable<NotificacionBandeja[]> {
    const params = soloNoLeidas ? new HttpParams().set('noLeidas', 'true') : undefined;
    return this.http.get<NotificacionBandeja[]>(`${this.base}/notificaciones`, { params });
  }

  noLeidas(): Observable<{ noLeidas: number }> {
    return this.http.get<{ noLeidas: number }>(`${this.base}/notificaciones/no-leidas`);
  }

  marcarLeida(id: number): Observable<any> {
    return this.http.patch(`${this.base}/notificaciones/${id}/leida`, {});
  }

  marcarTodasLeidas(): Observable<any> {
    return this.http.patch(`${this.base}/notificaciones/leer-todas`, {});
  }

  estadoCorreo(): Observable<{ smtpConfigurado: boolean; porEstado: Record<string, number> }> {
    return this.http.get<{ smtpConfigurado: boolean; porEstado: Record<string, number> }>(`${this.base}/notificaciones/correo/estado`);
  }

  // --- tareas DEFINIR_ESTADO ---
  tareas(estado?: 'ABIERTA' | 'RESUELTA'): Observable<TareaDefinirEstado[]> {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http.get<TareaDefinirEstado[]>(`${this.base}/tareas`, { params });
  }

  revisarTareas(fechaSimulada?: string): Observable<any> {
    return this.http.post(`${this.base}/tareas/revisar`, fechaSimulada ? { fechaSimulada } : {});
  }

  resolverTarea(id: number, datos: { decision: DecisionTarea; motivo: string; peticionId?: number }): Observable<TareaDefinirEstado> {
    return this.http.post<TareaDefinirEstado>(`${this.base}/tareas/${id}/resolver`, datos);
  }

  // --- asignaciones ---
  asignaciones(estado?: string): Observable<AsignacionResumen[]> {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http.get<AsignacionResumen[]>(`${this.base}/asignaciones`, { params });
  }

  misAsignaciones(): Observable<MiAsignacion[]> {
    return this.http.get<MiAsignacion[]>(`${this.base}/asignaciones/mias`);
  }

  detalleAsignacion(id: number): Observable<any> {
    return this.http.get(`${this.base}/asignaciones/${id}`);
  }

  asignar(datos: { ofertaId: number; peticionId: number; cantidad: number }): Observable<any> {
    return this.http.post(`${this.base}/asignaciones`, datos);
  }

  registrarRecepcion(id: number, datos: any): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/${id}/recepcion`, datos);
  }

  registrarEntrega(id: number, datos: any): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/${id}/entrega`, datos);
  }

  cancelarAsignacion(id: number, motivo: string): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/${id}/cancelar`, { motivo });
  }

  marcarDevolucion(id: number, motivo: string): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/${id}/marcar-devolucion`, { motivo });
  }

  registrarDevolucion(id: number, datos: any): Observable<any> {
    return this.http.post(`${this.base}/asignaciones/${id}/devolucion`, datos);
  }

  // --- usuarios (admin) ---
  usuarios(buscar?: string): Observable<UsuarioAdmin[]> {
    const params = buscar ? new HttpParams().set('buscar', buscar) : undefined;
    return this.http.get<UsuarioAdmin[]>(`${this.base}/usuarios`, { params });
  }

  otorgarRol(id: number, rol: string): Observable<any> {
    return this.http.post(`${this.base}/usuarios/${id}/roles`, { rol });
  }

  revocarRol(id: number, rol: string): Observable<any> {
    return this.http.post(`${this.base}/usuarios/${id}/roles/revocar`, { rol });
  }

  bloquear(id: number, motivo: string): Observable<any> {
    return this.http.patch(`${this.base}/usuarios/${id}/bloquear`, { motivo });
  }

  desbloquear(id: number): Observable<any> {
    return this.http.patch(`${this.base}/usuarios/${id}/desbloquear`, {});
  }

  caracterizacionDe(usuarioId: number): Observable<any> {
    return this.http.get(`${this.base}/caracterizacion/usuario/${usuarioId}`);
  }

  // --- pilar B: plazos ---
  bandejaPlazos(estado?: EstadoPlazo): Observable<ItemBandejaPlazos[]> {
    const params = estado ? new HttpParams().set('estado', estado) : undefined;
    return this.http.get<ItemBandejaPlazos[]>(`${this.base}/plazos/bandeja`, { params });
  }

  resumenPlazos(): Observable<ResumenPlazos> {
    return this.http.get<ResumenPlazos>(`${this.base}/plazos/resumen`);
  }

  misPlazos(): Observable<MiPlazo[]> {
    return this.http.get<MiPlazo[]>(`${this.base}/plazos/mios`);
  }

  // --- pilar C: analitica ---
  indicadores(): Observable<Indicadores> {
    return this.http.get<Indicadores>(`${this.base}/analitica/indicadores`);
  }

  rankingEstudiantes(): Observable<FilaRankingEstudiante[]> {
    return this.http.get<FilaRankingEstudiante[]>(`${this.base}/analitica/ranking/estudiantes`);
  }

  rankingDonadores(): Observable<FilaRankingDonador[]> {
    return this.http.get<FilaRankingDonador[]>(`${this.base}/analitica/ranking/donadores`);
  }

  alertasComportamiento(): Observable<AlertasComportamiento> {
    return this.http.get<AlertasComportamiento>(`${this.base}/analitica/alertas`);
  }
}
