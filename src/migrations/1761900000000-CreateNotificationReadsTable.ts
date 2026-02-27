import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateNotificationReadsTable1761900000000
  implements MigrationInterface
{
  name = 'CreateNotificationReadsTable1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('notification_reads');
    if (hasTable) return;

    await queryRunner.createTable(
      new Table({
        name: 'notification_reads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'notificationId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'schoolId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'readAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          {
            name: 'UQ_notification_reads_notification_user',
            columnNames: ['notificationId', 'userId'],
          },
        ],
        foreignKeys: [
          {
            columnNames: ['notificationId'],
            referencedTableName: 'notifications',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['schoolId'],
            referencedTableName: 'schools',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
        indices: [
          {
            name: 'IDX_NOTIFICATION_READS_NOTIFICATION',
            columnNames: ['notificationId'],
          },
          {
            name: 'IDX_NOTIFICATION_READS_USER',
            columnNames: ['userId'],
          },
          {
            name: 'IDX_NOTIFICATION_READS_SCHOOL',
            columnNames: ['schoolId'],
          },
          {
            name: 'IDX_NOTIFICATION_READS_READ_AT',
            columnNames: ['readAt'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('notification_reads');
    if (!hasTable) return;
    await queryRunner.dropTable('notification_reads');
  }
}
