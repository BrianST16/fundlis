import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { DecisionTarea, EstadoPlazo, ItemBandejaPlazos, ResumenPlazos, TareaDefinirEstado } from '../core/modelos';
import { mensajeError } from '../core/utilidades';

/**
 * Pilar B: bandeja de plazos del personal del LIS. Los intentos vencidos
 * son tareas DEFINIR_ESTADO. Las acciones se ejecutan en "Custodia y
 * entregas"; aqui se muestra cuales estan disponibles y por que no lo
 * estan las demas.
 */
@Component({
  selector: 'lis-vencimientos',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h1>Plazos y tareas</h1>
    <p class="subtitulo">
      Plazos en dias habiles colombianos (America/Bogota, sin fines de semana, festivos ni cierres
      del LIS): 10 para que el donador entregue y 3 para que el estudiante recoja. Lo vencido es
      una tarea DEFINIR_ESTADO.
    </p>

    @if (error()) { <div class="aviso error">{{ error() }}</div> }
    @if (mensaje()) { <div class="aviso ok">{{ mensaje() }}</div> }

    <h2>Tareas DEFINIR_ESTADO abiertas ({{ tareas().length }})</h2>
    <p class="dato">
      Las crea automaticamente el revisor de plazos (y avisa por bandeja y correo al responsable y
      al LIS). Puedes forzar una revision ahora.
      <button class="secundario pequeno" (click)="revisar()">Revisar ahora</button>
    </p>
    @for (t of tareas(); track t.id) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta roja">DEFINIR_ESTADO</span>
          <strong>
            @if (t.asignacionId) { Asignacion #{{ t.asignacionId }} }
            @else if (t.destinoLocalId) { LOCAL #{{ t.destinoLocalId }} }
            @else { Lote #{{ t.loteId }} sin destino }
          </strong>
          <span class="etiqueta gris">responsable: {{ t.responsable }}</span>
          <span class="dato">limite vencido {{ t.fechaLimite }}</span>
        </div>
        <div class="fila" style="margin-top:.5rem">
          @for (d of decisiones(t); track d.codigo) {
            <button class="secundario pequeno" (click)="resolver(t.id, d.codigo)">{{ d.texto }}</button>
          }
        </div>
      </div>
    } @empty { <p class="vacio">No hay tareas abiertas.</p> }

    <h2>Plazos vigentes</h2>
    @if (resumen(); as r) {
      <div class="fila" style="margin-bottom:1rem">
        <button class="pequeno" [class.secundario]="filtro() !== 'VENCIDO'" (click)="filtrar('VENCIDO')">
          Tareas DEFINIR_ESTADO: {{ r.vencidos }}
        </button>
        <button class="pequeno" [class.secundario]="filtro() !== 'POR_VENCER'" (click)="filtrar('POR_VENCER')">
          Por vencer: {{ r.porVencer }}
        </button>
        <button class="pequeno" [class.secundario]="filtro() !== 'EN_PLAZO'" (click)="filtrar('EN_PLAZO')">
          En plazo: {{ r.enPlazo }}
        </button>
        <button class="pequeno" [class.secundario]="filtro() !== undefined" (click)="filtrar(undefined)">
          Todos
        </button>
      </div>
    }

    @if (!items().length) {
      <p class="vacio">No hay intentos en este estado.</p>
    }

    @for (i of items(); track i.asignacionId) {
      <div class="tarjeta">
        <div class="fila">
          <span class="etiqueta"
                [class.roja]="i.plazo.estado === 'VENCIDO'"
                [class.ambar]="i.plazo.estado === 'POR_VENCER'">{{ legible(i.plazo.estado) }}</span>
          @if (i.plazo.tarea) { <span class="etiqueta roja">{{ i.plazo.tarea }}</span> }
          <strong>#{{ i.asignacionId }} &middot; {{ i.producto }}</strong>
          <span class="etiqueta gris">{{ i.categoria }}</span>
        </div>
        <p class="dato">
          {{ i.plazo.responsable === 'DONADOR' ? 'Entrega del donador en el LIS' : 'Recogida del estudiante' }}
          &middot; {{ i.cantidadAsignada }} unidades &middot; desde <strong>{{ i.plazo.inicio }}</strong>
          &middot; limite <strong>{{ i.plazo.fechaLimite }}</strong>
          ({{ i.plazo.diasHabiles }} dias habiles) &middot; {{ restantes(i.plazo.diasHabilesRestantes) }}
        </p>
        <p class="dato">
          Contactar a:
          @if (i.plazo.responsable === 'DONADOR') {
            <strong>{{ i.donador.nombre }}</strong> &middot; {{ i.donador.email }}
          } @else {
            <strong>{{ i.estudiante.nombre }}</strong> &middot; {{ i.estudiante.email }}
          }
        </p>
        @if (i.plazo.acciones.length) {
          <ul class="dato" style="margin:.4rem 0 0; padding-left:1.1rem">
            @for (a of i.plazo.acciones; track a.codigo) {
              <li>
                <strong>{{ a.codigo }}</strong>: {{ a.descripcion }}
                @if (!a.disponible) { <span class="etiqueta gris">pendiente</span> }
                @if (a.nota) { <br /><em>{{ a.nota }}</em> }
              </li>
            }
          </ul>
          <p class="dato"><a routerLink="/lis/custodia">Ir a Custodia y entregas</a> para ejecutar la decision.</p>
        }
      </div>
    }
  `,
})
export class VencimientosComponent implements OnInit {
  private api = inject(ApiService);

  items = signal<ItemBandejaPlazos[]>([]);
  resumen = signal<ResumenPlazos | null>(null);
  filtro = signal<EstadoPlazo | undefined>(undefined);
  error = signal<string | null>(null);

  tareas = signal<TareaDefinirEstado[]>([]);
  mensaje = signal<string | null>(null);

  ngOnInit(): void {
    this.api.resumenPlazos().subscribe({
      next: (r) => this.resumen.set(r),
      error: (e) => this.error.set(mensajeError(e)),
    });
    this.cargar();
    this.cargarTareas();
  }

  private cargarTareas(): void {
    this.api.tareas('ABIERTA').subscribe({ next: (t) => this.tareas.set(t), error: (e) => this.error.set(mensajeError(e)) });
  }

  revisar(): void {
    this.api.revisarTareas().subscribe({
      next: (r) => {
        this.mensaje.set(`Revision: ${r.tareasCreadas} tarea(s) nueva(s), ${r.avisosVencidos} aviso(s) de vencimiento, ${r.avisosProximos} de proximidad.`);
        this.cargarTareas();
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  decisiones(t: TareaDefinirEstado): { codigo: DecisionTarea; texto: string }[] {
    if (t.asignacionId && t.responsable === 'DONADOR') {
      return [
        { codigo: 'APLAZAR', texto: 'Aplazar plazo del donador' },
        { codigo: 'CANCELAR_INTENTO', texto: 'Cancelar intento' },
        { codigo: 'SIN_ACCION', texto: 'Sin accion (contactado)' },
      ];
    }
    if (t.asignacionId) {
      return [
        { codigo: 'EXTENDER', texto: 'Extender 3 dias habiles' },
        { codigo: 'REASIGNAR', texto: 'Reasignar a otra peticion' },
        { codigo: 'CUSTODIA_LOCAL', texto: 'Custodia LOCAL' },
        { codigo: 'DEVOLUCION', texto: 'Iniciar devolucion' },
        { codigo: 'CANCELAR_INTENTO', texto: 'Cancelar intento' },
      ];
    }
    if (t.destinoLocalId && t.responsable === 'DONADOR') {
      return [
        { codigo: 'CANCELAR_INTENTO', texto: 'Cancelar destino LOCAL' },
        { codigo: 'SIN_ACCION', texto: 'Sin accion (contactado)' },
      ];
    }
    return [
      { codigo: 'REASIGNAR', texto: 'Reasignar a una peticion' },
      ...(t.loteId && !t.destinoLocalId ? [{ codigo: 'CUSTODIA_LOCAL' as DecisionTarea, texto: 'Custodia LOCAL' }] : []),
      { codigo: 'SIN_ACCION', texto: 'Sin accion (ver LOCAL y lotes)' },
    ];
  }

  resolver(id: number, decision: DecisionTarea): void {
    const motivo = prompt('Motivo de la decision (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    let peticionId: number | undefined;
    if (decision === 'REASIGNAR') {
      peticionId = Number(prompt('Numero de la peticion compatible (ver Emparejamiento):'));
      if (!peticionId) return;
    }
    this.api.resolverTarea(id, { decision, motivo: motivo.trim(), peticionId }).subscribe({
      next: () => {
        this.mensaje.set(`Tarea #${id} resuelta: ${decision}.`);
        this.cargarTareas();
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  filtrar(estado: EstadoPlazo | undefined): void {
    this.filtro.set(estado);
    this.cargar();
  }

  private cargar(): void {
    this.api.bandejaPlazos(this.filtro()).subscribe({
      next: (l) => this.items.set(l),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  legible(e: EstadoPlazo): string {
    return { EN_PLAZO: 'En plazo', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido' }[e];
  }

  restantes(n: number): string {
    if (n > 0) return `faltan ${n} dias habiles`;
    if (n === 0) return 'vence hoy';
    return `${-n} dias habiles de retraso`;
  }
}
