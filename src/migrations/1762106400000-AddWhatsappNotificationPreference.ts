import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappNotificationPreference1762106400000 implements MigrationInterface {
  name = 'AddWhatsappNotificationPreference1762106400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUserSettings = await queryRunner.hasTable('user_settings');
    if (!hasUserSettings) {
      return;
    }

    const hasNotifications = await queryRunner.hasColumn('user_settings', 'notifications');
    if (!hasNotifications) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "notifications" SET DEFAULT '{"email": true, "sms": false, "browser": true, "whatsapp": false, "weeklySummary": false}'`,
    );

    await queryRunner.query(`
      UPDATE "user_settings"
      SET "notifications" =
        COALESCE("notifications", '{}'::jsonb)
        || jsonb_build_object(
          'email', COALESCE(("notifications"->>'email')::boolean, true),
          'sms', COALESCE(("notifications"->>'sms')::boolean, false),
          'browser', COALESCE(("notifications"->>'browser')::boolean, true),
          'whatsapp', COALESCE(("notifications"->>'whatsapp')::boolean, false),
          'weeklySummary', COALESCE(("notifications"->>'weeklySummary')::boolean, false)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUserSettings = await queryRunner.hasTable('user_settings');
    if (!hasUserSettings) {
      return;
    }

    const hasNotifications = await queryRunner.hasColumn('user_settings', 'notifications');
    if (!hasNotifications) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "user_settings" ALTER COLUMN "notifications" SET DEFAULT '{"email": true, "sms": false, "browser": true, "weeklySummary": true}'`,
    );

    await queryRunner.query(`
      UPDATE "user_settings"
      SET "notifications" = "notifications" - 'whatsapp'
    `);
  }
}
