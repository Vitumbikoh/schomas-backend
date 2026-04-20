import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBillingInvoiceFieldsToExpense1761033600000 implements MigrationInterface {
  name = 'AddBillingInvoiceFieldsToExpense1761033600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasExpenses = await queryRunner.hasTable('expenses');
    if (!hasExpenses) {
      return;
    }

    const hasIsBillingInvoice = await queryRunner.hasColumn('expenses', 'isBillingInvoice');
    const hasBillingInvoiceId = await queryRunner.hasColumn('expenses', 'billingInvoiceId');

    // Add isBillingInvoice flag
    if (!hasIsBillingInvoice) {
      await queryRunner.addColumn(
        'expenses',
        new TableColumn({
          name: 'isBillingInvoice',
          type: 'boolean',
          default: false,
          isNullable: false,
        }),
      );
    }

    // Add billingInvoiceId reference
    if (!hasBillingInvoiceId) {
      await queryRunner.addColumn(
        'expenses',
        new TableColumn({
          name: 'billingInvoiceId',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasExpenses = await queryRunner.hasTable('expenses');
    if (!hasExpenses) {
      return;
    }

    const hasBillingInvoiceId = await queryRunner.hasColumn('expenses', 'billingInvoiceId');
    const hasIsBillingInvoice = await queryRunner.hasColumn('expenses', 'isBillingInvoice');

    if (hasBillingInvoiceId) {
      await queryRunner.dropColumn('expenses', 'billingInvoiceId');
    }
    if (hasIsBillingInvoice) {
      await queryRunner.dropColumn('expenses', 'isBillingInvoice');
    }
  }
}
