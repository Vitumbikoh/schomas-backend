import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddSchoolIdToBudget1735920000000 implements MigrationInterface {
    name = 'AddSchoolIdToBudget1735920000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasBudget = await queryRunner.hasTable('budget');
        if (!hasBudget) {
            return;
        }

        const hasSchoolId = await queryRunner.hasColumn('budget', 'schoolId');

        // Add schoolId column to budget table
        if (!hasSchoolId) {
            await queryRunner.addColumn('budget', new TableColumn({
                name: 'schoolId',
                type: 'uuid',
                isNullable: true, // Allow null for existing records
            }));
        }

        const hasSchool = await queryRunner.hasTable('school');
        const hasSchools = await queryRunner.hasTable('schools');
        const referencedTable = hasSchool ? 'school' : hasSchools ? 'schools' : null;
        if (!referencedTable) {
            return;
        }

        // Add foreign key constraint for budget
        await queryRunner.createForeignKey('budget', new TableForeignKey({
            columnNames: ['schoolId'],
            referencedTableName: referencedTable,
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasBudget = await queryRunner.hasTable('budget');
        if (!hasBudget) {
            return;
        }

        // Drop foreign key constraint
        const table = await queryRunner.getTable('budget');
        if (table) {
            const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('schoolId') !== -1);
            if (foreignKey) {
                await queryRunner.dropForeignKey('budget', foreignKey);
            }
        }

        // Drop schoolId column
        const hasSchoolId = await queryRunner.hasColumn('budget', 'schoolId');
        if (hasSchoolId) {
            await queryRunner.dropColumn('budget', 'schoolId');
        }
    }
}