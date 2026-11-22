import { EntityManager, Repository } from 'typeorm';
import { EstadoAsignacion } from '../common/enums';
import { DestinoLocal, LoteFisico, Oferta, OfertaXPeticion } from '../entities';

/**
 * Saldo de una oferta. Las cantidades NO se almacenan (3FN): se derivan de
 * los intentos, los destinos LOCAL y los lotes fisicos. Es la UNICA
 * implementacion del calculo y coincide con la vista VW_OFERTA_SALDO
 * (migracion 004).
 *
 * Consumen unidades de la oferta:
 *  A) intentos de origen DONADOR: ASIGNADO (comprometidas) y los que ya
 *     pasaron por recepcion (EN_CUSTODIA, ENTREGADO, DEVOLUCION y CANCELADO
 *     despues de recibir). Lo recibido vive desde entonces en un LOTE
 *     FISICO y se gestiona por reasignacion, LOCAL o devolucion: nunca
 *     vuelve a la oferta (asi no hace falta una "recepcion ficticia").
 *     Un intento CANCELADO sin recepcion (el donador no lo llevo) libera
 *     sus unidades (D-15).
 *  B) destinos LOCAL elegidos desde la oferta y no cancelados.
 *  C) si la oferta fue generada por faltante (D-18), sus lotes: esas
 *     unidades ya estan fisicamente en el LIS.
 * Los intentos de origen REASIGNACION no cuentan: consumen un lote, no la
 * oferta.
 */
export interface SaldoOferta {
  ofertada: number;
  /** Intentos ASIGNADO: comprometidas, el donador aun no las trae. */
  comprometida: number;
  /** Unidades que ya pasaron por recepcion (ahora en lotes fisicos). */
  recibida: number;
  entregada: number;
  enDevolucion: number;
  /** Unidades destinadas a LOCAL desde la oferta. */
  destinoLocal: number;
  /** Unidades de una oferta generada por faltante (ya en el LIS). */
  enLoteFaltante: number;
  disponible: number;
}

export interface IntentoParaSaldo {
  estado: EstadoAsignacion;
  cantidadAsignada: number;
  origen?: 'DONADOR' | 'REASIGNACION';
  recibidaEn?: Date | null;
}

export interface LocalParaSaldo {
  origen: 'OFERTA' | 'LOTE';
  estado: string;
  cantidad: number;
}

export function calcularSaldo(
  oferta: { cantidad: number; origen?: 'DONADOR' | 'FALTANTE' },
  intentos: IntentoParaSaldo[],
  destinos: LocalParaSaldo[] = [],
  lotes: { cantidad: number }[] = [],
): SaldoOferta {
  let comprometida = 0;
  let recibida = 0;
  let entregada = 0;
  let enDevolucion = 0;

  for (const i of intentos) {
    if ((i.origen ?? 'DONADOR') !== 'DONADOR') continue;
    switch (i.estado) {
      case EstadoAsignacion.ASIGNADO:
        comprometida += i.cantidadAsignada;
        break;
      case EstadoAsignacion.EN_CUSTODIA:
        recibida += i.cantidadAsignada;
        break;
      case EstadoAsignacion.ENTREGADO:
        recibida += i.cantidadAsignada;
        entregada += i.cantidadAsignada;
        break;
      case EstadoAsignacion.DEVOLUCION:
        recibida += i.cantidadAsignada;
        enDevolucion += i.cantidadAsignada;
        break;
      case EstadoAsignacion.CANCELADO:
        if (i.recibidaEn) recibida += i.cantidadAsignada;
        break;
    }
  }

  const destinoLocal = destinos
    .filter((d) => d.origen === 'OFERTA' && d.estado !== 'CANCELADO')
    .reduce((s, d) => s + d.cantidad, 0);
  const enLoteFaltante = oferta.origen === 'FALTANTE' ? lotes.reduce((s, l) => s + l.cantidad, 0) : 0;

  return {
    ofertada: oferta.cantidad,
    comprometida,
    recibida,
    entregada,
    enDevolucion,
    destinoLocal,
    enLoteFaltante,
    disponible: oferta.cantidad - comprometida - recibida - destinoLocal - enLoteFaltante,
  };
}

/** Lectura de los datos del saldo; con `mgr` se usa la transaccion en curso. */
export async function saldoDeOferta(
  oferta: Oferta,
  fuente: EntityManager | { intentos: Repository<OfertaXPeticion>; destinos: Repository<DestinoLocal>; lotes: Repository<LoteFisico> },
): Promise<SaldoOferta> {
  const repos =
    'getRepository' in fuente
      ? {
          intentos: fuente.getRepository(OfertaXPeticion),
          destinos: fuente.getRepository(DestinoLocal),
          lotes: fuente.getRepository(LoteFisico),
        }
      : fuente;
  const [intentos, destinos, lotes] = await Promise.all([
    repos.intentos.find({ where: { ofertaId: oferta.id } }),
    repos.destinos.find({ where: { ofertaId: oferta.id } }),
    oferta.origen === 'FALTANTE' ? repos.lotes.find({ where: { ofertaId: oferta.id } }) : Promise.resolve([]),
  ]);
  return calcularSaldo(oferta, intentos, destinos, lotes);
}
