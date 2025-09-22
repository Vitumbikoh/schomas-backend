import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayrollTables1758546767922 implements MigrationInterface {
    name = 'CreatePayrollTables1758546767922'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" ALTER COLUMN "notifications" SET DEFAULT '{"email": true, "sms": false, "browser": true, "weeklySummary": true}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_settings" ALTER COLUMN "notifications" SET DEFAULT '{"sms": false, "email": true, "browser": true, "weeklySummary": true}'`);
    }

}
