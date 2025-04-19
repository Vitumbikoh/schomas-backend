import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertIdsToUuid1690000000000 implements MigrationInterface {
  name = 'ConvertIdsToUuid1690000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop existing constraints
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      DROP CONSTRAINT IF EXISTS "FK_d1a599a7740b4f4bd1120850f04"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      DROP CONSTRAINT IF EXISTS "FK_7e200c699fa93865cdcdd025885"
    `);

    // 2. Convert all IDs to UUID
    await queryRunner.query(`
      ALTER TABLE "student" 
      ALTER COLUMN "id" TYPE uuid USING gen_random_uuid()
    `);

    await queryRunner.query(`
      ALTER TABLE "course" 
      ALTER COLUMN "id" TYPE uuid USING gen_random_uuid()
    `);

    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      ALTER COLUMN "courseId" TYPE uuid USING (
        SELECT c.id::uuid FROM "course" c WHERE c.id = "enrollment"."courseId"::text
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      ALTER COLUMN "studentId" TYPE uuid USING (
        SELECT s.id::uuid FROM "student" s WHERE s.id = "enrollment"."studentId"::text
      )
    `);

    // 3. Recreate constraints
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      ADD CONSTRAINT "FK_enrollment_course" 
      FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE
    `);
    
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      ADD CONSTRAINT "FK_enrollment_student" 
      FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Warning: This down migration may cause data loss
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      DROP CONSTRAINT IF EXISTS "FK_enrollment_student"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "enrollment" 
      DROP CONSTRAINT IF EXISTS "FK_enrollment_course"
    `);
    
    console.warn('Down migration not fully implemented - data loss possible');
  }
}