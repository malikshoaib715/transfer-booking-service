import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1794870000000 implements MigrationInterface {
  name = 'Init1794870000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "bookings" (
        "id" uuid PRIMARY KEY,
        "status" varchar(16) NOT NULL,
        "supplier" varchar(32) NOT NULL,
        "product_type" varchar(16) NOT NULL,
        "offer_id" varchar(64) NOT NULL,
        "title" text NOT NULL,
        "price_amount" numeric(12,2) NOT NULL,
        "price_currency" char(3) NOT NULL,
        "offer" jsonb NOT NULL,
        "request" jsonb NOT NULL,
        "idempotency_key" varchar(128),
        "supplier_reference" varchar(64),
        "failure_code" varchar(64),
        "failure_reason" text,
        "attempts" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "uq_bookings_idempotency_key" ON "bookings" ("idempotency_key")`,
    );
    await q.query(`
      CREATE TABLE "booking_events" (
        "id" bigserial PRIMARY KEY,
        "booking_id" uuid NOT NULL REFERENCES "bookings" ("id") ON DELETE CASCADE,
        "type" varchar(32) NOT NULL,
        "detail" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "ix_booking_events_booking_id" ON "booking_events" ("booking_id")`);
    await q.query(`
      CREATE TABLE "search_audit" (
        "id" bigserial PRIMARY KEY,
        "search_id" uuid NOT NULL,
        "supplier" varchar(32) NOT NULL,
        "product_type" varchar(16) NOT NULL,
        "criteria" jsonb NOT NULL,
        "travellers" jsonb NOT NULL,
        "status" varchar(16) NOT NULL,
        "cached" boolean NOT NULL,
        "took_ms" int NOT NULL,
        "offer_count" int NOT NULL,
        "error_code" varchar(64),
        "performed_at" timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX "ix_search_audit_search_id" ON "search_audit" ("search_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "search_audit"`);
    await q.query(`DROP TABLE "booking_events"`);
    await q.query(`DROP TABLE "bookings"`);
  }
}
