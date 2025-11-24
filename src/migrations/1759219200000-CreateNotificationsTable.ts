import { MigrationInterface, QueryRunner, Table, Index } from "typeorm";

export class CreateNotificationsTable1759219200000 implements MigrationInterface {
    name = 'CreateNotificationsTable1759219200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: "notifications",
            columns: [
                {
                    name: "id",
                    type: "uuid",
                    isPrimary: true,
                    generationStrategy: "uuid",
                    default: "uuid_generate_v4()"
                },
                {
                    name: "title",
                    type: "varchar",
                    isNullable: false
                },
                {
                    name: "message",
                    type: "text",
                    isNullable: true
                },
                {
                    name: "type",
                    type: "enum",
                    enum: ["credentials", "system", "alert"],
                    default: "'system'"
                },
                {
                    name: "priority",
                    type: "enum",
                    enum: ["low", "medium", "high"],
                    default: "'medium'"
                },
                {
                    name: "read",
                    type: "boolean",
                    default: false
                },
                {
                    name: "metadata",
                    type: "jsonb",
                    isNullable: true
                },
                {
                    name: "schoolId",
                    type: "uuid",
                    isNullable: true
                },
                {
                    name: "createdAt",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                },
                {
                    name: "updatedAt",
                    type: "timestamp",
                    default: "CURRENT_TIMESTAMP"
                },
                {
                    name: "readAt",
                    type: "timestamp",
                    isNullable: true
                }
            ],
            foreignKeys: [
                {
                    columnNames: ["schoolId"],
                    referencedTableName: "schools",
                    referencedColumnNames: ["id"],
                    onDelete: "SET NULL"
                }
            ],
            indices: [
                {
                    name: "IDX_NOTIFICATIONS_READ",
                    columnNames: ["read"]
                },
                {
                    name: "IDX_NOTIFICATIONS_TYPE",
                    columnNames: ["type"]
                },
                {
                    name: "IDX_NOTIFICATIONS_CREATED_AT",
                    columnNames: ["createdAt"]
                }
            ]
        }), true);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("notifications");
    }
}