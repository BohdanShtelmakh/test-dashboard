import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    if (!connectionString.trim()) {
      throw new Error('DATABASE_URL must not be empty');
    }
    this.pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    this.pool.on('error', (error: Error & { code?: string }) => {
      // Do not log connection details or the raw error message.
      this.logger.error({
        message: 'Idle database connection failed',
        errorType: error.name,
        code: /^[A-Z0-9_]{1,32}$/.test(error.code ?? '')
          ? error.code
          : undefined,
      });
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
