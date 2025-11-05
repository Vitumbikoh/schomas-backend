import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddClassIdToBook1759004700000 implements MigrationInterface {
    name = 'AddClassIdToBook1759004700000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add classId column to book table
        await queryRunner.addColumn('book', new TableColumn({
            name: 'classId',
            type: 'uuid',
            isNullable: true, // Allow null for N/A books that anyone can borrow
        }));

        // Add foreign key constraint for book.classId -> classes.id
        await queryRunner.createForeignKey('book', new TableForeignKey({
            columnNames: ['classId'],
            referencedTableName: 'classes',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL', // If class is deleted, set book.classId to null (N/A)
            onUpdate: 'CASCADE',
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraint
        const table = await queryRunner.getTable('book');
        if (table) {
            const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('classId') !== -1);
            if (foreignKey) {
                await queryRunner.dropForeignKey('book', foreignKey);
            }
        }

        // Drop classId column
        await queryRunner.dropColumn('book', 'classId');
    }
}