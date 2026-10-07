# Import preparation components

`ImportsModule` imports and re-exports the existing non-global `ParsingModule`.
It also provides and exports `ColumnKeyNormalizer`, `SchemaInferrer`, and `ValueNormalizer`.
These components have no database or HTTP dependencies.

## Column keys

Headers retain their original `name` and zero-based `position`. Internal keys use Unicode NFKC normalization, lowercase letters, digits, and underscores. Whitespace and punctuation become underscores; repeated/edge underscores are removed. Empty keys fall back to `column_1`, `column_2`, etc. Collisions use deterministic `_2`, `_3`, etc. suffixes, including collisions with already suffixed input headers. Unicode letters are retained.

## Inference

`infer(columns, sample, sampleLimit = DEFAULT_SCHEMA_SAMPLE_LIMIT)` receives an already collected positional sample. The default limit is 200 rows. It only inspects the first `sampleLimit` rows, does not read files/streams, and does not retain/replay sample rows. Future orchestration must own sampling and replay.

- Null, undefined/missing cells, empty strings, and whitespace-only strings mark a column nullable and do not influence its type.
- Empty or entirely null samples fall back to STRING; empty samples are conservatively nullable.
- Decimal/scientific numeric strings and finite numbers are supported. Leading-zero identifiers, unsafe integers, non-finite values, hex, and grouped/currency numbers fall back to STRING.
- Only native booleans and case-insensitive `true`/`false` strings infer BOOLEAN; `0`/`1` and `yes`/`no` are not boolean aliases.
- DATE requires a valid calendar `YYYY-MM-DD` string. DATETIME accepts valid Date objects or ISO strings with explicit timezone and seconds, with up to millisecond precision.
- INTEGER + NUMBER widens to NUMBER; DATE + DATETIME widens to DATETIME. Other disagreements widen to STRING.
- XLSX serial dates remain numeric; there is no Excel-specific date guessing.

Types and nullability describe only the sample, not a guarantee about later rows.

## Row normalization

`normalize(columns, row)` uses each column's explicit position and unique key. STRING content is preserved; Date objects converted to strings use UTC ISO format. Empty/missing values always become null, even when the sample inferred non-nullability. Typed non-empty values that cannot be converted raise `ValueNormalizationError` instead of silently losing data. Invalid column positions/keys and extra row cells are rejected.

- DATE JSON values are `YYYY-MM-DD`. Native Date values must be UTC midnight to avoid discarding a time component.
- DATETIME JSON values use `Date.toISOString()` (UTC with milliseconds). DATE-only values in widened DATETIME columns become midnight UTC.
- Numeric and boolean values become JSON numbers/booleans.

No persistence, fingerprints, stream orchestration, controllers, or upload endpoints are implemented here.
