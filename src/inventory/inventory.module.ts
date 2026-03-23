import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Asset } from './entities/asset.entity';
import { AssetAssignment } from './entities/asset-assignment.entity';
import { MaintenanceLog } from './entities/maintenance-log.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockTransaction } from './entities/stock-transaction.entity';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Asset,
      AssetAssignment,
      MaintenanceLog,
      InventoryItem,
      StockTransaction,
      User,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
