import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Configuración global de la app — la paleta de marca, que el admin edita
 * desde "Aplicación" en su panel (ver NOTAS.md §50/§51). Tabla SINGLETON:
 * siempre hay una sola fila, con `id` fijo en 1 (no autogenerado).
 *
 * `primaryColor` y `darkColor` son ÚNICOS (no cambian con el tema — son
 * identidad de marca: el acento y el navy de las cabeceras). El resto tiene
 * un par claro/oscuro EXPLÍCITO — nada se deriva/adivina, el admin controla
 * los dos. `primarySoft`/`primaryTint` (tintes de degradados) sí se derivan
 * de `primaryColor` en el front (aclarándolo), no se guardan aparte.
 */
@Entity({ name: 'appSettings' })
export class AppSettings {
  @PrimaryColumn('int')
  id: number;

  @Column('varchar', { length: 7, default: '#FF5A3C' })
  primaryColor: string;

  @Column('varchar', { length: 7, default: '#1E1E2D' })
  darkColor: string;

  @Column('varchar', { length: 7, default: '#F2F2F2' })
  surfaceLightColor: string;

  @Column('varchar', { length: 7, default: '#12121B' })
  surfaceDarkColor: string;

  @Column('varchar', { length: 7, default: '#FFFFFF' })
  cardLightColor: string;

  @Column('varchar', { length: 7, default: '#262636' })
  cardDarkColor: string;

  @Column('varchar', { length: 7, default: '#1E1E2D' })
  textPrimaryLightColor: string;

  @Column('varchar', { length: 7, default: '#EDEDF2' })
  textPrimaryDarkColor: string;

  @Column('varchar', { length: 7, default: '#7A7A8A' })
  textSecondaryLightColor: string;

  @Column('varchar', { length: 7, default: '#A0A0B2' })
  textSecondaryDarkColor: string;

  @Column('varchar', { length: 7, default: '#E5E7EB' })
  borderLightColor: string;

  @Column('varchar', { length: 7, default: '#33334A' })
  borderDarkColor: string;

  // ARL global (reunión con el cliente 2026-08-04): la póliza que cubre a
  // TODOS los repartidores — el admin la carga una sola vez y se le muestra
  // a cualquiera que reporte un accidente.
  @Column('varchar', { length: 150, nullable: true })
  arlCompanyName?: string | null;

  @Column('varchar', { length: 80, nullable: true })
  arlPolicyNumber?: string | null;

  // Redes y contacto públicos (se muestran en login/registro y en "Ayuda" de
  // los 4 roles) — el admin los carga una sola vez desde "Aplicación".
  @Column('varchar', { length: 300, nullable: true })
  youtubeUrl?: string | null;

  @Column('varchar', { length: 300, nullable: true })
  facebookUrl?: string | null;

  @Column('varchar', { length: 300, nullable: true })
  instagramUrl?: string | null;

  @Column('varchar', { length: 30, nullable: true })
  contactPhone?: string | null;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
