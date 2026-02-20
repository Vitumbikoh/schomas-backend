import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBillingInvoiceFieldsToExpense1761033600000 implements MigrationInterface {
  name = 'AddBillingInvoiceFieldsToExpense1761033600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isBillingInvoice flag
    await queryRunner.addColumn(
      'expenses',
      new TableColumn({
        name: 'isBillingInvoice',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Add billingInvoiceId reference
    await queryRunner.addColumn(
      'expenses',
      new TableColumn({
        name: 'billingInvoiceId',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('expenses', 'billingInvoiceId');
    await queryRunner.dropColumn('expenses', 'isBillingInvoice');
  }
}
