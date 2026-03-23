import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrincipalRoleEnum1763910000000 implements MigrationInterface {
  name = 'AddPrincipalRoleEnum1763910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          WHERE t.typname = 'user_role_enum'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'user_role_enum' AND e.enumlabel = 'PRINCIPAL'
        ) THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'PRINCIPAL';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL doesn't support removing enum values safely in-place.
  }
}
