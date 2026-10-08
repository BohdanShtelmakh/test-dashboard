import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { join } from 'node:path';
import { seedFileNames } from './seed-files.js';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../app.module.js';
import { ImportService } from '../imports/import.service.js';
import type { ImportFileResult } from '../imports/import.contract.js';
import { DatabaseService } from './database.service.js';
import { seedInitialWidgets } from './seed-widgets.js';

// Both src/database and dist/database have the same depth in the workspace.
config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
const app = await NestFactory.createApplicationContext(AppModule);
try {
  const importer = app.get(ImportService);
  const directory = fileURLToPath(
    new URL('../../../../data/', import.meta.url),
  );
  const names = await seedFileNames(directory);
  for (const required of ['stacked-bar.csv', 'line-and-pie.xlsx']) {
    if (!names.includes(required))
      throw new Error(`Missing initial seed file: ${required}`);
  }
  const imported = new Map<string, ImportFileResult>();
  for (const name of names) {
    const result = await importer.importFile({
      filePath: join(directory, name),
      originalName: name,
    });
    console.log(JSON.stringify({ file: name, ...result }));
    imported.set(name, result);
  }
  await seedInitialWidgets(
    app.get(DatabaseService),
    imported.get('stacked-bar.csv')!,
    imported.get('line-and-pie.xlsx')!,
  );
  console.log('Initial widgets seeded (existing state preserved)');
} finally {
  await app.close();
}
