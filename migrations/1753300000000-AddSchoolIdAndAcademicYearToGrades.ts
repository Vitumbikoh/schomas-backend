import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchoolIdAndAcademicYearToGrades1753300000000 implements MigrationInterface {
    name = 'AddSchoolIdAndAcademicYearToGrades1753300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add schoolId column to grades table
        await queryRunner.query(`ALTER TABLE "grade" ADD "schoolId" uuid`);
        
        // Add academicYearId column to grades table
        await queryRunner.query(`ALTER TABLE "grade" ADD "academicYearId" uuid`);
        
        // Add foreign key constraint for schoolId
        await queryRunner.query(`ALTER TABLE "grade" ADD CONSTRAINT "FK_grade_schoolId" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        
        // Add foreign key constraint for academicYearId
        await queryRunner.query(`ALTER TABLE "grade" ADD CONSTRAINT "FK_grade_academicYearId" FOREIGN KEY ("academicYearId") REFERENCES "academic_year"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        await queryRunner.query(`ALTER TABLE "grade" DROP CONSTRAINT "FK_grade_academicYearId"`);
        await queryRunner.query(`ALTER TABLE "grade" DROP CONSTRAINT "FK_grade_schoolId"`);
        
        // Drop columns
        await queryRunner.query(`ALTER TABLE "grade" DROP COLUMN "academicYearId"`);
        await queryRunner.query(`ALTER TABLE "grade" DROP COLUMN "schoolId"`);
    }
}
