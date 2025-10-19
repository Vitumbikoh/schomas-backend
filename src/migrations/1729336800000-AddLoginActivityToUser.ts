import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLoginActivityToUser1729336800000 implements MigrationInterface {
  name = 'AddLoginActivityToUser1729336800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add lastLoginAt column
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'lastLoginAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Add lastActivityAt column
    await queryRunner.addColumn(
      'user',
      new TableColumn({
        name: 'lastActivityAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove lastActivityAt column
    await queryRunner.dropColumn('user', 'lastActivityAt');
    
    // Remove lastLoginAt column
    await queryRunner.dropColumn('user', 'lastLoginAt');
  }
}