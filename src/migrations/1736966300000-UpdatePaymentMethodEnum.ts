import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdatePaymentMethodEnum1736966300000 implements MigrationInterface {
    name = 'UpdatePaymentMethodEnum1736966300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update existing records that use the old enum values
        await queryRunner.query(`
            UPDATE fee_payment 
            SET "paymentMethod" = 'cash' 
            WHERE "paymentMethod" IN ('mpesa', 'card', 'mobile_money')
        `);

        // Drop the existing constraint
        await queryRunner.query(`
            ALTER TABLE "fee_payment" 
            DROP CONSTRAINT IF EXISTS "CHK_fee_payment_paymentMethod"
        `);

        // Update the enum to only include cash and bank_transfer
        await queryRunner.query(`
            ALTER TABLE "fee_payment" 
            ADD CONSTRAINT "CHK_fee_payment_paymentMethod" 
            CHECK ("paymentMethod" IN ('cash', 'bank_transfer'))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the constraint
        await queryRunner.query(`
            ALTER TABLE "fee_payment" 
            DROP CONSTRAINT IF EXISTS "CHK_fee_payment_paymentMethod"
        `);

        // Restore the original enum values
        await queryRunner.query(`
            ALTER TABLE "fee_payment" 
            ADD CONSTRAINT "CHK_fee_payment_paymentMethod" 
            CHECK ("paymentMethod" IN ('cash', 'bank_transfer', 'mpesa', 'card', 'mobile_money'))
        `);
    }
}