# Import pipeline

`ImportsModule` imports and re-exports the existing non-global `ParsingModule`.
It also provides and exports `ColumnKeyNormalizer`, `SchemaInferrer`, and `ValueNormalizer`.
The parsing/normalization components have no database or HTTP dependencies.
The module also provides `SchemaRegistry`, `DatasetWriter`, and the exported
`ImportService` for persistence and orchestration.

## Column keys

Headers retain their original `name` and zero-based `position`. Internal keys use Unicode NFKC normalization, lowercase letters, digits, and underscores. Whitespace and punctuation become underscores; repeated/edge underscores are removed. Empty keys fall back to `column_1`, `column_2`, etc. Collisions use deterministic `_2`, `_3`, etc. suffixes, including collisions with already suffixed input headers. Unicode letters are retained.

## Inference

`infer(columns, sample, sampleLimit = DEFAULT_SCHEMA_SAMPLE_LIMIT)` receives an already collected positional sample. The default limit is 200 rows. It only inspects the first `sampleLimit` rows and does not read files/streams. `ImportService` collects this bounded sample and replays it before continuing the same source iterator.

- Null, undefined/missing cells, empty strings, and whitespace-only strings mark a column nullable and do not influence its type.
- Empty or entirely null samples fall back to STRING; empty samples are conservatively nullable.
- Decimal/scientific numeric strings and finite numbers are supported. Leading-zero identifiers, unsafe integers, non-finite values, hex, and grouped/currency numbers fall back to STRING.
- Only native booleans and case-insensitive `true`/`false` strings infer BOOLEAN; `0`/`1` and `yes`/`no` are not boolean aliases.
- DATE requires a valid calendar `YYYY-MM-DD` string. DATETIME accepts valid Date objects or ISO strings with explicit timezone and seconds, with up to millisecond precision.
- INTEGER + NUMBER widens to NUMBER; DATE + DATETIME widens to DATETIME. Other disagreements widen to STRING.
- XLSX rows preserve `{ kind: 'xlsx', raw, formatted }` cells; CSV/TSV remain scalar values. A numeric cell is a date hint only when its formatted calendar display (`YYYY-MM-DD` or `M/D/YYYY`, optionally with a clock/AM-PM) agrees with its Excel 1900 serial date. No numeric range implies a date. Other formats remain numeric, including currency/percentage displays. The fictitious Excel leap day (serial 60) is not converted to an ISO date.

Types and nullability describe only the sample, not a guarantee about later rows.

## Row normalization

`normalize(columns, row)` uses each column's explicit position and unique key. STRING content is preserved; Date objects converted to strings use UTC ISO format. Empty/missing values always become null, even when the sample inferred non-nullability. Typed non-empty values that cannot be converted raise `ValueNormalizationError` instead of silently losing data. Invalid column positions/keys and extra row cells are rejected.

- DATE JSON values are `YYYY-MM-DD`. Native Date values must be UTC midnight to avoid discarding a time component.
- DATETIME JSON values use `Date.toISOString()` (UTC with milliseconds). DATE-only values in widened DATETIME columns become midnight UTC.
- Numeric and boolean values become JSON numbers/booleans.
- Calendar-formatted XLSX serials become ISO dates or UTC datetimes. Fractional days retain their time component, even if hidden by a date-only display. Plain numeric cells remain numeric. The existing xlstream formatter uses the 1900 calendar; this change does not extend its calendar or locale-format support.

## Persistence and transactions

`ImportService.importFile({ filePath, originalName, format, mimeType? })` returns
the source file ID, a `reused` flag, and persisted datasets with IDs/names,
optional worksheet names, and row counts. Inputs must be stable local files:
do not change a file between hashing and parsing.

The checksum uses SHA-256 over a file stream; size comes from bigint filesystem
metadata. A successful checksum lookup returns stored datasets without parsing.
New imports claim the unique checksum inside a READ COMMITTED transaction with
an explicitly targeted `ON CONFLICT DO NOTHING`. Concurrent callers wait for
the winner and reuse its committed import; a failed winner rolls back its claim.

One transaction covers the whole file: source file, schemas/columns, all
worksheets/datasets, and all rows. Every new write uses that transaction client.
Any error raises `ImportError` with the original cause and rolls back the file;
iterators close on failure. Files with no importable datasets are rejected.
For very large production imports, staging/import status and shorter transactions
would avoid this intentionally long-lived transaction; no job system is added.

`SchemaRegistry` hashes canonical JSON consisting of a version tag and tuples
`[position, original name, normalized key, inferred type, nullable]`, sorted by
position. Object property order and column array order do not affect the SHA-256
fingerprint. All stored column metadata is included; generated IDs and timestamps
are excluded. The unique fingerprint constraint resolves concurrent creation,
with schema columns committed atomically with the schema. Other insert conflicts
propagate normally.

`DatasetWriter` normalizes one row at a time and inserts at most
`DEFAULT_IMPORT_BATCH_SIZE = 500` rows per batch (configurable per call). Row
indexes start at zero; final `row_count` is updated after successful writes.
There are no row upserts and no accumulation of the entire dataset.

## Development seed and verification

From the repository root, with PostgreSQL running and the API environment set:

```sh
npm run db:migrate -w @test-dashboard/api
npm run db:seed -w @test-dashboard/api
npm run db:seed -w @test-dashboard/api
npm run test:db -w @test-dashboard/api
```

The seed builds the API and bootstraps its Nest application context, imports
`data/stacked-bar.csv` and `data/line-and-pie.xlsx` through `ImportService`, then
closes the context. File paths and the API `.env` path are relative to the seed
module, independent of the process working directory; explicitly supplied
environment variables take precedence. Run this command on the host: the Docker
API image deliberately excludes assignment files. No fixture row values are
hardcoded. A second run reuses both checksums without adding data.

The supplied fixtures produce two source files, three datasets (5 CSV rows,
212 and 5 XLSX rows), and 222 total rows. Database import tests apply migrations
to a disposable schema, verify counts/reuse/normalized keys/sequential indexes,
and test batch rollback and both unique races without altering development data.
Normal unit tests require no PostgreSQL.

No controllers, uploads, widgets, frontend changes, or background jobs are added.
