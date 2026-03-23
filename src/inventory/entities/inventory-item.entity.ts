import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { School } from '../../school/entities/school.entity';
import { StockTransaction } from './stock-transaction.entity';

@Entity('inventory_items')
@Unique(['schoolId', 'itemCode'])
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  itemCode: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  unit?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'int', default: 0 })
  currentStock: number;

  @Column({ type: 'int', default: 0 })
  minimumThreshold: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  unitCost: number;

  @Column({ nullable: true })
  supplier?: string;

  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => StockTransaction, (transaction) => transaction.item)
  stockTransactions: StockTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
