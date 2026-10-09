import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Municipality } from './municipality.entity';
import { User } from './user.entity';

// Postgres devuelve los numeric como string; esto los convierte a number.
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

/**
 * Tarifas del servicio POR MUNICIPIO (antes eran variables de entorno
 * globales `APP_DELIVERY_*` / `APP_SERVICE_FEE_*`).
 *
 * - La fila con `municipalityId = NULL` es la TARIFA GENERAL: la que aplica
 *   a cualquier municipio que no tenga tarifa propia (y a negocios sin
 *   municipio). Siempre existe (la siembra la migración
 *   `AddMunicipalityPricing`) y solo la edita el SUPERADMIN.
 * - Una fila con `municipalityId` es la TARIFA PROPIA de ese municipio: la
 *   reemplaza ENTERA (no campo por campo) — si el superadmin cambia la
 *   general, los municipios con tarifa propia no se enteran. Así el modelo
 *   mental es simple: "este municipio usa la general" o "tiene la suya".
 *
 * Qué municipio aplica a un pedido: el del NEGOCIO (`organizational`), no
 * el del cliente — es donde sale el domiciliario y donde se liquida.
 *
 * Lo que ya quedó cobrado NO depende de esta tabla: cada factura congela sus
 * montos al crearse (`deliveryFee`, reparto Mándalo/repartidor, recargos,
 * `retryFee`, `deliveryWaitMinutes`), así que editar tarifas nunca cambia
 * pedidos ni liquidaciones ya existentes.
 */
@Entity({ name: 'municipalityPricing' })
export class MunicipalityPricing {
  @PrimaryGeneratedColumn()
  id: number;

  /** NULL = tarifa general. Único (índice sobre COALESCE, ver migración). */
  @Column('int', { nullable: true })
  municipalityId: number | null;

  @ManyToOne(() => Municipality, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'municipalityId' })
  municipality?: Municipality | null;

  // ---------- domicilio por distancia ----------

  /** Radio (km) cubierto por la tarifa base. */
  @Column('numeric', {
    precision: 6,
    scale: 2,
    transformer: numericTransformer,
  })
  baseKm: number;

  /** Tarifa base (COP) hasta `baseKm` — también es el mínimo del servicio. */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  baseFee: number;

  /** Parte de la tarifa base que es de Mándalo (el resto, del repartidor). */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  baseMandaloCut: number;

  /** Valor por cada km adicional sobre `baseKm`. */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  extraKmRate: number;

  /** % del excedente por km que es de Mándalo (el resto, del repartidor). */
  @Column('numeric', {
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  extraMandaloRate: number;

  // ---------- recargos (100% repartidor) ----------

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  nightSurcharge: number;

  /** Inicio de la franja nocturna, "HH:MM" hora de Bogotá. */
  @Column('varchar', { length: 5 })
  nightStartTime: string;

  /** Fin de la franja nocturna, "HH:MM" hora de Bogotá (puede cruzar medianoche). */
  @Column('varchar', { length: 5 })
  nightEndTime: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  weatherSurcharge: number;

  /** mm de lluvia en la última hora (Open-Meteo) desde los que aplica el recargo. */
  @Column('numeric', {
    precision: 6,
    scale: 2,
    transformer: numericTransformer,
  })
  weatherHeavyRainMm: number;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  demandSurcharge: number;

  /**
   * Pedidos listos sin repartidor EN ESTE MUNICIPIO a partir de los cuales
   * aplica el recargo por alta demanda. 0 = recargo desactivado.
   */
  @Column('int')
  demandThreshold: number;

  // ---------- segundo intento de entrega ----------

  /** Cargo único del segundo intento (100% repartidor). */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  retryFee: number;

  /** Minutos de espera en el sitio antes de habilitar el segundo intento. */
  @Column('int')
  waitMinutes: number;

  // ---------- tarifa de servicio (100% Mándalo) ----------

  // Por TRAMOS sobre el subtotal de los productos (sin domicilio), ver
  // migración 1786900000000-ServiceFeeTiers.

  /** Umbral del subtotal (COP) que separa la tarifa baja de la alta. */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  serviceFeeThreshold: number;

  /** Tarifa fija (COP) si el subtotal es MENOR al umbral. */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  serviceFeeBelow: number;

  /** Tarifa fija (COP) si el subtotal es IGUAL O MAYOR al umbral. */
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  serviceFeeAbove: number;

  // ---------- auditoría ----------

  @Column('uuid', { nullable: true })
  updatedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: User | null;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
