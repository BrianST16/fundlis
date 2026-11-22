import { ValueTransformer } from 'typeorm';

/** El driver mssql puede devolver DECIMAL como string. */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};
