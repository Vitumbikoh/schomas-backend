import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateParentDto } from './dtos/update-parent.dto';
import { Parent } from 'src/user/entities/parent.entity';
import { Student } from 'src/user/entities/student.entity';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(Parent)
    private readonly parentRepository: Repository<Parent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async findOne(id: string): Promise<Parent> {
    const parent = await this.parentRepository.findOneBy({ id: String(id) });
  
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }
  
    return parent; // ✅ Now TypeScript knows parent is not null
  }  
  

  async findAll(): Promise<Parent[]> {
    return this.parentRepository.find({ 
      relations: ['user', 'children'],
    });
  }

  async update(id: string, updateParentDto: UpdateParentDto): Promise<Parent> {
    const parent = await this.findOne(id);
    const { user, ...parentData } = updateParentDto;

    // Update parent data
    Object.assign(parent, parentData);

    // Update associated user data if provided
    if (user) {
      const userEntity = await this.userRepository.findOne({
        where: { id: parent.user.id },
      });
      if (userEntity) {
        Object.assign(userEntity, user);
        await this.userRepository.save(userEntity);
      }
    }

    return this.parentRepository.save(parent);
  }

  async remove(id: string): Promise<void> {
    const parent = await this.findOne(id);
    
    // Remove all children associations first
    if (parent.children && parent.children.length > 0) {
      for (const child of parent.children) {
        child.parent = null;
        await this.studentRepository.save(child);
      }
    }

    await this.parentRepository.remove(parent);
    
    // Also remove the associated user
    if (parent.user) {
      await this.userRepository.remove(parent.user);
    }
  }

  async getParentProfile(parentId: string): Promise<Parent> {
    return this.findOne(parentId);
  }

  async getParentChildren(parentId: string): Promise<Student[]> {
    const parent = await this.findOne(parentId);
    return parent.children;
  }
}