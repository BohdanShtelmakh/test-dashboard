# Widgets

- `GET /api/widgets`: `{ id, type, title }[]`, ordered by creation time then UUID.
- `GET /api/widgets/:id`: a chart's `{ id, type, title, config, dataset }`, or a
  TEXT widget's `{ id, type: 'TEXT', title, text }` without a dataset or config.
- Chart datasets expose `{ id, name, rowCount, columns, rows }`. Columns contain
  only name/key/type/nullable/position, ordered by position. Rows contain only
  JSON values ordered by row_index; source-file metadata and database row IDs
  are not returned.

The controller validates UUIDs using Nest's ParseUUIDPipe. Unknown IDs return
404; invalid IDs return 400. Database/config failures return safe 500 messages.
Chart detail uses three fixed queries: widget and dataset metadata, columns,
then rows. TEXT detail needs only the first query. No cache or aggregation is
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

Run npm run db:seed -w @test-dashboard/api after migrations. A clean seed run
and rerun leave 2 source files, 3 datasets, 222 rows, and 3 widgets.
Unit tests require no PostgreSQL; database and widget e2e suites use disposable
schemas and preserve public development data.

## Writes

- `POST /api/widgets`, body `{ "type": "LINE" | "BAR" | "STACKED_BAR" | "PIE" | "TEXT" }`, returns 201 with `{ id, type, title }`.
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
