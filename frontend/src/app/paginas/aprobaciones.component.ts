import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { OfertaCatalogo, PeticionVista } from '../core/modelos';
import { fecha, mensajeError } from '../core/utilidades';

/** Cola de revision del personal del LIS: ofertas y peticiones pendientes. */
@Component({
  selector: 'lis-aprobaciones',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Aprobaciones</h1>
    <p class="subtitulo">
      Revisa lo que publican donadores y estudiantes. Solo lo aprobado entra al catalogo y al
      emparejamiento.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <h2>Donaciones pendientes ({{ ofertas().length }})</h2>
    @if (!ofertas().length) {
      <p class="vacio">No hay donaciones por revisar.</p>
    }
    <div class="rejilla">
      @for (o of ofertas(); track o.id) {
        <div class="tarjeta">
          @if (o.fotoId) {
            <img class="foto" [src]="api.urlFoto(o.fotoId)" [alt]="o.nombreProducto" />
          }
          <span class="etiqueta gris">{{ o.categoria.nombre }}</span>
          <h3 style="margin:.5rem 0 .25rem; font-size:1rem">{{ o.nombreProducto }}</h3>
          <p class="dato">{{ o.descripcion }}</p>
          <p class="dato">
            Cantidad: <strong>{{ o.cantidadOfertada }}</strong>
          </p>
          @if (o.donador; as d) {
            <p class="dato">Donador: <strong>{{ d.nombre }}</strong> &middot; {{ d.email }}</p>
          }
          <p class="dato">#{{ o.id }} &middot; {{ f(o.publicadaEn) }}</p>
          <div class="fila" style="margin-top:.6rem">
            <button class="pequeno" (click)="aprobarOferta(o)">Aprobar</button>
            <button class="peligro pequeno" (click)="rechazarOferta(o)">Rechazar</button>
          </div>
        </div>
      }
    </div>

    <h2>Peticiones pendientes ({{ peticiones().length }})</h2>
    @if (!peticiones().length) {
      <p class="vacio">No hay peticiones por revisar.</p>
    }
    <div class="rejilla">
      @for (p of peticiones(); track p.id) {
        <div class="tarjeta">
          <span class="etiqueta gris">{{ p.categoria.nombre }}</span>
          <p style="margin:.5rem 0 .25rem">{{ p.descripcion }}</p>
          @if (p.estudiante; as e) {
            <p class="dato">Estudiante: <strong>{{ e.nombre }}</strong> &middot; {{ e.email }}</p>
          }
          <p class="dato">#{{ p.id }} &middot; {{ f(p.publicadaEn) }}</p>
          <div class="fila" style="margin-top:.6rem">
            <button class="pequeno" (click)="aprobarPeticion(p)">Aprobar</button>
            <button class="peligro pequeno" (click)="rechazarPeticion(p)">Rechazar</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AprobacionesComponent implements OnInit {
  api = inject(ApiService);

  ofertas = signal<OfertaCatalogo[]>([]);
  peticiones = signal<PeticionVista[]>([]);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);
  f = fecha;

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api.ofertasPendientes().subscribe({
      next: (o) => this.ofertas.set(o),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.api.peticionesPendientes().subscribe({
      next: (p) => this.peticiones.set(p),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  aprobarOferta(o: OfertaCatalogo): void {
    this.api.aprobarOferta(o.id).subscribe({
      next: () => this.hecho(`Donacion #${o.id} aprobada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  rechazarOferta(o: OfertaCatalogo): void {
    const motivo = prompt('Motivo del rechazo (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.rechazarOferta(o.id, motivo.trim()).subscribe({
      next: () => this.hecho(`Donacion #${o.id} rechazada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  aprobarPeticion(p: PeticionVista): void {
    this.api.aprobarPeticion(p.id).subscribe({
      next: () => this.hecho(`Peticion #${p.id} aprobada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  rechazarPeticion(p: PeticionVista): void {
    const motivo = prompt('Motivo del rechazo (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    this.api.rechazarPeticion(p.id, motivo.trim()).subscribe({
      next: () => this.hecho(`Peticion #${p.id} rechazada.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private hecho(texto: string): void {
    this.mensaje.set(texto);
    this.error.set(null);
    this.cargar();
  }
}
