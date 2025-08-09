// import { Entity, PrimaryColumn, Column } from 'typeorm';

// @Entity('logs') // Match the actual table name
// export class Activity {
//   @PrimaryColumn('uuid')
//   id: string;

//   @Column()
//   action: string;

//   @Column('jsonb', { name: 'performedBy' }) // Explicit column name
//   performedBy: {
//     id?: string;
//     email: string;
//     role: string;
//   };

//   @Column('jsonb', { name: 'studentCreated', nullable: true })
//   studentCreated?: {
//     id: string;
//     fullName: string;
//   };

//   @Column({ name: 'timestamp', type: 'timestamp' })
//   timestamp: Date;

//   @Column({ name: 'ipAddress' })
//   ipAddress: string;

//   @Column({ name: 'userAgent' })
//   userAgent: string;
// }