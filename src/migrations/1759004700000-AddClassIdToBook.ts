import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddClassIdToBook1759004700000 implements MigrationInterface {
    name = 'AddClassIdToBook1759004700000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasBookTable = await queryRunner.hasTable('book');
        if (!hasBookTable) {
            return;
        }

        const hasClassIdColumn = await queryRunner.hasColumn('book', 'classId');

        // Add classId column to book table
        if (!hasClassIdColumn) {
            await queryRunner.addColumn('book', new TableColumn({
                name: 'classId',
                type: 'uuid',
                isNullable: true, // Allow null for N/A books that anyone can borrow
            }));
        }

        // Add foreign key constraint for book.classId -> classes.id
        const hasClassesTable = await queryRunner.hasTable('classes');
        if (hasClassesTable) {
            await queryRunner.createForeignKey('book', new TableForeignKey({
                columnNames: ['classId'],
                referencedTableName: 'classes',
                referencedColumnNames: ['id'],
                onDelete: 'SET NULL', // If class is deleted, set book.classId to null (N/A)
                onUpdate: 'CASCADE',
            }));
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasBookTable = await queryRunner.hasTable('book');
        if (!hasBookTable) {
            return;
        }

        // Drop foreign key constraint
        const table = await queryRunner.getTable('book');
        if (table) {
            const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('classId') !== -1);
            if (foreignKey) {
                await queryRunner.dropForeignKey('book', foreignKey);
            }
        }

        // Drop classId column
        const hasClassIdColumn = await queryRunner.hasColumn('book', 'classId');
        if (hasClassIdColumn) {
            await queryRunner.dropColumn('book', 'classId');
        }
    }
}