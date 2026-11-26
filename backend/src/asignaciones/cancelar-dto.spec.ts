import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelarDto } from './asignaciones.controller';

/** D-57: con la causa "el estudiante no recogio" el motivo es opcional. */
describe('CancelarDto', () => {
  const errores = async (cuerpo: object) =>
    (await validate(plainToInstance(CancelarDto, cuerpo))).map((e) => e.property);

  it('el estudiante no recogió: se acepta sin motivo', async () => {
    expect(await errores({ causa: 'ESTUDIANTE_NO_RECOGIO' })).toEqual([]);
  });

  it('el estudiante no recogió: si se escribe un motivo, se válida igual', async () => {
    expect(await errores({ causa: 'ESTUDIANTE_NO_RECOGIO', motivo: 'abc' })).toEqual(['motivo']);
  });

  it('otro motivo: el motivo es obligatorio', async () => {
    expect(await errores({ causa: 'OTRO' })).toEqual(['motivo']);
    expect(await errores({ causa: 'OTRO', motivo: 'Llegó dañado' })).toEqual([]);
  });

  it('sin causa (antes de la recepción): el motivo sigue siendo obligatorio', async () => {
    expect(await errores({})).toEqual(['motivo']);
  });

  it('una causa desconocida se rechaza', async () => {
    expect(await errores({ causa: 'CUALQUIERA', motivo: 'Motivo válido' })).toEqual(['causa']);
  });
});
