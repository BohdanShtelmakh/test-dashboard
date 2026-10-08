# API workspace

NestJS backend for Test Dashboard. Follow the [root README](../../README.md) for installation, environment setup, migrations, seed, local/Docker startup, and quality checks. Run the documented commands from the repository root.

## Import pipeline

`ImportsModule` registers its CSV/TSV and XLSX parsers directly and exports only `ImportService`.
Column normalization, inference, and value normalization remain internal providers.
The parsing/normalization components have no database or HTTP dependencies.
`DatabaseModule` provides the shared `SchemaRegistry` used by importing and widget creation. `DatasetWriter` remains internal to imports.

### File organization

- `import.service.ts` orchestrates importing; `import-file.ts` is the command-line entry point.
- `import.contract.ts` groups import input/result types and `ImportError`. Shared column definitions, transaction typing, and column validation live in `database/dataset.contract.ts`.
- `file-utils.ts` groups file checksums and format detection, with one matching test file.
- `data-normalization.ts` groups schema inference, row normalization, scalar conversions, XLSX date hints, and row validation. Their tests are grouped in `data-normalization.spec.ts`.
- `parsing/` keeps separate CSV/TSV and XLSX parsers and their registry. It has no separate Nest module. `parser.contract.ts` groups parser types, the interface, and error handling.
- `database/dataset-persistence.ts` owns shared schema registration; `imports/dataset-persistence.ts` owns batched row writing. Their tests stay beside their implementations.

### Column keys

Headers retain their original `name` and zero-based `position`. Internal keys use Unicode NFKC normalization, lowercase letters, digits, and underscores. Whitespace and punctuation become underscores; repeated/edge underscores are removed. Empty keys fall back to `column_1`, `column_2`, etc. Collisions use deterministic `_2`, `_3`, etc. suffixes, including collisions with already suffixed input headers. Unicode letters are retained.

### Inference

`infer(columns, sample, sampleLimit = DEFAULT_SCHEMA_SAMPLE_LIMIT)` receives an already collected positional sample. The default limit is 200 rows. It only inspects the first `sampleLimit` rows and does not read files/streams. `ImportService` collects this bounded sample and replays it before continuing the same source iterator.

- Null, undefined/missing cells, empty strings, and whitespace-only strings mark a column nullable and do not influence its type.
- Empty or entirely null samples fall back to STRING; empty samples are conservatively nullable.
- Decimal/scientific numeric strings and finite numbers are supported. Leading-zero identifiers, unsafe integers, non-finite values, hex, and grouped/currency numbers fall back to STRING.
- Only native booleans and case-insensitive `true`/`false` strings infer BOOLEAN; `0`/`1` and `yes`/`no` are not boolean aliases.
- DATE requires a valid calendar `YYYY-MM-DD` string. DATETIME accepts valid Date objects or ISO strings with explicit timezone and seconds, with up to millisecond precision.
- INTEGER + NUMBER widens to NUMBER; DATE + DATETIME widens to DATETIME. Other disagreements widen to STRING.
- XLSX rows preserve `{ kind: 'xlsx', raw, formatted }` cells; CSV/TSV remain scalar values. A numeric cell is a date hint only when its formatted calendar display (`YYYY-MM-DD` or `M/D/YYYY`, optionally with a clock/AM-PM) agrees with its Excel 1900 serial date. No numeric range implies a date. Other formats remain numeric, including currency/percentage displays. The fictitious Excel leap day (serial 60) is not converted to an ISO date.

Types and nullability describe only the sample, not a guarantee about later rows.

### Row normalization

`normalize(columns, row)` uses each column's explicit position and unique key. STRING content is preserved; Date objects converted to strings use UTC ISO format. Empty/missing values always become null, even when the sample inferred non-nullability. Typed non-empty values that cannot be converted raise `ValueNormalizationError` instead of silently losing data. Invalid column positions/keys and extra row cells are rejected.

- DATE JSON values are `YYYY-MM-DD`. Native Date values must be UTC midnight to avoid discarding a time component.
- DATETIME JSON values use `Date.toISOString()` (UTC with milliseconds). DATE-only values in widened DATETIME columns become midnight UTC.
- Numeric and boolean values become JSON numbers/booleans.
- Calendar-formatted XLSX serials become ISO dates or UTC datetimes. Fractional days retain their time component, even if hidden by a date-only display. Plain numeric cells remain numeric. The existing xlstream formatter uses the 1900 calendar; this change does not extend its calendar or locale-format support.

### Persistence and transactions

`ImportService.importFile({ filePath, originalName, format?, mimeType? })` returns
the source file ID, a `reused` flag, and persisted datasets with IDs/names,
optional worksheet names, and row counts. Inputs must be stable local files:
do not change a file between hashing and parsing. When omitted, format is detected from the local file extension (CSV/TSV/XLSX, case-insensitive); unsupported extensions fail before database writes. Explicit formats remain supported. Parsers validate the actual contents.

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

### Development seed and verification

From the repository root, with PostgreSQL running and the API environment set:

```sh
npm run db:migrate -w @test-dashboard/api
npm run db:seed -w @test-dashboard/api
npm run db:seed -w @test-dashboard/api
npm run test:db -w @test-dashboard/api
```

The seed builds the API and bootstraps its Nest application context, imports supported regular CSV/TSV/XLSX files directly in `data/` through `ImportService`, then
closes the context. File paths and the API `.env` path are relative to the seed
module, independent of the process working directory; explicitly supplied
environment variables take precedence. Run this command on the host: the Docker
API image deliberately excludes assignment files. No fixture row values are
hardcoded. A second run reuses existing checksums without adding data. Additional files are imported without automatically creating widgets; the supplied filenames select the required initial widgets.

The supplied fixtures produce two source files, three datasets (5 CSV rows,
212 and 5 XLSX rows), and 222 total rows. Database import tests apply migrations
to a disposable schema, verify counts/reuse/normalized keys/sequential indexes,
and test batch rollback and both unique races without altering development data.
Normal unit tests require no PostgreSQL.

The development seed also creates three initial widgets through the separate
widget seed helper, using the persisted import results. Their config and
idempotency behavior are documented in [Widgets](#widgets).
The import pipeline exposes no HTTP controllers, uploads, or background jobs.

## Widgets

- `GET /api/widgets`: `{ id, type, title }[]`, ordered by creation time then UUID.
- `GET /api/widgets/:id`: a chart's `{ id, type, title, config, dataset }`, or a
  TEXT widget's `{ id, type: 'TEXT', title, text }` without a dataset or config.
- Chart datasets expose `{ id, name, rowCount, columns, rows }`. Columns contain
  only name/key/type/nullable/position, ordered by position. Rows contain only
  JSON values ordered by row_index; source-file metadata and database row IDs
  are not returned.

The controller validates UUIDs using Nest's ParseUUIDPipe. Unknown IDs return
404; invalid IDs return 400. Database/config failures return safe 500 messages.
Chart detail uses three fixed queries inside a read-only REPEATABLE READ transaction: widget and dataset metadata, columns, then rows. This keeps the response consistent during concurrent deletion. TEXT detail needs only the first query. No cache or aggregation is
added; config supplies normalized field keys for the client to render.

Config validation requires existing dataset fields and numeric value/series
columns (INTEGER or NUMBER). LINE uses xKey/valueKey with optional seriesKey. New BAR configs use
categoryKey/valueKey; legacy xKey/valueKey configs remain supported; PIE uses labelKey/valueKey; STACKED_BAR uses categoryKey and a
nonempty unique seriesKeys array. The validator returns only recognized config
fields. Invalid persisted config is rejected rather than trusted or exposed.

Bootstrap uses the /api prefix and CORS_ORIGIN, defaulting to
http://localhost:5173. No wildcard production CORS default is introduced.

The development seed resolves dataset IDs from persisted ImportService results:
XLSX sheet names line chart data / pie chart data and CSV dataset stacked-bar.
It validates their actual column schemas, then inserts the three widgets in a
transaction with targeted primary-key conflicts ignored. Fixed seed UUIDs end
in 000000000001 (LINE), 000000000002 (PIE), and 000000000003 (STACKED_BAR), under
the a2d97c21-981b-4ba1-9b32 prefix. Existing titles/config/content are not reset.
No chart row values are hardcoded.

Run npm run db:seed -w @test-dashboard/api after migrations. With only the supplied files, a clean seed run and rerun leave 2 source files, 3 datasets, 222 rows, and 3 widgets.
Unit tests require no PostgreSQL; database and widget e2e suites use disposable
schemas and preserve public development data.

### Writes

- `POST /api/widgets`, body `{ "type": "LINE" | "BAR" | "STACKED_BAR" | "PIE" | "TEXT" }`, returns 201 with `{ id, type, title }`. TEXT creation also accepts optional string `text`; omitted text defaults to empty. Supplying `text` for a chart or a non-string value returns 400.
- `PATCH /api/widgets/:id`, body `{ "text": string }`, returns the updated TEXT detail. Updating a chart returns 400. `updated_at` is set explicitly.
- `DELETE /api/widgets/:id`, returns 204 without a body. Unknown widgets return 404.

Nest DTO validation rejects missing/invalid fields and unknown body properties with 400. All mutation UUID parameters use ParseUUIDPipe. Internal errors return safe 500 messages.

Generated chart creation resolves the existing schema fingerprint registry, inserts a GENERATED dataset (null source_file_id), inserts its rows, then inserts the widget in one transaction. Random values are generated once by GeneratedDatasetFactory; GET only reads stored values. No file parsing or migration is involved.

| Type        | Shape                                         | Rows                    | Config                    |
| ----------- | --------------------------------------------- | ----------------------- | ------------------------- |
| LINE        | date (DATE), series (STRING), value (INTEGER) | 10 UTC dates × 3 series | xKey, seriesKey, valueKey |
| BAR         | category (STRING), value (INTEGER)            | 6                       | categoryKey, valueKey     |
| STACKED_BAR | category (STRING), series_a/b/c (INTEGER)     | 5                       | categoryKey, seriesKeys   |
| PIE         | label (STRING), value (INTEGER)               | 5                       | labelKey, valueKey        |
| TEXT        | no dataset; empty text, config {}             | none                    | none                      |

Values are positive randomized integers between 10 and 100 inclusive. Dataset schemas may be reused, but every chart receives a separate dataset and rows.

Deletion locks the widget and its dataset, removes the widget, then removes the dataset only if it is GENERATED and unreferenced. Rows cascade; schema records remain reusable. Imported FILE datasets and source files are preserved. Cleanup failure rolls back widget deletion.

Run `npm run test -w @test-dashboard/api`, `npm run test:db -w @test-dashboard/api`, and `npm run test:e2e -w @test-dashboard/api`. E2e tests exercise persisted mutations, shared-dataset cleanup (including concurrent deletes), validation, timestamps, and actual database-trigger failures to verify rollback. They apply migrations and seed the fixtures in isolated schemas without truncating public development data.

No upload, dataset/config editing, or authentication is added.

## Required xlstream patch

Applied by the API workspace's `postinstall` script using `patch-package`.
The version is pinned so installation fails clearly if an incompatible package is introduced.

The `xlstream` 2.5.5 patch is needed by the streaming parser contract:

- Close the ZIP handle used by `getWorksheets`, including failures.
- Own the ZIP handle in `getXlsxStreams` and close it on completion, early cancellation, or failure.
- Deliver synchronous row-transform failures through the stream error callback.
- Preserve cells explicitly marked as booleans, cached strings, or ISO dates instead of coercing them to numbers. This uses the XLSX cell type, not inference.

Worksheet rows remain streamed. xlstream still caches the shared-string table and style metadata internally. Excel dates stored as numeric serials remain numbers, and formulas are not evaluated; only cached values can be read. Merged-cell filling stays disabled.

Recheck this patch and the resource-lifecycle parser tests before upgrading xlstream.
