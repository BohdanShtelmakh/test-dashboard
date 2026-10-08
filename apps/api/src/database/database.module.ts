import { Global, Module } from '@nestjs/common';
import { SchemaRegistry } from './dataset-persistence.js';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [DatabaseService, SchemaRegistry],
  exports: [DatabaseService, SchemaRegistry],
})
export class DatabaseModule {}
