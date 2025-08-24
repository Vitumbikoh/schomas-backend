import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolIdToFinance1753290000000 implements MigrationInterface {
  name = 'AddSchoolIdToFinance1753290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "finance" ADD COLUMN IF NOT EXISTS "schoolId" uuid NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_finance_schoolId" ON "finance" ("schoolId")`);
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools') THEN
        ALTER TABLE "finance" ADD CONSTRAINT IF NOT EXISTS "FK_finance_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL;
      END IF; END $$;`);
    // Backfill from user.schoolId
    await queryRunner.query(`UPDATE "finance" f SET "schoolId" = u."schoolId" FROM "user" u WHERE f."userId" = u."id" AND f."schoolId" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_finance_school') THEN
        ALTER TABLE "finance" DROP CONSTRAINT "FK_finance_school";
      END IF; END $$;`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finance_schoolId"`);
    await queryRunner.query(`ALTER TABLE "finance" DROP COLUMN IF EXISTS "schoolId"`);
  }
}