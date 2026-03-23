import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../user/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { InventoryService } from './inventory.service';
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
import { AssetStatus } from './entities/asset.entity';
import { MaintenanceStatus } from './entities/maintenance-log.entity';
import { StockTransactionType } from './entities/stock-transaction.entity';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private resolveSchoolId(req: any, schoolId?: string): string {
    const role = req.user?.role;
    const fallback = req.user?.schoolId;
    if (role === Role.SUPER_ADMIN || role === 'SUPER_ADMIN') {
      return schoolId || fallback;
    }
    return fallback;
  }

  private actorFromReq(req: any, schoolId: string) {
    return {
      id: req.user?.id || req.user?.sub,
      role: req.user?.role,
      schoolId,
    };
  }

  @Get('summary')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getSummary(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getSummary(resolvedSchoolId);
  }

  @Get('assets')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  listAssets(
    @Request() req,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: AssetStatus,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('location') location?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.listAssets(resolvedSchoolId, {
      q,
      category,
      status,
      assignedUserId,
      location,
    });
  }

  @Get('assets/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  getAssetById(@Request() req, @Param('id') id: string, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getAssetById(resolvedSchoolId, id);
  }

  @Get('my-assets')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  listMyAssets(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    const actorId = req.user?.id || req.user?.sub;
    return this.inventoryService.listMyAssets(resolvedSchoolId, actorId);
  }

  @Post('assets')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createAsset(
    @Request() req,
    @Body() dto: CreateAssetDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.createAsset(
      resolvedSchoolId,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Put('assets/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateAsset(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.updateAsset(resolvedSchoolId, id, dto);
  }

  @Delete('assets/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteAsset(@Request() req, @Param('id') id: string, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.deleteAsset(resolvedSchoolId, id);
  }

  @Get('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  listAssignments(
    @Request() req,
    @Query('activeOnly') activeOnly?: string,
    @Query('assetId') assetId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.listAssignments(resolvedSchoolId, {
      activeOnly: activeOnly !== 'false',
      assetId,
      assignedUserId,
    });
  }

  @Post('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createAssignment(
    @Request() req,
    @Body() dto: CreateAssetAssignmentDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.createAssignment(
      resolvedSchoolId,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Post('assignments/:id/release')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  releaseAssignment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReleaseAssetAssignmentDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.releaseAssignment(resolvedSchoolId, id, dto);
  }

  @Post('assignments/:id/transfer')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  transferAssignment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: TransferAssetAssignmentDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.transferAssignment(
      resolvedSchoolId,
      id,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Get('maintenance')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  listMaintenanceLogs(
    @Request() req,
    @Query('assetId') assetId?: string,
    @Query('status') status?: MaintenanceStatus,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.listMaintenanceLogs(resolvedSchoolId, {
      assetId,
      status,
    });
  }

  @Post('maintenance')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  createMaintenanceLog(
    @Request() req,
    @Body() dto: CreateMaintenanceLogDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.createMaintenanceLog(
      resolvedSchoolId,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Put('maintenance/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  updateMaintenanceLog(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceLogDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.updateMaintenanceLog(
      resolvedSchoolId,
      id,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Get('items')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE, Role.TEACHER)
  listInventoryItems(
    @Request() req,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.listInventoryItems(resolvedSchoolId, {
      q,
      category,
      lowStockOnly: lowStockOnly === 'true',
    });
  }

  @Post('items')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createInventoryItem(
    @Request() req,
    @Body() dto: CreateInventoryItemDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.createInventoryItem(resolvedSchoolId, dto);
  }

  @Put('items/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateInventoryItem(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.updateInventoryItem(resolvedSchoolId, id, dto);
  }

  @Delete('items/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  deleteInventoryItem(
    @Request() req,
    @Param('id') id: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.deleteInventoryItem(resolvedSchoolId, id);
  }

  @Get('stock-transactions')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  listStockTransactions(
    @Request() req,
    @Query('itemId') itemId?: string,
    @Query('type') type?: StockTransactionType,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.listStockTransactions(resolvedSchoolId, {
      itemId,
      type,
    });
  }

  @Post('stock-transactions')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  createStockTransaction(
    @Request() req,
    @Body() dto: CreateStockTransactionDto,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.createStockTransaction(
      resolvedSchoolId,
      dto,
      this.actorFromReq(req, resolvedSchoolId),
    );
  }

  @Get('reports/asset-register')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getAssetRegister(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getAssetRegisterReport(resolvedSchoolId);
  }

  @Get('reports/asset-allocation')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getAssetAllocationReport(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getAssetAllocationReport(resolvedSchoolId);
  }

  @Get('reports/maintenance-cost')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getMaintenanceCostReport(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getMaintenanceCostReport(resolvedSchoolId);
  }

  @Get('reports/stock-levels')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getStockLevelsReport(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getInventoryStockLevelsReport(resolvedSchoolId);
  }

  @Get('reports/low-stock')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.FINANCE)
  getLowStockReport(@Request() req, @Query('schoolId') schoolId?: string) {
    const resolvedSchoolId = this.resolveSchoolId(req, schoolId);
    return this.inventoryService.getLowStockReport(resolvedSchoolId);
  }
}
