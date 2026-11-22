import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createTransport, Transporter } from 'nodemailer';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { ParametrosService } from '../common/parametros.service';
import { CorreoSalida } from '../entities';

/**
 * Canal de correo (D-42). Patron "bandeja de salida" (outbox):
 *  - la operacion de negocio ya esta confirmada cuando se encola el correo,
 *    asi que un fallo de SMTP NUNCA la revierte;
 *  - el envio se reintenta con espera exponencial (2^n minutos) hasta
 *    CORREO_MAX_INTENTOS, luego queda en ERROR para revision;
 *  - idempotencia: un correo por notificacion (indice unico) y "reclamo"
 *    de la fila antes de enviarla para que dos procesos no la manden dos veces.
 * Credenciales SOLO por variables de entorno (SMTP_HOST, SMTP_PORT,
 * SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM). Sin SMTP_HOST el correo se
 * marca SIN_CONFIGURACION y la bandeja interna sigue funcionando.
 */
@Injectable()
export class CorreoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CorreoService.name);
  private transporte: Transporter | null = null;
  private remitente = 'LIS Dona <no-responder@localhost>';
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(CorreoSalida) private readonly correos: Repository<CorreoSalida>,
    private readonly parametros: ParametrosService,
    private readonly config: ConfigService,
  ) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporte = createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT')) || 587,
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
          : undefined,
      });
      this.remitente = this.config.get<string>('SMTP_FROM') || this.remitente;
    }
  }

  /** Permite inyectar un transporte de prueba (p. ej. jsonTransport). */
  usarTransporte(t: Transporter | null, remitente?: string) {
    this.transporte = t;
    if (remitente) this.remitente = remitente;
  }

  configurado(): boolean {
    return this.transporte !== null;
  }

  onModuleInit() {
    const desactivado =
      process.env.NODE_ENV === 'test' || this.config.get<string>('CORREO_PROCESADOR') === 'off';
    if (desactivado) return;
    this.temporizador = setInterval(() => {
      this.procesarPendientes().catch((e) => this.log.error(`Procesador de correo: ${e.message}`));
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Estado inicial de un correo nuevo segun haya o no SMTP configurado. */
  estadoInicial(): 'PENDIENTE' | 'SIN_CONFIGURACION' {
    return this.configurado() ? 'PENDIENTE' : 'SIN_CONFIGURACION';
  }

  /**
   * Estado inicial para un destinatario concreto. Las cuentas ficticias de
   * demostracion (dominios en CORREO_DOMINIOS_EXCLUIDOS) nunca reciben correo
   * real: su aviso queda DESCARTADO, pero la bandeja interna si se crea.
   */
  estadoPara(email: string): 'PENDIENTE' | 'SIN_CONFIGURACION' | 'DESCARTADO' {
    const excluidos = (this.config.get<string>('CORREO_DOMINIOS_EXCLUIDOS') || 'demo.lisdona.test,demo.udea.edu.co')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const dominio = email.split('@')[1]?.toLowerCase() ?? '';
    if (excluidos.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return 'DESCARTADO';
    return this.estadoInicial();
  }

  async procesarPendientes(ahora = new Date(), limite = 20): Promise<{ enviados: number; fallidos: number }> {
    if (!this.transporte) return { enviados: 0, fallidos: 0 };
    const maxIntentos = await this.parametros.numero('CORREO_MAX_INTENTOS', 5);
    const lista = await this.correos.find({
      where: [
        { estado: 'PENDIENTE', proximoIntentoEn: IsNull() },
        { estado: 'PENDIENTE', proximoIntentoEn: LessThanOrEqual(ahora) },
      ],
      order: { creadoEn: 'ASC' },
      take: limite,
    });

    let enviados = 0;
    let fallidos = 0;
    for (const c of lista) {
      // Se fija el conteo ANTES del reclamo: el numero de este intento no debe
      // depender de si la entidad en memoria se actualiza o no.
      const previos = c.intentos;
      const intentos = previos + 1;
      // Reclamo atomico (compare-and-set sobre intentos): solo un procesador gana.
      const reclamo = await this.correos.update(
        { id: c.id, estado: 'PENDIENTE', intentos: previos },
        { intentos, proximoIntentoEn: new Date(ahora.getTime() + 5 * 60_000) },
      );
      if (!reclamo.affected) continue;
      try {
        await this.transporte.sendMail({
          from: this.remitente,
          to: c.destinatario,
          subject: c.asunto,
          text: c.cuerpo,
        });
        await this.correos.update({ id: c.id }, { estado: 'ENVIADO', enviadoEn: new Date(), ultimoError: null });
        enviados++;
      } catch (e: any) {
        fallidos++;
        const definitivo = intentos >= maxIntentos;
        await this.correos.update(
          { id: c.id },
          {
            estado: definitivo ? 'ERROR' : 'PENDIENTE',
            ultimoError: String(e?.message ?? 'error desconocido').slice(0, 480),
            proximoIntentoEn: definitivo ? null : new Date(ahora.getTime() + 2 ** intentos * 60_000),
          },
        );
        this.log.warn(`Correo ${c.id} fallo (intento ${intentos}${definitivo ? ', definitivo' : ''}).`);
      }
    }
    return { enviados, fallidos };
  }

  /** Tras configurar SMTP: devuelve a la cola lo que quedo sin configuracion o en error. */
  async reencolar(): Promise<number> {
    const r1 = await this.correos.update({ estado: 'SIN_CONFIGURACION' }, { estado: 'PENDIENTE', proximoIntentoEn: null });
    const r2 = await this.correos.update({ estado: 'ERROR' }, { estado: 'PENDIENTE', proximoIntentoEn: null, intentos: 0 });
    return (r1.affected ?? 0) + (r2.affected ?? 0);
  }

  async resumen() {
    const filas: { estado: string; n: number }[] = await this.correos
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(*)', 'n')
      .groupBy('c.estado')
      .getRawMany();
    return {
      smtpConfigurado: this.configurado(),
      porEstado: Object.fromEntries(filas.map((f) => [f.estado, Number(f.n)])),
    };
  }
}
