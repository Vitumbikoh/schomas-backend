// // src/parent/entities/parent.entity.ts
// import { 
//     Entity, 
//     PrimaryGeneratedColumn, 
//     Column, 
//     OneToOne, 
//     JoinColumn,
//     OneToMany 
//   } from 'typeorm';
//   import { User } from '../../user/entities/user.entity';
//   import { Student } from '../../student/entities/student.entity';
  
//   @Entity()
//   export class Parent {
//     @PrimaryGeneratedColumn()
//     id: number;
  
//     @Column()
//     firstName: string;
  
//     @Column()
//     lastName: string;
  
//     @Column()
//     phoneNumber: string;
  
//     @Column()
//     address: string;
  
//     @Column({ type: 'date', nullable: true })
//     dateOfBirth?: Date;
  
//     @Column({ nullable: true })
//     occupation?: string;
  
//     @OneToOne(() => User, { onDelete: 'CASCADE' })
//     @JoinColumn()
//     user: User;
  
//     @OneToMany(() => Student, student => student.parent)
//     children: Student[];
  
//     constructor(partial?: Partial<Parent>) {
//       if (partial) {
//         Object.assign(this, partial);
//       }
//     }
//   }