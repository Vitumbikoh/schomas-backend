// src/settings/entities/period.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Period {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Period name like "First Period", "Second Period", etc.

  @Column()
  order: number; // To maintain period order (1, 2, 3)
}
