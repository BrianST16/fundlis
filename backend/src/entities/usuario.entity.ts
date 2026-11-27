import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Perfil } from '../common/enums';
import { UsuarioRol } from './usuario-rol.entity';

@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Index({ unique: true })
  @Column({ name: 'google_sub', type: 'varchar', length: 255 })
  googleSub: string;

  @Index({ unique: true })
  @Column({ name: 'email', type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'nombre', type: 'varchar', length: 200 })
  nombre: string;

  @Column({ name: 'perfil', type: 'varchar', length: 20 })
  perfil: Perfil;

  @Column({ name: 'activo', type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'motivo_bloqueo', type: 'varchar', length: 400, nullable: true })
  motivoBloqueo: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @Column({ name: 'ultimo_ingreso_en', type: 'timestamptz', nullable: true })
  ultimoIngresoEn: Date | null;

  @OneToMany(() => UsuarioRol, (ur) => ur.usuario)
  roles: UsuarioRol[];
}
