import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../app.module.js';
import { ImportService } from '../imports/import.service.js';
import type { ImportFileResult } from '../imports/import.types.js';
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
  const imported: ImportFileResult[] = [];
  for (const [name, format] of [
    ['stacked-bar.csv', 'CSV'],
    ['line-and-pie.xlsx', 'XLSX'],
  ] as const) {
    const result = await importer.importFile({
      filePath: fileURLToPath(
        new URL(`../../../../data/${name}`, import.meta.url),
      ),
      originalName: name,
      format,
    });
    console.log(JSON.stringify({ file: name, ...result }));
    imported.push(result);
  }
  await seedInitialWidgets(app.get(DatabaseService), imported[0], imported[1]);
  console.log('Initial widgets seeded (existing state preserved)');
} finally {
  await app.close();
}
