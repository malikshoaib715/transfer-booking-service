import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BookingDetails,
  BookingStatus,
  Offer,
  ProductType,
  SearchCriteria,
  Supplier,
  SupplierResultStatus,
  Travellers,
} from '@app/contracts';

@Entity('bookings')
export class BookingEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  status: BookingStatus;

  @Column({ type: 'varchar', length: 32 })
  supplier: Supplier;

  @Column({ name: 'product_type', type: 'varchar', length: 16 })
  productType: ProductType;

  @Column({ name: 'offer_id', type: 'varchar', length: 64 })
  offerId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'price_amount', type: 'numeric', precision: 12, scale: 2 })
  priceAmount: string;

  @Column({ name: 'price_currency', type: 'char', length: 3 })
  priceCurrency: string;

  /** Snapshot of the offer as searched, so booking does not depend on cache TTLs. */
  @Column({ type: 'jsonb' })
  offer: Offer;

  @Column({ type: 'jsonb' })
  request: BookingDetails;

  @Index('uq_bookings_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'supplier_reference', type: 'varchar', length: 64, nullable: true })
  supplierReference: string | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => BookingEventEntity, (e) => e.booking)
  events: BookingEventEntity[];
}

@Entity('booking_events')
export class BookingEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index('ix_booking_events_booking_id')
  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @ManyToOne(() => BookingEntity, (b) => b.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: BookingEntity;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('search_audit')
export class SearchAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index('ix_search_audit_search_id')
  @Column({ name: 'search_id', type: 'uuid' })
  searchId: string;

  @Column({ type: 'varchar', length: 32 })
  supplier: Supplier;

  @Column({ name: 'product_type', type: 'varchar', length: 16 })
  productType: ProductType;

  @Column({ type: 'jsonb' })
  criteria: SearchCriteria;

  @Column({ type: 'jsonb' })
  travellers: Travellers;

  @Column({ type: 'varchar', length: 16 })
  status: SupplierResultStatus;

  @Column({ type: 'boolean' })
  cached: boolean;

  @Column({ name: 'took_ms', type: 'int' })
  tookMs: number;

  @Column({ name: 'offer_count', type: 'int' })
  offerCount: number;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'performed_at', type: 'timestamptz' })
  performedAt: Date;
}

export const ENTITIES = [BookingEntity, BookingEventEntity, SearchAuditEntity];
