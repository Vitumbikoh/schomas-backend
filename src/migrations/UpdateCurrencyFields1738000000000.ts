import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateCurrencyFields1738000000000 implements MigrationInterface {
  name = 'UpdateCurrencyFields1738000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update billing_invoice currency column
    await queryRunner.query(`
      ALTER TABLE billing_invoice
      ALTER COLUMN currency TYPE VARCHAR(3),
      ALTER COLUMN currency SET DEFAULT 'MWK',
      ALTER COLUMN currency SET NOT NULL
    `);

    // Update school_billing_plan currency column
    await queryRunner.query(`
      ALTER TABLE school_billing_plan
      ALTER COLUMN currency TYPE VARCHAR(3),
      ALTER COLUMN currency SET DEFAULT 'MWK',
      ALTER COLUMN currency SET NOT NULL
    `);

    // Add currency column to fee_payment if it doesn't exist
    const feePaymentTable = await queryRunner.getTable('fee_payment');
    const currencyColumn = feePaymentTable?.findColumnByName('currency');

    if (!currencyColumn && feePaymentTable) {
      await queryRunner.addColumn('fee_payment', new TableColumn({
        name: 'currency',
        type: 'enum',
        enum: ['MWK', 'USD'],
        default: "'MWK'",
        isNullable: false
      }));
    }

    // Add currency column to fee_structure if it doesn't exist
    const feeStructureTable = await queryRunner.getTable('fee_structure');
    const currencyColumnFS = feeStructureTable?.findColumnByName('currency');

    if (!currencyColumnFS && feeStructureTable) {
      await queryRunner.addColumn('fee_structure', new TableColumn({
        name: 'currency',
        type: 'enum',
        enum: ['MWK', 'USD'],
        default: "'MWK'",
        isNullable: false
      }));
    }

    // Update existing records to use MWK as default
    await queryRunner.query(`UPDATE billing_invoice SET currency = 'MWK' WHERE currency NOT IN ('MWK', 'USD') OR currency IS NULL`);
    await queryRunner.query(`UPDATE school_billing_plan SET currency = 'MWK' WHERE currency NOT IN ('MWK', 'USD') OR currency IS NULL`);
    await queryRunner.query(`UPDATE fee_payment SET currency = 'MWK' WHERE currency NOT IN ('MWK', 'USD') OR currency IS NULL`);
    await queryRunner.query(`UPDATE fee_structure SET currency = 'MWK' WHERE currency NOT IN ('MWK', 'USD') OR currency IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert currency columns back to original state
    await queryRunner.query(`
      ALTER TABLE billing_invoice
      ALTER COLUMN currency TYPE VARCHAR(20),
      ALTER COLUMN currency SET DEFAULT 'USD',
      ALTER COLUMN currency DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE school_billing_plan
      ALTER COLUMN currency TYPE VARCHAR(8),
      ALTER COLUMN currency SET DEFAULT 'USD',
      ALTER COLUMN currency DROP NOT NULL
    `);

    // Remove currency columns from fee_payment and fee_structure
    const feePaymentTable = await queryRunner.getTable('fee_payment');
    const currencyColumn = feePaymentTable?.findColumnByName('currency');
    if (currencyColumn && feePaymentTable) {
      await queryRunner.dropColumn('fee_payment', 'currency');
    }

    const feeStructureTable = await queryRunner.getTable('fee_structure');
    const currencyColumnFS = feeStructureTable?.findColumnByName('currency');
    if (currencyColumnFS && feeStructureTable) {
      await queryRunner.dropColumn('fee_structure', 'currency');
    }
  }
}