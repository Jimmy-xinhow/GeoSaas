import { Module } from '@nestjs/common';
import { BrandSpreadController } from './brand-spread.controller';
import { BrandSpreadService } from './brand-spread.service';

@Module({
  controllers: [BrandSpreadController],
  providers: [BrandSpreadService],
  exports: [BrandSpreadService],
})
export class BrandSpreadModule {}
