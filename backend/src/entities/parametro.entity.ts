import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('parametro')
export class Parametro {
  @PrimaryColumn({ name: 'clave', type: 'varchar', length: 60 })
  clave: string;

  @Column({ name: 'valor', type: 'varchar', length: 200 })
  valor: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 300, nullable: true })
  descripcion: string | null;
}
