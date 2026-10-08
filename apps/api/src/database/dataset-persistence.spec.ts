import type { InferredColumn } from './dataset.contract.js';
import { schemaFingerprint } from './dataset-persistence.js';

describe('schema-registry', () => {
  const columns: InferredColumn[] = [
    { position: 0, name: 'Name', key: 'name', type: 'STRING', nullable: false },
    {
      position: 1,
      name: 'Result',
      key: 'result',
      type: 'INTEGER',
      nullable: true,
    },
  ];

  describe('schemaFingerprint', () => {
    it('is deterministic regardless of object properties or column array ordering', () => {
      const reordered = columns
        .map((c) => ({
          nullable: c.nullable,
          type: c.type,
          key: c.key,
          name: c.name,
          position: c.position,
        }))
        .reverse();
      expect(schemaFingerprint(columns)).toMatch(/^[a-f0-9]{64}$/);
      expect(schemaFingerprint(reordered)).toBe(schemaFingerprint(columns));
    });

    it.each([
      { position: 2 },
      { name: 'Other' },
      { key: 'other' },
      { type: 'NUMBER' as const },
      { nullable: true },
    ])('includes stored column metadata %j', (change) => {
      expect(
        schemaFingerprint([{ ...columns[0], ...change }, columns[1]]),
      ).not.toBe(schemaFingerprint(columns));
    });

    it('includes column count and rejects duplicate keys/positions', () => {
      expect(schemaFingerprint(columns.slice(0, 1))).not.toBe(
        schemaFingerprint(columns),
      );
      expect(() => schemaFingerprint([columns[0], columns[0]])).toThrow();
    });
  });
});
