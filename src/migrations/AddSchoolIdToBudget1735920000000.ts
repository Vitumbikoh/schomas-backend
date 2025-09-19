import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddSchoolIdToBudget1735920000000 implements MigrationInterface {
    name = 'AddSchoolIdToBudget1735920000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add schoolId column to budget table
        await queryRunner.addColumn('budget', new TableColumn({
            name: 'schoolId',
            type: 'uuid',
            isNullable: true, // Allow null for existing records
        }));

        // Add foreign key constraint for budget
        await queryRunner.createForeignKey('budget', new TableForeignKey({
            columnNames: ['schoolId'],
            referencedTableName: 'school',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraint
        const table = await queryRunner.getTable('budget');
        if (table) {
            const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('schoolId') !== -1);
            if (foreignKey) {
                await queryRunner.dropForeignKey('budget', foreignKey);
            }
        }

        // Drop schoolId column
        await queryRunner.dropColumn('budget', 'schoolId');
    }
}