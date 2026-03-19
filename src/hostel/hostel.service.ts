import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hostel } from './entities/hostel.entity';
import { HostelRoom } from './entities/hostel-room.entity';
import { HostelAllocation } from './entities/hostel-allocation.entity';
import { HostelRoomNamingMode, HostelSetup } from './entities/hostel-setup.entity';
import { Student } from '../user/entities/student.entity';
import { CreateHostelDto, UpdateHostelDto } from './dtos/hostel.dto';
import { CreateHostelRoomDto, UpdateHostelRoomDto } from './dtos/hostel-room.dto';
import { UpdateHostelSetupDto } from './dtos/hostel-setup.dto';
import {
  CreateHostelAllocationDto,
  ReleaseHostelAllocationDto,
  ReleaseAllHostelAllocationsDto,
} from './dtos/hostel-allocation.dto';

@Injectable()
export class HostelService {
  constructor(
    @InjectRepository(Hostel)
    private readonly hostelRepo: Repository<Hostel>,
    @InjectRepository(HostelRoom)
    private readonly roomRepo: Repository<HostelRoom>,
    @InjectRepository(HostelAllocation)
    private readonly allocationRepo: Repository<HostelAllocation>,
    @InjectRepository(HostelSetup)
    private readonly setupRepo: Repository<HostelSetup>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  private async getOrCreateSetup(schoolId: string) {
    const existing = await this.setupRepo.findOne({ where: { schoolId } });
    if (existing) return existing;

    const created = this.setupRepo.create({
      schoolId,
      roomNamingMode: HostelRoomNamingMode.MANUAL,
      numericPrefix: 'A',
      defaultFloor: 'Ground Floor',
      defaultRoomCapacity: 10,
    });
    return this.setupRepo.save(created);
  }

  private alphaLabel(index: number): string {
    let n = index;
    let label = '';
    while (n >= 0) {
      label = String.fromCharCode((n % 26) + 65) + label;
      n = Math.floor(n / 26) - 1;
    }
    return label;
  }

  private buildRoomNames(mode: string, count: number, prefix: string): string[] {
    if (count <= 0) return [];
    const normalizedPrefix = (prefix || 'A').trim() || 'A';

    if (mode === HostelRoomNamingMode.NUMERIC) {
      return Array.from({ length: count }, (_, idx) => `${normalizedPrefix}${idx + 1}`);
    }

    if (mode === HostelRoomNamingMode.ALPHABETICAL) {
      return Array.from({ length: count }, (_, idx) => this.alphaLabel(idx));
    }

    return [];
  }

  async getSetup(schoolId: string) {
    return this.getOrCreateSetup(schoolId);
  }

  async updateSetup(schoolId: string, dto: UpdateHostelSetupDto) {
    const setup = await this.getOrCreateSetup(schoolId);
    const merged = this.setupRepo.merge(setup, {
      ...dto,
      roomNamingMode: dto.roomNamingMode?.toLowerCase() ?? setup.roomNamingMode,
      numericPrefix: dto.numericPrefix?.trim() ?? setup.numericPrefix,
      defaultFloor: dto.defaultFloor?.trim() ?? setup.defaultFloor,
    });
    return this.setupRepo.save(merged);
  }

  async getSummary(schoolId: string) {
    const [totalHostels, activeHostels, totalRooms] = await Promise.all([
      this.hostelRepo.count({ where: { schoolId } }),
      this.hostelRepo.count({ where: { schoolId, isActive: true } }),
      this.roomRepo.count({ where: { schoolId } }),
    ]);

    const bedRaw = await this.roomRepo
      .createQueryBuilder('room')
      .select('COALESCE(SUM(room.capacity), 0)', 'totalBeds')
      .where('room.schoolId = :schoolId', { schoolId })
      .getRawOne<{ totalBeds: string }>();

    const occupiedBeds = await this.allocationRepo.count({
      where: { schoolId, status: 'active' },
    });

    const totalBeds = Number(bedRaw?.totalBeds || 0);
    const availableBeds = Math.max(totalBeds - occupiedBeds, 0);
    const occupancyRate = totalBeds > 0 ? Number(((occupiedBeds / totalBeds) * 100).toFixed(2)) : 0;

    return {
      totalHostels,
      activeHostels,
      totalRooms,
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyRate,
    };
  }

  async listHostels(schoolId: string, includeRooms = false) {
    const hostels = await this.hostelRepo.find({
      where: { schoolId },
      relations: includeRooms ? ['rooms'] : [],
      order: { name: 'ASC' },
    });

    const [hostelOccupancy, roomOccupancy] = await Promise.all([
      this.allocationRepo
        .createQueryBuilder('allocation')
        .select('allocation.hostelId', 'hostelId')
        .addSelect('COUNT(*)', 'occupied')
        .where('allocation.schoolId = :schoolId', { schoolId })
        .andWhere('allocation.status = :status', { status: 'active' })
        .groupBy('allocation.hostelId')
        .getRawMany<{ hostelId: string; occupied: string }>(),
      this.allocationRepo
        .createQueryBuilder('allocation')
        .select('allocation.roomId', 'roomId')
        .addSelect('COUNT(*)', 'occupied')
        .where('allocation.schoolId = :schoolId', { schoolId })
        .andWhere('allocation.status = :status', { status: 'active' })
        .groupBy('allocation.roomId')
        .getRawMany<{ roomId: string; occupied: string }>(),
    ]);

    const hostelOccupiedMap = new Map(hostelOccupancy.map((entry) => [entry.hostelId, Number(entry.occupied)]));
    const roomOccupiedMap = new Map(roomOccupancy.map((entry) => [entry.roomId, Number(entry.occupied)]));

    return hostels.map((hostel) => {
      const occupied = hostelOccupiedMap.get(hostel.id) ?? 0;

      const rooms = includeRooms
        ? (hostel.rooms || []).map((room) => {
            const roomOccupied = roomOccupiedMap.get(room.id) ?? 0;
            return {
              ...room,
              occupiedBeds: roomOccupied,
              availableBeds: Math.max(room.capacity - roomOccupied, 0),
            };
          })
        : undefined;

      return {
        ...hostel,
        occupiedBeds: occupied,
        availableBeds: Math.max(hostel.capacity - occupied, 0),
        rooms,
      };
    });
  }

  async createHostel(schoolId: string, dto: CreateHostelDto) {
    const normalizedName = dto.name.trim();
    const existing = await this.hostelRepo.findOne({
      where: { schoolId, name: normalizedName },
    });

    if (existing) {
      throw new BadRequestException('A hostel with this name already exists.');
    }

    const setup = await this.getOrCreateSetup(schoolId);

    const mode = setup.roomNamingMode;
    const requestedRoomCount = dto.roomCount ?? 0;
    let roomCapacity = dto.roomCapacity ?? setup.defaultRoomCapacity;
    roomCapacity = Math.max(1, roomCapacity);
    if (roomCapacity > dto.capacity) {
      roomCapacity = dto.capacity;
    }
    const floor = dto.floor?.trim() || setup.defaultFloor || 'Ground Floor';
    const autoDerivedRoomCount = Math.max(Math.floor(dto.capacity / roomCapacity), 1);
    const roomCount = requestedRoomCount > 0 ? requestedRoomCount : autoDerivedRoomCount;

    const generatedNames =
      mode !== HostelRoomNamingMode.MANUAL && roomCount > 0
        ? this.buildRoomNames(mode, roomCount, setup.numericPrefix)
        : [];
    const totalGeneratedBeds = generatedNames.length * roomCapacity;

    if (mode !== HostelRoomNamingMode.MANUAL && totalGeneratedBeds > dto.capacity) {
      throw new BadRequestException(
        `Generated room capacity (${totalGeneratedBeds}) exceeds hostel capacity (${dto.capacity}).`,
      );
    }

    return this.hostelRepo.manager.transaction(async (manager) => {
      const txHostelRepo = manager.getRepository(Hostel);
      const txRoomRepo = manager.getRepository(HostelRoom);

      const hostel = txHostelRepo.create({
        name: normalizedName,
        gender: dto.gender.toLowerCase(),
        capacity: dto.capacity,
        isActive: dto.isActive,
        wardenName: dto.wardenName,
        wardenPhone: dto.wardenPhone,
        notes: dto.notes,
        schoolId,
      });

      const savedHostel = await txHostelRepo.save(hostel);

      if (generatedNames.length > 0) {
        const rooms = generatedNames.map((name) =>
          txRoomRepo.create({
            hostelId: savedHostel.id,
            schoolId,
            name,
            floor,
            capacity: roomCapacity,
            isActive: true,
          }),
        );
        await txRoomRepo.save(rooms);
      }

      return {
        ...savedHostel,
        setupMode: mode,
        generatedRooms: mode !== HostelRoomNamingMode.MANUAL ? generatedNames.length : 0,
        defaultFloorApplied: floor,
        roomCapacityApplied: roomCapacity,
      };
    });
  }

  async updateHostel(schoolId: string, id: string, dto: UpdateHostelDto) {
    const hostel = await this.hostelRepo.findOne({ where: { id, schoolId } });
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }

    if (dto.name && dto.name.trim().toLowerCase() !== hostel.name.trim().toLowerCase()) {
      const duplicate = await this.hostelRepo.findOne({
        where: { schoolId, name: dto.name.trim() },
      });
      if (duplicate) {
        throw new BadRequestException('Another hostel already uses this name.');
      }
    }

    if (dto.capacity !== undefined) {
      const occupiedBeds = await this.allocationRepo.count({
        where: { schoolId, hostelId: hostel.id, status: 'active' },
      });
      if (dto.capacity < occupiedBeds) {
        throw new BadRequestException(
          `Hostel capacity cannot be below occupied beds (${occupiedBeds}).`,
        );
      }
    }

    const merged = this.hostelRepo.merge(hostel, {
      ...dto,
      name: dto.name?.trim() ?? hostel.name,
      gender: dto.gender?.toLowerCase() ?? hostel.gender,
    });

    return this.hostelRepo.save(merged);
  }

  async deleteHostel(schoolId: string, id: string) {
    const hostel = await this.hostelRepo.findOne({ where: { id, schoolId } });
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }

    const activeAllocations = await this.allocationRepo.count({
      where: { schoolId, hostelId: id, status: 'active' },
    });
    if (activeAllocations > 0) {
      throw new BadRequestException('Cannot delete a hostel with active allocations.');
    }

    await this.hostelRepo.delete(id);
    return { success: true };
  }

  async listRooms(schoolId: string, hostelId: string) {
    const hostel = await this.hostelRepo.findOne({ where: { id: hostelId, schoolId } });
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }

    const rooms = await this.roomRepo.find({
      where: { schoolId, hostelId },
      order: { name: 'ASC' },
    });

    const occupancy = await this.allocationRepo
      .createQueryBuilder('allocation')
      .select('allocation.roomId', 'roomId')
      .addSelect('COUNT(*)', 'occupied')
      .where('allocation.schoolId = :schoolId', { schoolId })
      .andWhere('allocation.hostelId = :hostelId', { hostelId })
      .andWhere('allocation.status = :status', { status: 'active' })
      .groupBy('allocation.roomId')
      .getRawMany<{ roomId: string; occupied: string }>();

    const occupancyMap = new Map(occupancy.map((entry) => [entry.roomId, Number(entry.occupied)]));

    return rooms.map((room) => {
      const occupiedBeds = occupancyMap.get(room.id) ?? 0;
      return {
        ...room,
        occupiedBeds,
        availableBeds: Math.max(room.capacity - occupiedBeds, 0),
      };
    });
  }

  async createRoom(schoolId: string, hostelId: string, dto: CreateHostelRoomDto) {
    const hostel = await this.hostelRepo.findOne({ where: { id: hostelId, schoolId } });
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }

    const duplicateRoom = await this.roomRepo.findOne({
      where: { schoolId, hostelId, name: dto.name.trim() },
    });
    if (duplicateRoom) {
      throw new BadRequestException('A room with this name already exists in this hostel.');
    }

    const currentCapacityRaw = await this.roomRepo
      .createQueryBuilder('room')
      .select('COALESCE(SUM(room.capacity), 0)', 'total')
      .where('room.schoolId = :schoolId', { schoolId })
      .andWhere('room.hostelId = :hostelId', { hostelId })
      .getRawOne<{ total: string }>();

    const currentCapacity = Number(currentCapacityRaw?.total || 0);
    if (currentCapacity + dto.capacity > hostel.capacity) {
      throw new BadRequestException(
        `Room capacity exceeds hostel capacity. Remaining allowed beds: ${Math.max(hostel.capacity - currentCapacity, 0)}.`,
      );
    }

    const room = this.roomRepo.create({
      ...dto,
      name: dto.name.trim(),
      hostelId,
      schoolId,
    });

    return this.roomRepo.save(room);
  }

  async updateRoom(schoolId: string, roomId: string, dto: UpdateHostelRoomDto) {
    const room = await this.roomRepo.findOne({ where: { id: roomId, schoolId } });
    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    const hostel = await this.hostelRepo.findOne({ where: { id: room.hostelId, schoolId } });
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }

    if (dto.name && dto.name.trim().toLowerCase() !== room.name.trim().toLowerCase()) {
      const duplicate = await this.roomRepo.findOne({
        where: { schoolId, hostelId: room.hostelId, name: dto.name.trim() },
      });
      if (duplicate && duplicate.id !== room.id) {
        throw new BadRequestException('Another room in this hostel already uses this name.');
      }
    }

    if (dto.capacity !== undefined) {
      const activeInRoom = await this.allocationRepo.count({
        where: { schoolId, roomId: room.id, status: 'active' },
      });
      if (dto.capacity < activeInRoom) {
        throw new BadRequestException(
          `Room capacity cannot be below occupied beds (${activeInRoom}).`,
        );
      }

      const otherCapacityRaw = await this.roomRepo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.capacity), 0)', 'total')
        .where('r.schoolId = :schoolId', { schoolId })
        .andWhere('r.hostelId = :hostelId', { hostelId: room.hostelId })
        .andWhere('r.id != :roomId', { roomId: room.id })
        .getRawOne<{ total: string }>();

      const otherCapacity = Number(otherCapacityRaw?.total || 0);
      if (otherCapacity + dto.capacity > hostel.capacity) {
        throw new BadRequestException(
          `Room capacity update exceeds hostel capacity (${hostel.capacity}).`,
        );
      }
    }

    const merged = this.roomRepo.merge(room, {
      ...dto,
      name: dto.name?.trim() ?? room.name,
    });

    return this.roomRepo.save(merged);
  }

  async deleteRoom(schoolId: string, roomId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId, schoolId } });
    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    const activeAllocations = await this.allocationRepo.count({
      where: { schoolId, roomId, status: 'active' },
    });

    if (activeAllocations > 0) {
      throw new BadRequestException('Cannot delete a room with active allocations.');
    }

    await this.roomRepo.delete(roomId);
    return { success: true };
  }

  async searchStudents(params: { schoolId: string; q: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
    const needle = params.q.trim().toLowerCase();
    if (!needle) return [];

    const rows = await this.studentRepo
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.class', 'class')
      .leftJoinAndSelect('student.user', 'user')
      .where('student.schoolId = :schoolId', { schoolId: params.schoolId })
      .andWhere(
        `(
          LOWER(student.studentId) LIKE :prefix
          OR LOWER(student.studentId) LIKE :contains
          OR LOWER(student.firstName) LIKE :contains
          OR LOWER(student.lastName) LIKE :contains
          OR LOWER(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) LIKE :contains
          OR LOWER(COALESCE(user.username, '')) LIKE :contains
        )`,
        {
          prefix: `${needle}%`,
          contains: `%${needle}%`,
        },
      )
      .orderBy('student.studentId', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((student) => ({
      id: student.id,
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      username: (student as any).user?.username,
      gender: student.gender,
      class: student.class
        ? {
            id: student.class.id,
            name: student.class.name,
            numericalName: student.class.numericalName,
          }
        : undefined,
    }));
  }

  async listAllocations(
    schoolId: string,
    options?: {
      activeOnly?: boolean;
      hostelId?: string;
      studentSearch?: string;
    },
  ) {
    const qb = this.allocationRepo
      .createQueryBuilder('allocation')
      .leftJoinAndSelect('allocation.student', 'student')
      .leftJoinAndSelect('student.class', 'class')
      .leftJoinAndSelect('allocation.hostel', 'hostel')
      .leftJoinAndSelect('allocation.room', 'room')
      .where('allocation.schoolId = :schoolId', { schoolId });

    if (options?.activeOnly !== false) {
      qb.andWhere('allocation.status = :status', { status: 'active' });
    }

    if (options?.hostelId) {
      qb.andWhere('allocation.hostelId = :hostelId', { hostelId: options.hostelId });
    }

    if (options?.studentSearch?.trim()) {
      const q = `%${options.studentSearch.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(student.studentId) LIKE :q OR LOWER(student.firstName) LIKE :q OR LOWER(student.lastName) LIKE :q)',
        { q },
      );
    }

    return qb.orderBy('allocation.assignedAt', 'DESC').getMany();
  }

  async allocateStudent(schoolId: string, dto: CreateHostelAllocationDto) {
    const [student, hostel, room] = await Promise.all([
      this.studentRepo.findOne({ where: { id: dto.studentId, schoolId } }),
      this.hostelRepo.findOne({ where: { id: dto.hostelId, schoolId } }),
      this.roomRepo.findOne({ where: { id: dto.roomId, schoolId } }),
    ]);

    if (!student) {
      throw new NotFoundException('Student not found.');
    }
    if (!hostel) {
      throw new NotFoundException('Hostel not found.');
    }
    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    if (room.hostelId !== hostel.id) {
      throw new BadRequestException('Selected room does not belong to selected hostel.');
    }

    if (!hostel.isActive || !room.isActive) {
      throw new ForbiddenException('Allocation is only allowed in active hostels and rooms.');
    }

    const currentStudentAllocation = await this.allocationRepo.findOne({
      where: { schoolId, studentId: dto.studentId, status: 'active' },
    });

    if (currentStudentAllocation) {
      throw new BadRequestException('Student already has an active hostel allocation.');
    }

    const currentRoomOccupancy = await this.allocationRepo.count({
      where: { schoolId, roomId: dto.roomId, status: 'active' },
    });

    if (currentRoomOccupancy >= room.capacity) {
      throw new BadRequestException('Room is already full.');
    }

    if (dto.bedNumber?.trim()) {
      const existingBed = await this.allocationRepo.findOne({
        where: {
          schoolId,
          roomId: dto.roomId,
          bedNumber: dto.bedNumber.trim(),
          status: 'active',
        },
      });
      if (existingBed) {
        throw new BadRequestException('Bed number is already occupied in this room.');
      }
    }

    const hostelGender = hostel.gender?.toLowerCase() || 'mixed';
    const studentGender = (student.gender || '').toLowerCase();
    if (hostelGender !== 'mixed' && studentGender && studentGender !== hostelGender) {
      throw new BadRequestException(
        `Gender mismatch. Student cannot be allocated to ${hostel.gender} hostel.`,
      );
    }

    const allocation = this.allocationRepo.create({
      schoolId,
      studentId: dto.studentId,
      hostelId: dto.hostelId,
      roomId: dto.roomId,
      bedNumber: dto.bedNumber?.trim() || undefined,
      notes: dto.notes,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : new Date(),
      status: 'active',
    });

    return this.allocationRepo.save(allocation);
  }

  async releaseAllocation(schoolId: string, allocationId: string, dto: ReleaseHostelAllocationDto) {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId, schoolId },
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found.');
    }

    if (allocation.status !== 'active') {
      return allocation;
    }

    allocation.status = 'released';
    allocation.releasedAt = dto.releasedAt ? new Date(dto.releasedAt) : new Date();
    allocation.releaseReason = dto.reason || undefined;

    return this.allocationRepo.save(allocation);
  }

  async releaseAllAllocations(schoolId: string, dto: ReleaseAllHostelAllocationsDto) {
    const now = new Date();
    const reason = dto.reason?.trim() || 'Released in bulk by admin';

    if (dto.hostelId) {
      const hostel = await this.hostelRepo.findOne({ where: { id: dto.hostelId, schoolId } });
      if (!hostel) {
        throw new NotFoundException('Hostel not found.');
      }
    }

    const qb = this.allocationRepo
      .createQueryBuilder()
      .update(HostelAllocation)
      .set({
        status: 'released',
        releasedAt: now,
        releaseReason: reason,
      })
      .where('schoolId = :schoolId', { schoolId })
      .andWhere('status = :status', { status: 'active' });

    if (dto.hostelId) {
      qb.andWhere('hostelId = :hostelId', { hostelId: dto.hostelId });
    }

    const result = await qb.execute();
    return {
      success: true,
      releasedCount: result.affected || 0,
    };
  }
}
