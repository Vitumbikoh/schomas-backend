import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Teacher } from '../user/entities/teacher.entity';
import { Student } from '../user/entities/student.entity';
import { Parent } from '../user/entities/parent.entity';
import { Finance } from '../user/entities/finance.entity';
import { Role } from '../user/enums/role.enum';
import { School } from '../school/entities/school.entity';
import { UpdateProfileDto, ProfileResponseDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Teacher)
    private teacherRepository: Repository<Teacher>,
    @InjectRepository(Student)
    private studentRepository: Repository<Student>,
    @InjectRepository(Parent)
    private parentRepository: Repository<Parent>,
    @InjectRepository(Finance)
    private financeRepository: Repository<Finance>,
    @InjectRepository(School)
    private schoolRepository: Repository<School>,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Get user with school information
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['school'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Base profile information for all users
    const baseProfile: ProfileResponseDto = {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email ?? null,
      school: user.school ? {
        id: user.school.id,
        name: user.school.name,
        code: user.school.code,
      } : null,
    };

    // For ADMIN and SUPER_ADMIN, return only base profile
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      return baseProfile;
    }

    // For other roles, get additional profile details
    let roleSpecificProfile = {};

    switch (user.role) {
      case Role.TEACHER:
        const teacher = await this.teacherRepository.findOne({
          where: { userId: user.id },
        });
        if (teacher) {
          roleSpecificProfile = {
            teacherId: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            phoneNumber: teacher.phoneNumber,
          };
        }
        break;

      case Role.STUDENT:
        const student = await this.studentRepository.findOne({
          where: { userId: user.id },
        });
        if (student) {
          roleSpecificProfile = {
            firstName: student.firstName,
            lastName: student.lastName,
            phoneNumber: student.phoneNumber,
            studentId: student.studentId,
            address: student.address,
            dateOfBirth: student.dateOfBirth,
          };
        }
        break;

      case Role.PARENT:
        const parent = await this.parentRepository.findOne({
          where: { user: { id: user.id } },
        });
        if (parent) {
          roleSpecificProfile = {
            firstName: parent.firstName,
            lastName: parent.lastName,
            phoneNumber: parent.phoneNumber,
            address: parent.address,
            dateOfBirth: parent.dateOfBirth,
            gender: parent.gender,
            occupation: parent.occupation,
          };
        }
        break;

      case Role.FINANCE:
        const finance = await this.financeRepository.findOne({
          where: { user: { id: user.id } },
        });
        if (finance) {
          roleSpecificProfile = {
            firstName: finance.firstName,
            lastName: finance.lastName,
            phoneNumber: finance.phoneNumber,
            address: finance.address,
            dateOfBirth: finance.dateOfBirth,
            gender: finance.gender,
          };
        }
        break;

      default:
        // For any other roles, return only base profile
        break;
    }

    return {
      ...baseProfile,
      ...roleSpecificProfile,
    } as ProfileResponseDto;
  }

  async updateProfile(userId: string, updateData: UpdateProfileDto): Promise<ProfileResponseDto> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update base user information if provided
    if (updateData.username) user.username = updateData.username;
    if (updateData.email) user.email = updateData.email;
    if (updateData.phone) user.phone = updateData.phone;
    if (updateData.image) user.image = updateData.image;

    await this.userRepository.save(user);

    // Update role-specific information
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      switch (user.role) {
        case Role.TEACHER:
          const teacher = await this.teacherRepository.findOne({
            where: { userId: user.id },
          });
          if (teacher && updateData.firstName) teacher.firstName = updateData.firstName;
          if (teacher && updateData.lastName) teacher.lastName = updateData.lastName;
          if (teacher && updateData.phoneNumber) teacher.phoneNumber = updateData.phoneNumber;
          if (teacher) await this.teacherRepository.save(teacher);
          break;

        case Role.STUDENT:
          const student = await this.studentRepository.findOne({
            where: { userId: user.id },
          });
          if (student && updateData.firstName) student.firstName = updateData.firstName;
          if (student && updateData.lastName) student.lastName = updateData.lastName;
          if (student && updateData.phoneNumber) student.phoneNumber = updateData.phoneNumber;
          if (student && updateData.address) student.address = updateData.address;
          if (student && updateData.dateOfBirth) student.dateOfBirth = new Date(updateData.dateOfBirth);
          if (student) await this.studentRepository.save(student);
          break;

        case Role.PARENT:
          const parent = await this.parentRepository.findOne({
            where: { user: { id: user.id } },
          });
          if (parent && updateData.firstName) parent.firstName = updateData.firstName;
          if (parent && updateData.lastName) parent.lastName = updateData.lastName;
          if (parent && updateData.phoneNumber) parent.phoneNumber = updateData.phoneNumber;
          if (parent && updateData.address) parent.address = updateData.address;
          if (parent && updateData.dateOfBirth) parent.dateOfBirth = new Date(updateData.dateOfBirth);
          if (parent && updateData.gender) parent.gender = updateData.gender;
          if (parent && updateData.occupation) parent.occupation = updateData.occupation;
          if (parent) await this.parentRepository.save(parent);
          break;

        case Role.FINANCE:
          const finance = await this.financeRepository.findOne({
            where: { user: { id: user.id } },
          });
          if (finance && updateData.firstName) finance.firstName = updateData.firstName;
          if (finance && updateData.lastName) finance.lastName = updateData.lastName;
          if (finance && updateData.phoneNumber) finance.phoneNumber = updateData.phoneNumber;
          if (finance && updateData.address) finance.address = updateData.address;
          if (finance && updateData.dateOfBirth) finance.dateOfBirth = new Date(updateData.dateOfBirth);
          if (finance && updateData.gender) finance.gender = updateData.gender;
          if (finance) await this.financeRepository.save(finance);
          break;
      }
    }

    // Return updated profile
    return this.getProfile(userId);
  }
}
