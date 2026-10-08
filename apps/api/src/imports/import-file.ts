import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../app.module.js';
import { ImportService } from './import.service.js';

if (process.argv.length !== 3) {
  throw new Error('Usage: db:import <file-path>');
}
config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
// npm preserves the directory from which the user invoked the command.
const filePath = resolve(
  process.env.INIT_CWD ?? process.cwd(),
  process.argv[2],
);
const app = await NestFactory.createApplicationContext(AppModule);
try {
  const result = await app.get(ImportService).importFile({
    filePath,
    originalName: basename(filePath),
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
