import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddScheduleIdToAttendance1735920000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAttendances = await queryRunner.hasTable('attendances');
    if (!hasAttendances) {
      return;
    }

    const hasScheduleId = await queryRunner.hasColumn('attendances', 'scheduleId');
    if (!hasScheduleId) {
      await queryRunner.addColumn(
        'attendances',
        new TableColumn({
          name: 'scheduleId',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAttendances = await queryRunner.hasTable('attendances');
    if (!hasAttendances) {
      return;
    }

    const hasScheduleId = await queryRunner.hasColumn('attendances', 'scheduleId');
    if (hasScheduleId) {
      await queryRunner.dropColumn('attendances', 'scheduleId');
    }
  }
}