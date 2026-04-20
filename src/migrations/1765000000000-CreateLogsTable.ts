import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateLogsTable1765000000000 implements MigrationInterface {
  name = 'CreateLogsTable1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLogsTable = await queryRunner.hasTable('logs');
    if (hasLogsTable) {
      return;
    }

    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.createTable(
      new Table({
        name: 'logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'action',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'module',
            type: 'character varying',
            length: '50',
            isNullable: false,
          },
          {
            name: 'level',
            type: 'character varying',
            length: '10',
            isNullable: false,
            default: "'info'",
          },
          {
            name: 'performedBy',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'studentCreated',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'entityId',
            type: 'character varying',
            isNullable: true,
          },
          {
            name: 'entityType',
            type: 'character varying',
            isNullable: true,
          },
          {
            name: 'oldValues',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'newValues',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'schoolId',
            type: 'character varying',
            isNullable: true,
          },
          {
            name: 'timestamp',
            type: 'timestamp without time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'ipAddress',
            type: 'character varying',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'character varying',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'logs',
      new TableIndex({
        name: 'IDX_logs_schoolId',
        columnNames: ['schoolId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLogsTable = await queryRunner.hasTable('logs');
    if (!hasLogsTable) {
      return;
    }

    await queryRunner.dropTable('logs');
  }
}
