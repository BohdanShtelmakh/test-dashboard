import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { WidgetsModule } from './widgets/widgets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ImportsModule,
    WidgetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
