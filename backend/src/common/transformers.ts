import { ValueTransformer } from 'typeorm';

/** El driver pg devuelve NUMERIC como string (para no perder precision). */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};
