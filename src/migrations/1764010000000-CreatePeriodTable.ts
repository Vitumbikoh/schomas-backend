import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePeriodTable1764010000000 implements MigrationInterface {
  name = 'CreatePeriodTable1764010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "period" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "order" integer NOT NULL,
        CONSTRAINT "PK_period_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "period"');
  }
}
