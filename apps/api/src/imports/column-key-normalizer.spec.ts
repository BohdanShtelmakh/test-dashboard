import { ColumnKeyNormalizer } from './column-key-normalizer.js';

const normalizer = new ColumnKeyNormalizer();

describe('ColumnKeyNormalizer', () => {
  it('preserves original names and positions while normalizing keys', () => {
    const headers = ['Campaign', 'Campaign Name', 'CAMPAIGN_NAME', ' Result '];
    expect(normalizer.normalize(headers)).toEqual([
      { position: 0, name: 'Campaign', key: 'campaign' },
      { position: 1, name: 'Campaign Name', key: 'campaign_name' },
      { position: 2, name: 'CAMPAIGN_NAME', key: 'campaign_name_2' },
      { position: 3, name: ' Result ', key: 'result' },
    ]);
    expect(headers[3]).toBe(' Result ');
  });

  it('normalizes punctuation, repeated separators, and Unicode', () => {
    expect(
      normalizer
        .normalize([
          ' Revenue / Total (%) ',
          '__A---B...C__',
          'Місто',
          'Ｃｉｔｙ',
        ])
        .map((c) => c.key),
    ).toEqual(['revenue_total', 'a_b_c', 'місто', 'city']);
  });

  it('resolves duplicates and explicit suffix collisions deterministically', () => {
    const headers = ['Result', 'result', 'RESULT', 'result_2', 'result'];
    const keys = ['result', 'result_2', 'result_3', 'result_2_2', 'result_4'];
    expect(normalizer.normalize(headers).map((c) => c.key)).toEqual(keys);
    expect(normalizer.normalize(headers).map((c) => c.key)).toEqual(keys);
  });

  it('provides positional fallbacks without collisions for empty or strange headers', () => {
    expect(
      normalizer
        .normalize(['column_2', '', ' !!! ', '🙂', '___'])
        .map((c) => c.key),
    ).toEqual(['column_2', 'column_2_2', 'column_3', 'column_4', 'column_5']);
    expect(normalizer.normalize([])).toEqual([]);
  });
});
