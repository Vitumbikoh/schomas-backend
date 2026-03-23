import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset, AssetStatus } from './entities/asset.entity';
import {
  AssetAssignment,
  AssetAssignmentStatus,
} from './entities/asset-assignment.entity';
import {
  MaintenanceLog,
  MaintenanceStatus,
  MaintenanceType,
} from './entities/maintenance-log.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import {
  StockTransaction,
  StockTransactionType,
} from './entities/stock-transaction.entity';
import { CreateAssetDto, UpdateAssetDto } from './dtos/asset.dto';
import {
  CreateAssetAssignmentDto,
  ReleaseAssetAssignmentDto,
  TransferAssetAssignmentDto,
} from './dtos/asset-assignment.dto';
import {
  CreateMaintenanceLogDto,
  UpdateMaintenanceLogDto,
} from './dtos/maintenance.dto';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dtos/inventory-item.dto';
import { CreateStockTransactionDto } from './dtos/stock-transaction.dto';
import { User } from '../user/entities/user.entity';
import { Role } from '../user/enums/role.enum';

export type ActorContext = {
  id?: string;
  role: string;
  schoolId?: string;
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetAssignment)
    private readonly assignmentRepo: Repository<AssetAssignment>,
    @InjectRepository(MaintenanceLog)
    private readonly maintenanceRepo: Repository<MaintenanceLog>,
    @InjectRepository(InventoryItem)
    private readonly inventoryItemRepo: Repository<InventoryItem>,
    @InjectRepository(StockTransaction)
    private readonly stockTransactionRepo: Repository<StockTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private ensureSchoolScope(schoolId?: string) {
    if (!schoolId) {
      throw new ForbiddenException('Missing school scope');
    }
  }

  private normalizeRole(role?: string): string {
    return (role || '').toUpperCase();
  }

  private async validateAssignedUserScope(schoolId: string, userId?: string) {
    if (!userId) return;
    const user = await this.userRepo.findOne({ where: { id: userId, schoolId } });
    if (!user) {
      throw new BadRequestException('Assigned user not found in this school.');
    }
  }

  private async ensureTeacherCanReportAsset(schoolId: string, actorId?: string, assetId?: string) {
    if (!actorId || !assetId) {
      throw new ForbiddenException('Invalid maintenance requester context.');
    }

    const asset = await this.assetRepo.findOne({ where: { id: assetId, schoolId } });
    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    if (asset.assignedUserId === actorId) {
      return;
    }

    const activeAssignment = await this.assignmentRepo.findOne({
      where: {
        schoolId,
        assetId,
        assignedUserId: actorId,
        status: AssetAssignmentStatus.ACTIVE,
      },
    });

    if (!activeAssignment) {
      throw new ForbiddenException('Teachers can only report maintenance for assets assigned to them.');
    }
  }

  async getSummary(schoolId: string) {
    this.ensureSchoolScope(schoolId);

    const [
      totalAssets,
      activeAssets,
      underMaintenanceAssets,
      retiredAssets,
      totalInventoryItems,
      lowStockCount,
      pendingMaintenance,
      completedMaintenance,
    ] = await Promise.all([
      this.assetRepo.count({ where: { schoolId } }),
      this.assetRepo.count({ where: { schoolId, status: AssetStatus.ACTIVE } }),
      this.assetRepo.count({ where: { schoolId, status: AssetStatus.UNDER_MAINTENANCE } }),
      this.assetRepo.count({ where: { schoolId, status: AssetStatus.RETIRED } }),
      this.inventoryItemRepo.count({ where: { schoolId } }),
      this.inventoryItemRepo
        .createQueryBuilder('item')
        .where('item.schoolId = :schoolId', { schoolId })
        .andWhere('item.currentStock <= item.minimumThreshold')
        .getCount(),
      this.maintenanceRepo.count({ where: { schoolId, status: MaintenanceStatus.PENDING } }),
      this.maintenanceRepo.count({ where: { schoolId, status: MaintenanceStatus.COMPLETED } }),
    ]);

    const valueRaw = await this.assetRepo
      .createQueryBuilder('asset')
      .select('COALESCE(SUM(asset.purchaseCost), 0)', 'totalAssetValue')
      .where('asset.schoolId = :schoolId', { schoolId })
      .andWhere('asset.status != :retired', { retired: AssetStatus.RETIRED })
      .getRawOne<{ totalAssetValue: string }>();

    const maintenanceCostRaw = await this.maintenanceRepo
      .createQueryBuilder('maintenance')
      .select('COALESCE(SUM(maintenance.repairCost), 0)', 'totalMaintenanceCost')
      .where('maintenance.schoolId = :schoolId', { schoolId })
      .getRawOne<{ totalMaintenanceCost: string }>();

    return {
      totalAssets,
      activeAssets,
      underMaintenanceAssets,
      retiredAssets,
      totalInventoryItems,
      lowStockCount,
      pendingMaintenance,
      completedMaintenance,
      totalAssetValue: Number(valueRaw?.totalAssetValue || 0),
      totalMaintenanceCost: Number(maintenanceCostRaw?.totalMaintenanceCost || 0),
    };
  }

  async listAssets(
    schoolId: string,
    filters?: {
      q?: string;
      category?: string;
      status?: AssetStatus;
      assignedUserId?: string;
      location?: string;
    },
  ) {
    this.ensureSchoolScope(schoolId);

    const qb = this.assetRepo
      .createQueryBuilder('asset')
      .leftJoinAndSelect('asset.assignedUser', 'assignedUser')
      .where('asset.schoolId = :schoolId', { schoolId });

    if (filters?.q) {
      qb.andWhere(
        '(LOWER(asset.name) LIKE :q OR LOWER(asset.assetTag) LIKE :q OR LOWER(asset.category) LIKE :q)',
        {
          q: `%${filters.q.toLowerCase()}%`,
        },
      );
    }

    if (filters?.category) {
      qb.andWhere('asset.category = :category', { category: filters.category });
    }

    if (filters?.status) {
      qb.andWhere('asset.status = :status', { status: filters.status });
    }

    if (filters?.assignedUserId) {
      qb.andWhere('asset.assignedUserId = :assignedUserId', {
        assignedUserId: filters.assignedUserId,
      });
    }

    if (filters?.location) {
      qb.andWhere('LOWER(asset.location) LIKE :location', {
        location: `%${filters.location.toLowerCase()}%`,
      });
    }

    return qb.orderBy('asset.createdAt', 'DESC').getMany();
  }

  async getAssetById(schoolId: string, id: string) {
    this.ensureSchoolScope(schoolId);

    const asset = await this.assetRepo.findOne({
      where: { id, schoolId },
      relations: ['assignedUser'],
    });

    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    const [assignments, maintenanceLogs] = await Promise.all([
      this.assignmentRepo.find({
        where: { assetId: id, schoolId },
        relations: ['assignedUser', 'assignedBy'],
        order: { assignedAt: 'DESC' },
      }),
      this.maintenanceRepo.find({
        where: { assetId: id, schoolId },
        relations: ['reportedBy', 'completedBy'],
        order: { maintenanceDate: 'DESC' },
      }),
    ]);

    return {
      ...asset,
      assignments,
      maintenanceLogs,
    };
  }

  async listMyAssets(schoolId: string, actorId: string) {
    this.ensureSchoolScope(schoolId);

    return this.assetRepo.find({
      where: {
        schoolId,
        assignedUserId: actorId,
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async createAsset(schoolId: string, dto: CreateAssetDto, actor: ActorContext) {
    this.ensureSchoolScope(schoolId);

    const duplicate = await this.assetRepo.findOne({
      where: { schoolId, assetTag: dto.assetTag.trim() },
    });

    if (duplicate) {
      throw new BadRequestException('Asset tag already exists for this school.');
    }

    await this.validateAssignedUserScope(schoolId, dto.assignedUserId);

    const asset = this.assetRepo.create({
      assetTag: dto.assetTag.trim(),
      name: dto.name.trim(),
      category: dto.category.trim(),
      description: dto.description?.trim(),
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
      purchaseCost: dto.purchaseCost ?? 0,
      supplier: dto.supplier?.trim(),
      status: dto.status || AssetStatus.ACTIVE,
      location: dto.location?.trim(),
      department: dto.department?.trim(),
      assignedUserId: dto.assignedUserId,
      createdById: actor.id,
      schoolId,
    });

    const saved = await this.assetRepo.save(asset);

    if (dto.assignedUserId || dto.location || dto.department) {
      await this.createAssignment(schoolId, {
        assetId: saved.id,
        assignedUserId: dto.assignedUserId,
        assignedLocation: dto.location,
        assignedDepartment: dto.department,
        notes: 'Initial assignment from asset registration',
      }, actor);
    }

    return this.getAssetById(schoolId, saved.id);
  }

  async updateAsset(schoolId: string, id: string, dto: UpdateAssetDto) {
    this.ensureSchoolScope(schoolId);

    const asset = await this.assetRepo.findOne({ where: { id, schoolId } });
    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    if (dto.assetTag && dto.assetTag.trim().toLowerCase() !== asset.assetTag.toLowerCase()) {
      const duplicate = await this.assetRepo.findOne({
        where: { schoolId, assetTag: dto.assetTag.trim() },
      });
      if (duplicate) {
        throw new BadRequestException('Asset tag already exists for this school.');
      }
    }

    await this.validateAssignedUserScope(schoolId, dto.assignedUserId);

    const merged = this.assetRepo.merge(asset, {
      ...dto,
      assetTag: dto.assetTag?.trim() ?? asset.assetTag,
      name: dto.name?.trim() ?? asset.name,
      category: dto.category?.trim() ?? asset.category,
      description: dto.description?.trim() ?? asset.description,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : asset.purchaseDate,
      supplier: dto.supplier?.trim() ?? asset.supplier,
      location: dto.location?.trim() ?? asset.location,
      department: dto.department?.trim() ?? asset.department,
    });

    await this.assetRepo.save(merged);
    return this.getAssetById(schoolId, id);
  }

  async deleteAsset(schoolId: string, id: string) {
    this.ensureSchoolScope(schoolId);

    const asset = await this.assetRepo.findOne({ where: { id, schoolId } });
    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    const activeAssignment = await this.assignmentRepo.count({
      where: {
        schoolId,
        assetId: id,
        status: AssetAssignmentStatus.ACTIVE,
      },
    });

    if (activeAssignment > 0) {
      throw new BadRequestException('Release active assignment before deleting this asset.');
    }

    await this.assetRepo.remove(asset);
    return { success: true };
  }

  async listAssignments(
    schoolId: string,
    filters?: { activeOnly?: boolean; assetId?: string; assignedUserId?: string },
  ) {
    this.ensureSchoolScope(schoolId);

    const qb = this.assignmentRepo
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.asset', 'asset')
      .leftJoinAndSelect('assignment.assignedUser', 'assignedUser')
      .leftJoinAndSelect('assignment.assignedBy', 'assignedBy')
      .where('assignment.schoolId = :schoolId', { schoolId });

    if (filters?.activeOnly !== false) {
      qb.andWhere('assignment.status = :status', { status: AssetAssignmentStatus.ACTIVE });
    }

    if (filters?.assetId) {
      qb.andWhere('assignment.assetId = :assetId', { assetId: filters.assetId });
    }

    if (filters?.assignedUserId) {
      qb.andWhere('assignment.assignedUserId = :assignedUserId', {
        assignedUserId: filters.assignedUserId,
      });
    }

    return qb.orderBy('assignment.assignedAt', 'DESC').getMany();
  }

  async createAssignment(schoolId: string, dto: CreateAssetAssignmentDto, actor: ActorContext) {
    this.ensureSchoolScope(schoolId);

    const asset = await this.assetRepo.findOne({ where: { id: dto.assetId, schoolId } });
    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    if (asset.status === AssetStatus.RETIRED) {
      throw new BadRequestException('Retired assets cannot be assigned.');
    }

    await this.validateAssignedUserScope(schoolId, dto.assignedUserId);

    const existingActive = await this.assignmentRepo.findOne({
      where: {
        schoolId,
        assetId: dto.assetId,
        status: AssetAssignmentStatus.ACTIVE,
      },
    });

    if (existingActive) {
      existingActive.status = AssetAssignmentStatus.TRANSFERRED;
      existingActive.releasedAt = new Date();
      existingActive.releaseReason = 'Auto-transferred to new assignment';
      await this.assignmentRepo.save(existingActive);
    }

    const assignment = this.assignmentRepo.create({
      assetId: dto.assetId,
      assignedUserId: dto.assignedUserId,
      assignedLocation: dto.assignedLocation?.trim(),
      assignedDepartment: dto.assignedDepartment?.trim(),
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : new Date(),
      notes: dto.notes?.trim(),
      assignedById: actor.id,
      status: AssetAssignmentStatus.ACTIVE,
      schoolId,
    });

    await this.assignmentRepo.save(assignment);

    asset.assignedUserId = dto.assignedUserId;
    asset.location = dto.assignedLocation?.trim() || asset.location;
    asset.department = dto.assignedDepartment?.trim() || asset.department;
    await this.assetRepo.save(asset);

    return this.assignmentRepo.findOne({
      where: { id: assignment.id },
      relations: ['asset', 'assignedUser', 'assignedBy'],
    });
  }

  async releaseAssignment(
    schoolId: string,
    assignmentId: string,
    dto: ReleaseAssetAssignmentDto,
  ) {
    this.ensureSchoolScope(schoolId);

    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, schoolId },
      relations: ['asset'],
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    if (assignment.status !== AssetAssignmentStatus.ACTIVE) {
      return assignment;
    }

    assignment.status = AssetAssignmentStatus.RETURNED;
    assignment.releasedAt = new Date();
    assignment.releaseReason = dto.releaseReason?.trim() || 'Released';
    await this.assignmentRepo.save(assignment);

    if (assignment.asset) {
      assignment.asset.assignedUserId = null;
      await this.assetRepo.save(assignment.asset);
    }

    return assignment;
  }

  async transferAssignment(
    schoolId: string,
    assignmentId: string,
    dto: TransferAssetAssignmentDto,
    actor: ActorContext,
  ) {
    this.ensureSchoolScope(schoolId);

    const current = await this.assignmentRepo.findOne({
      where: {
        id: assignmentId,
        schoolId,
      },
      relations: ['asset'],
    });

    if (!current) {
      throw new NotFoundException('Assignment not found.');
    }

    if (current.status !== AssetAssignmentStatus.ACTIVE) {
      throw new BadRequestException('Only active assignments can be transferred.');
    }

    return this.createAssignment(
      schoolId,
      {
        assetId: current.assetId,
        assignedUserId: dto.assignedUserId,
        assignedLocation: dto.assignedLocation,
        assignedDepartment: dto.assignedDepartment,
        notes: dto.notes || `Transferred from assignment ${current.id}`,
      },
      actor,
    );
  }

  async listMaintenanceLogs(
    schoolId: string,
    filters?: { assetId?: string; status?: MaintenanceStatus },
  ) {
    this.ensureSchoolScope(schoolId);

    const qb = this.maintenanceRepo
      .createQueryBuilder('maintenance')
      .leftJoinAndSelect('maintenance.asset', 'asset')
      .leftJoinAndSelect('maintenance.reportedBy', 'reportedBy')
      .leftJoinAndSelect('maintenance.completedBy', 'completedBy')
      .where('maintenance.schoolId = :schoolId', { schoolId });

    if (filters?.assetId) {
      qb.andWhere('maintenance.assetId = :assetId', { assetId: filters.assetId });
    }

    if (filters?.status) {
      qb.andWhere('maintenance.status = :status', { status: filters.status });
    }

    return qb.orderBy('maintenance.maintenanceDate', 'DESC').getMany();
  }

  async createMaintenanceLog(
    schoolId: string,
    dto: CreateMaintenanceLogDto,
    actor: ActorContext,
  ) {
    this.ensureSchoolScope(schoolId);

    const asset = await this.assetRepo.findOne({ where: { id: dto.assetId, schoolId } });
    if (!asset) {
      throw new NotFoundException('Asset not found.');
    }

    const actorRole = this.normalizeRole(actor.role);
    if (actorRole === Role.TEACHER) {
      await this.ensureTeacherCanReportAsset(schoolId, actor.id, dto.assetId);
    }

    const log = this.maintenanceRepo.create({
      assetId: dto.assetId,
      issueDescription: dto.issueDescription.trim(),
      maintenanceType: dto.maintenanceType || MaintenanceType.REPAIR,
      maintenanceDate: dto.maintenanceDate ? new Date(dto.maintenanceDate) : new Date(),
      repairCost: dto.repairCost ?? 0,
      status: dto.status || MaintenanceStatus.PENDING,
      resolutionNotes: dto.resolutionNotes?.trim(),
      nextMaintenanceDate: dto.nextMaintenanceDate ? new Date(dto.nextMaintenanceDate) : undefined,
      reportedById: actor.id,
      expenseId: dto.expenseId,
      schoolId,
    });

    const saved = await this.maintenanceRepo.save(log);

    if (saved.status === MaintenanceStatus.PENDING) {
      asset.status = AssetStatus.UNDER_MAINTENANCE;
      await this.assetRepo.save(asset);
    }

    return this.maintenanceRepo.findOne({
      where: { id: saved.id },
      relations: ['asset', 'reportedBy', 'completedBy'],
    });
  }

  async updateMaintenanceLog(
    schoolId: string,
    id: string,
    dto: UpdateMaintenanceLogDto,
    actor: ActorContext,
  ) {
    this.ensureSchoolScope(schoolId);

    const log = await this.maintenanceRepo.findOne({
      where: { id, schoolId },
      relations: ['asset'],
    });

    if (!log) {
      throw new NotFoundException('Maintenance log not found.');
    }

    const merged = this.maintenanceRepo.merge(log, {
      ...dto,
      issueDescription: dto.issueDescription?.trim() ?? log.issueDescription,
      maintenanceDate: dto.maintenanceDate ? new Date(dto.maintenanceDate) : log.maintenanceDate,
      resolutionNotes: dto.resolutionNotes?.trim() ?? log.resolutionNotes,
      nextMaintenanceDate: dto.nextMaintenanceDate
        ? new Date(dto.nextMaintenanceDate)
        : log.nextMaintenanceDate,
    });

    if (dto.status === MaintenanceStatus.COMPLETED) {
      merged.completedById = actor.id;
      if (merged.asset) {
        merged.asset.status = AssetStatus.ACTIVE;
        await this.assetRepo.save(merged.asset);
      }
    }

    if (dto.status === MaintenanceStatus.PENDING && merged.asset) {
      merged.asset.status = AssetStatus.UNDER_MAINTENANCE;
      await this.assetRepo.save(merged.asset);
    }

    await this.maintenanceRepo.save(merged);

    return this.maintenanceRepo.findOne({
      where: { id },
      relations: ['asset', 'reportedBy', 'completedBy'],
    });
  }

  async listInventoryItems(
    schoolId: string,
    filters?: { q?: string; category?: string; lowStockOnly?: boolean },
  ) {
    this.ensureSchoolScope(schoolId);

    const qb = this.inventoryItemRepo
      .createQueryBuilder('item')
      .where('item.schoolId = :schoolId', { schoolId });

    if (filters?.q) {
      qb.andWhere(
        '(LOWER(item.name) LIKE :q OR LOWER(item.itemCode) LIKE :q OR LOWER(item.category) LIKE :q)',
        {
          q: `%${filters.q.toLowerCase()}%`,
        },
      );
    }

    if (filters?.category) {
      qb.andWhere('item.category = :category', { category: filters.category });
    }

    if (filters?.lowStockOnly) {
      qb.andWhere('item.currentStock <= item.minimumThreshold');
    }

    return qb.orderBy('item.name', 'ASC').getMany();
  }

  async createInventoryItem(schoolId: string, dto: CreateInventoryItemDto) {
    this.ensureSchoolScope(schoolId);

    const duplicate = await this.inventoryItemRepo.findOne({
      where: { schoolId, itemCode: dto.itemCode.trim() },
    });

    if (duplicate) {
      throw new BadRequestException('Item code already exists for this school.');
    }

    const item = this.inventoryItemRepo.create({
      itemCode: dto.itemCode.trim(),
      name: dto.name.trim(),
      category: dto.category.trim(),
      unit: dto.unit?.trim(),
      description: dto.description?.trim(),
      currentStock: dto.currentStock ?? 0,
      minimumThreshold: dto.minimumThreshold ?? 0,
      unitCost: dto.unitCost ?? 0,
      supplier: dto.supplier?.trim(),
      schoolId,
    });

    return this.inventoryItemRepo.save(item);
  }

  async updateInventoryItem(schoolId: string, id: string, dto: UpdateInventoryItemDto) {
    this.ensureSchoolScope(schoolId);

    const item = await this.inventoryItemRepo.findOne({ where: { id, schoolId } });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }

    if (dto.itemCode && dto.itemCode.trim().toLowerCase() !== item.itemCode.toLowerCase()) {
      const duplicate = await this.inventoryItemRepo.findOne({
        where: { schoolId, itemCode: dto.itemCode.trim() },
      });
      if (duplicate) {
        throw new BadRequestException('Item code already exists for this school.');
      }
    }

    const merged = this.inventoryItemRepo.merge(item, {
      ...dto,
      itemCode: dto.itemCode?.trim() ?? item.itemCode,
      name: dto.name?.trim() ?? item.name,
      category: dto.category?.trim() ?? item.category,
      unit: dto.unit?.trim() ?? item.unit,
      description: dto.description?.trim() ?? item.description,
      supplier: dto.supplier?.trim() ?? item.supplier,
    });

    return this.inventoryItemRepo.save(merged);
  }

  async deleteInventoryItem(schoolId: string, id: string) {
    this.ensureSchoolScope(schoolId);

    const item = await this.inventoryItemRepo.findOne({ where: { id, schoolId } });
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }

    const txCount = await this.stockTransactionRepo.count({ where: { schoolId, itemId: id } });
    if (txCount > 0) {
      throw new BadRequestException('Cannot delete item with stock transaction history.');
    }

    await this.inventoryItemRepo.remove(item);
    return { success: true };
  }

  async listStockTransactions(
    schoolId: string,
    filters?: { itemId?: string; type?: StockTransactionType },
  ) {
    this.ensureSchoolScope(schoolId);

    const qb = this.stockTransactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.item', 'item')
      .leftJoinAndSelect('transaction.performedBy', 'performedBy')
      .where('transaction.schoolId = :schoolId', { schoolId });

    if (filters?.itemId) {
      qb.andWhere('transaction.itemId = :itemId', { itemId: filters.itemId });
    }

    if (filters?.type) {
      qb.andWhere('transaction.transactionType = :type', { type: filters.type });
    }

    return qb.orderBy('transaction.transactionDate', 'DESC').getMany();
  }

  async createStockTransaction(
    schoolId: string,
    dto: CreateStockTransactionDto,
    actor: ActorContext,
  ) {
    this.ensureSchoolScope(schoolId);

    const item = await this.inventoryItemRepo.findOne({
      where: { id: dto.itemId, schoolId },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }

    const qty = dto.quantity;
    let resultingStock = item.currentStock;

    if (dto.transactionType === StockTransactionType.STOCK_IN) {
      resultingStock += qty;
    } else if (dto.transactionType === StockTransactionType.STOCK_OUT) {
      if (qty > item.currentStock) {
        throw new BadRequestException('Stock-out quantity exceeds current stock.');
      }
      resultingStock -= qty;
    } else {
      resultingStock = qty;
    }

    const unitCost = dto.unitCost ?? Number(item.unitCost || 0);
    const totalCost = unitCost * qty;

    const transaction = this.stockTransactionRepo.create({
      itemId: dto.itemId,
      transactionType: dto.transactionType,
      quantity: qty,
      unitCost,
      totalCost,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
      reference: dto.reference?.trim(),
      notes: dto.notes?.trim(),
      performedById: actor.id,
      schoolId,
    });

    await this.stockTransactionRepo.save(transaction);

    item.currentStock = resultingStock;
    if (dto.unitCost !== undefined) {
      item.unitCost = dto.unitCost;
    }
    await this.inventoryItemRepo.save(item);

    return this.stockTransactionRepo.findOne({
      where: { id: transaction.id },
      relations: ['item', 'performedBy'],
    });
  }

  async getAssetRegisterReport(schoolId: string) {
    return this.listAssets(schoolId);
  }

  async getAssetAllocationReport(schoolId: string) {
    return this.listAssignments(schoolId, { activeOnly: false });
  }

  async getMaintenanceCostReport(schoolId: string) {
    const logs = await this.listMaintenanceLogs(schoolId);
    const totalCost = logs.reduce((sum, log) => sum + Number(log.repairCost || 0), 0);
    return {
      totalCost,
      totalRecords: logs.length,
      pendingCount: logs.filter((log) => log.status === MaintenanceStatus.PENDING).length,
      completedCount: logs.filter((log) => log.status === MaintenanceStatus.COMPLETED).length,
      logs,
    };
  }

  async getInventoryStockLevelsReport(schoolId: string) {
    return this.listInventoryItems(schoolId);
  }

  async getLowStockReport(schoolId: string) {
    return this.listInventoryItems(schoolId, { lowStockOnly: true });
  }
}
