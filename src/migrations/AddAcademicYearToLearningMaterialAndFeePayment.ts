import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddTermToLearningMaterialAndFeePayment1705920000000 implements MigrationInterface {
    name = 'AddTermToLearningMaterialAndFeePayment1705920000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add TermId column to learning_material table
        await queryRunner.addColumn('learning_material', new TableColumn({
            name: 'TermId',
            type: 'uuid',
            isNullable: false,
            default: "'00000000-0000-0000-0000-000000000000'", // Temporary default, should be updated with actual current term
        }));

        // Add TermId column to fee_payment table
        await queryRunner.addColumn('fee_payment', new TableColumn({
            name: 'TermId',
            type: 'uuid',
            isNullable: false,
            default: "'00000000-0000-0000-0000-000000000000'", // Temporary default, should be updated with actual current term
        }));

        // Add foreign key constraint for learning_material
        await queryRunner.createForeignKey('learning_material', new TableForeignKey({
            columnNames: ['TermId'],
            referencedTableName: 'Term',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
        }));

        // Add foreign key constraint for fee_payment
        await queryRunner.createForeignKey('fee_payment', new TableForeignKey({
            columnNames: ['TermId'],
            referencedTableName: 'Term',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
        }));

        // Update existing records with current term (if exists)
        const currentTerm = await queryRunner.query(`
            SELECT id FROM Term WHERE "isCurrent" = true LIMIT 1
        `);

        if (currentTerm.length > 0) {
            const TermId = currentTerm[0].id;
            
            // Update existing learning materials
            await queryRunner.query(`
                UPDATE learning_material 
                SET "TermId" = $1 
                WHERE "TermId" = '00000000-0000-0000-0000-000000000000'
            `, [TermId]);

            // Update existing fee payments
            await queryRunner.query(`
                UPDATE fee_payment 
                SET "TermId" = $1 
                WHERE "TermId" = '00000000-0000-0000-0000-000000000000'
            `, [TermId]);
        }

        // Remove default value constraints after updating
        await queryRunner.changeColumn('learning_material', 'TermId', new TableColumn({
            name: 'TermId',
            type: 'uuid',
            isNullable: false,
        }));

        await queryRunner.changeColumn('fee_payment', 'TermId', new TableColumn({
            name: 'TermId',
            type: 'uuid',
            isNullable: false,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        const learningMaterialTable = await queryRunner.getTable('learning_material');
        const feePaymentTable = await queryRunner.getTable('fee_payment');

        const learningMaterialForeignKey = learningMaterialTable?.foreignKeys.find(
            fk => fk.columnNames.indexOf('TermId') !== -1
        );
        const feePaymentForeignKey = feePaymentTable?.foreignKeys.find(
            fk => fk.columnNames.indexOf('TermId') !== -1
        );

        if (learningMaterialForeignKey) {
            await queryRunner.dropForeignKey('learning_material', learningMaterialForeignKey);
        }

        if (feePaymentForeignKey) {
            await queryRunner.dropForeignKey('fee_payment', feePaymentForeignKey);
        }

        // Drop columns
        await queryRunner.dropColumn('learning_material', 'TermId');
        await queryRunner.dropColumn('fee_payment', 'TermId');
    }
}
