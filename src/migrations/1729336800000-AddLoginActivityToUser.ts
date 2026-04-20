import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLoginActivityToUser1729336800000 implements MigrationInterface {
  name = 'AddLoginActivityToUser1729336800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUserTable = await queryRunner.hasTable('user');
    if (!hasUserTable) {
      return;
    }

    const hasLastLoginAt = await queryRunner.hasColumn('user', 'lastLoginAt');
    const hasLastActivityAt = await queryRunner.hasColumn('user', 'lastActivityAt');

    // Add lastLoginAt column
    if (!hasLastLoginAt) {
      await queryRunner.addColumn(
        'user',
        new TableColumn({
          name: 'lastLoginAt',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }

    // Add lastActivityAt column
    if (!hasLastActivityAt) {
      await queryRunner.addColumn(
        'user',
        new TableColumn({
          name: 'lastActivityAt',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUserTable = await queryRunner.hasTable('user');
    if (!hasUserTable) {
      return;
    }

    const hasLastLoginAt = await queryRunner.hasColumn('user', 'lastLoginAt');
    const hasLastActivityAt = await queryRunner.hasColumn('user', 'lastActivityAt');

    // Remove lastActivityAt column
    if (hasLastActivityAt) {
      await queryRunner.dropColumn('user', 'lastActivityAt');
    }
    
    // Remove lastLoginAt column
    if (hasLastLoginAt) {
      await queryRunner.dropColumn('user', 'lastLoginAt');
    }
  }
}