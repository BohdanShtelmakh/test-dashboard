import type { DatabaseService } from '../database/database.service.js';

// Persistence helpers require the caller's transaction, never the global client.
export type ImportTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];
