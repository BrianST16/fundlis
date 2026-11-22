import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Rol } from '../common/enums';
import { Usuario } from './usuario.entity';

@Entity('USUARIO_ROL')
@Unique(['usuarioId', 'rol'])
export class UsuarioRol {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'usuario_id', type: 'int' })
  usuarioId: number;

  @ManyToOne(() => Usuario, (u) => u.roles)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'rol', type: 'varchar', length: 20 })
  rol: Rol;

  @Column({ name: 'asignado_por', type: 'int', nullable: true })
  asignadoPor: number | null;

  @CreateDateColumn({ name: 'asignado_en', type: 'datetime2' })
  asignadoEn: Date;
}
