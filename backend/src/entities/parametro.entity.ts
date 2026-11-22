import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('PARAMETRO')
export class Parametro {
  @PrimaryColumn({ name: 'clave', type: 'varchar', length: 60 })
  clave: string;

  @Column({ name: 'valor', type: 'nvarchar', length: 200 })
  valor: string;

  @Column({ name: 'descripcion', type: 'nvarchar', length: 300, nullable: true })
  descripcion: string | null;
}
