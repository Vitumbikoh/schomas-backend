import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddAcademicYearToLearningMaterialAndFeePayment1705920000000 implements MigrationInterface {
    name = 'AddAcademicYearToLearningMaterialAndFeePayment1705920000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add academicYearId column to learning_material table
        await queryRunner.addColumn('learning_material', new TableColumn({
            name: 'academicYearId',
            type: 'uuid',
            isNullable: false,
            default: "'00000000-0000-0000-0000-000000000000'", // Temporary default, should be updated with actual current academic year
        }));

        // Add academicYearId column to fee_payment table
        await queryRunner.addColumn('fee_payment', new TableColumn({
            name: 'academicYearId',
            type: 'uuid',
            isNullable: false,
            default: "'00000000-0000-0000-0000-000000000000'", // Temporary default, should be updated with actual current academic year
        }));

        // Add foreign key constraint for learning_material
        await queryRunner.createForeignKey('learning_material', new TableForeignKey({
            columnNames: ['academicYearId'],
            referencedTableName: 'academic_year',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
        }));

        // Add foreign key constraint for fee_payment
        await queryRunner.createForeignKey('fee_payment', new TableForeignKey({
            columnNames: ['academicYearId'],
            referencedTableName: 'academic_year',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
        }));

        // Update existing records with current academic year (if exists)
        const currentAcademicYear = await queryRunner.query(`
            SELECT id FROM academic_year WHERE "isCurrent" = true LIMIT 1
        `);

        if (currentAcademicYear.length > 0) {
            const academicYearId = currentAcademicYear[0].id;
            
            // Update existing learning materials
            await queryRunner.query(`
                UPDATE learning_material 
                SET "academicYearId" = $1 
                WHERE "academicYearId" = '00000000-0000-0000-0000-000000000000'
            `, [academicYearId]);

            // Update existing fee payments
            await queryRunner.query(`
                UPDATE fee_payment 
                SET "academicYearId" = $1 
                WHERE "academicYearId" = '00000000-0000-0000-0000-000000000000'
            `, [academicYearId]);
        }

        // Remove default value constraints after updating
        await queryRunner.changeColumn('learning_material', 'academicYearId', new TableColumn({
            name: 'academicYearId',
            type: 'uuid',
            isNullable: false,
        }));

        await queryRunner.changeColumn('fee_payment', 'academicYearId', new TableColumn({
            name: 'academicYearId',
            type: 'uuid',
            isNullable: false,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        const learningMaterialTable = await queryRunner.getTable('learning_material');
        const feePaymentTable = await queryRunner.getTable('fee_payment');

        const learningMaterialForeignKey = learningMaterialTable?.foreignKeys.find(
            fk => fk.columnNames.indexOf('academicYearId') !== -1
        );
        const feePaymentForeignKey = feePaymentTable?.foreignKeys.find(
            fk => fk.columnNames.indexOf('academicYearId') !== -1
        );

        if (learningMaterialForeignKey) {
            await queryRunner.dropForeignKey('learning_material', learningMaterialForeignKey);
        }

        if (feePaymentForeignKey) {
            await queryRunner.dropForeignKey('fee_payment', feePaymentForeignKey);
        }

        // Drop columns
        await queryRunner.dropColumn('learning_material', 'academicYearId');
        await queryRunner.dropColumn('fee_payment', 'academicYearId');
    }
}
