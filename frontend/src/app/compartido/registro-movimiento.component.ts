import { Component, OnInit, input, output, signal } from '@angular/core';
import { FotoEnviable } from '../core/modelos';
import { leerComoFoto } from '../core/utilidades';

/** Lo que el backend recibe en todo movimiento fisico (MovimientoDto). */
export interface DatosMovimiento {
  cantidad: number;
  nombreContraparte: string;
  foto: FotoEnviable;
  observaciones?: string;
}

/**
 * Formulario UNICO de movimiento fisico (recepcion, entrega, devolucion),
 * usado por "Entregas y plazos" y por "Local y lotes". La fotografia es
 * obligatoria (D-29). Las notas propias de cada caso van como contenido
 * proyectado (<ng-content>).
 */
@Component({
  selector: 'lis-registro-movimiento',
  standalone: true,
  template: `
    <div class="subpanel">
      <strong>{{ titulo() }}</strong>

      <label>Cantidad</label>
      @if (cantidadEditable()) {
        <input type="number" min="1" [value]="cantidad()" (input)="cantidad.set(+$any($event.target).value)" />
      } @else {
        <p class="dato" style="margin:.2rem 0">{{ cantidad() }} unidades</p>
      }

      <ng-content />

      <label>Nombre de quien {{ quien() }}</label>
      <input [value]="contraparte()" (input)="contraparte.set($any($event.target).value)" placeholder="Nombre completo" />

      <label>Fotografía (obligatoria)</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" (change)="elegirFoto($event)" />
      @if (foto()) { <p class="dato">Imagen lista: {{ foto()!.nombreOriginal }}</p> }
      @if (errorFoto()) { <p class="dato texto-rojo">{{ errorFoto() }}</p> }

      <label>Observaciones (opcional)</label>
      <textarea [value]="observaciones()" (input)="observaciones.set($any($event.target).value)"></textarea>

      <div class="fila" style="margin-top:.75rem">
        <button [disabled]="!valido() || enviando()" (click)="enviar()">
          {{ enviando() ? 'Guardando...' : 'Confirmar movimiento' }}
        </button>
        <button class="secundario" (click)="cerrar.emit()">Cancelar</button>
      </div>
    </div>
  `,
})
export class RegistroMovimientoComponent implements OnInit {
  titulo = input.required<string>();
  /** "entrega" (recepcion) o "recibe" (entrega / devolucion). */
  quien = input.required<'entrega' | 'recibe'>();
  cantidadInicial = input.required<number>();
  /** Solo la recepcion de una asignacion admite menos unidades (faltante). */
  cantidadEditable = input(false);
  enviando = input(false);

  confirmar = output<DatosMovimiento>();
  cerrar = output<void>();

  cantidad = signal(1);
  contraparte = signal('');
  observaciones = signal('');
  foto = signal<FotoEnviable | null>(null);
  errorFoto = signal<string | null>(null);

  ngOnInit(): void {
    this.cantidad.set(this.cantidadInicial());
  }

  async elegirFoto(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    try {
      this.foto.set(await leerComoFoto(archivo));
      this.errorFoto.set(null);
    } catch (e: any) {
      this.foto.set(null);
      this.errorFoto.set(e.message);
    }
  }

  valido(): boolean {
    return !!this.foto() && this.contraparte().trim().length >= 3 && this.cantidad() >= 1;
  }

  enviar(): void {
    if (!this.valido()) return;
    this.confirmar.emit({
      cantidad: this.cantidad(),
      nombreContraparte: this.contraparte().trim(),
      foto: this.foto()!,
      observaciones: this.observaciones().trim() || undefined,
    });
  }
}
