import { Injectable } from '@nestjs/common';
import type { NormalizedColumn } from './import.types.js';

@Injectable()
export class ColumnKeyNormalizer {
  normalize(headers: readonly string[]): NormalizedColumn[] {
    const used = new Set<string>();
    return headers.map((name, position) => {
      if (typeof name !== 'string') {
        throw new TypeError(`Header at position ${position} must be a string`);
      }
      const base =
        name
          .normalize('NFKC')
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_]+/gu, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || `column_${position + 1}`;
      let key = base;
      let suffix = 2;
      while (used.has(key)) key = `${base}_${suffix++}`;
      used.add(key);
      return { position, name, key };
    });
  }
}
