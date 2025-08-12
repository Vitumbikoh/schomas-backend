// src/settings/entities/term.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Term {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Changed from termName to name for consistency

  @Column()
  order: number; // To maintain term order (1, 2, 3)
}