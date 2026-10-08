# Test Dashboard

A full-stack analytics dashboard built for the YouScan Full-Stack Engineer test assignment. The frontend uses React, TypeScript, Vite, Mantine, TanStack Query, and Recharts; the backend uses NestJS, PostgreSQL, and Drizzle ORM. Provided files are parsed into persisted datasets, which chart widgets render through a REST API.

## Features

- Three widgets per desktop row, unlimited rows, and a responsive tablet/mobile layout.
- Line, bar, stacked bar, pie, and text widgets.
- Initial line and pie charts from the provided XLSX, and a stacked bar chart from the provided CSV.
- Reusable CSV/TSV/XLSX import pipeline.
- Randomized, persisted datasets for newly created chart widgets.
- Text widget Edit → Save, widget deletion, and per-widget loading/error/retry states.
- PostgreSQL persistence across page reloads.

## Project structure

```text
apps/
  api/    NestJS backend
  web/    React frontend
data/     Supplied assignment files
```

The repository uses npm workspaces: `@test-dashboard/api` and `@test-dashboard/web`. Backend feature areas include `database` (schema, migrations, seed), `imports/parsing` (file processing), and `widgets` (API and persistence). Frontend widget rendering and queries live under `apps/web/src/features/widgets`.

## Architecture

```text
XLSX / CSV / TSV → Parser → Schema inference / normalization
                → Dataset persistence → Widget → REST API → React + Recharts
```

Chart widgets reference persisted datasets; widget configuration maps dataset columns to a visualization. Imported datasets originate from files, while new charts receive generated datasets whose values are saved once and survive reloads. Text widgets store text directly and require no dataset.

Rows are processed incrementally, sampled for inference, and persisted in batches instead of accumulating entire worksheets in application row arrays. XLSX shared strings/styles may still be retained by the library, so memory usage is not perfectly constant. Schema fingerprints allow matching column schemas to be reused across datasets.

See the [API README](apps/api/README.md) for import, persistence, widget, and parser-patch details, and the [web README](apps/web/README.md) for rendering, queries, and cache behavior.

## Prerequisites

- Node.js 24 or later (the root package requires `>=24`).
- npm, with workspace support.
- Docker and Docker Compose for local PostgreSQL and optional API/pgweb containers.

## Installation

Run all commands below from the repository root unless stated otherwise:

```sh
npm ci
```

This installs the locked workspace dependencies and applies the repository's required `xlstream` patch through the API install hook. See [patch documentation](apps/api/README.md#required-xlstream-patch).

## Environment variables

Create local environment files on a fresh clone:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

If these files already exist, retain your local settings. Real `.env` files are ignored; examples are tracked.

| Workspace | Variable | Local value / behavior |
| --- | --- | --- |
| API | `DATABASE_URL` | `postgresql://dashboard:dashboard@localhost:5432/dashboard` |
| API | `CORS_ORIGIN` | `http://localhost:5173` |
| API | `PORT` | Optional; defaults to `3000` |
| Web | `VITE_API_URL` | `http://localhost:3000` (the client adds `/api/...` paths) |

The example credentials are for local development only. Compose overrides the API container's database hostname to `postgres`; the host `.env` should continue using `localhost`. If Vite uses a different port, update `CORS_ORIGIN` accordingly.

## Database

Start PostgreSQL, wait for it to be healthy, then apply committed migrations and seed:

```sh
docker compose up -d --wait postgres
docker compose ps
npm run db:migrate -w @test-dashboard/api
npm run db:seed -w @test-dashboard/api
```

The seed builds the API, imports all regular CSV/TSV/XLSX files directly in `data/` (case-insensitive extensions, sorted filenames), and creates the three required initial widgets. Additional files are imported without automatically creating widgets. The supplied filenames still select the required initial charts. With only the supplied files, a clean seed produces two source files, three datasets, and 222 rows. Rerunning is idempotent: existing file imports are reused and existing seeded widget state is preserved. Rerunning after deleting a seeded widget recreates that missing widget.

To import an additional local file without creating widgets:

```sh
npm run db:import -w @test-dashboard/api -- data/additional.csv
```

Relative paths resolve from the directory where you invoke npm. Supported extensions are `.csv`, `.tsv`, and `.xlsx`; format detection is shared with the seed. Invalid imports fail without committing a partial file.

Migrations are explicit; the application does not run schema synchronization at startup. PostgreSQL data persists in the `postgres_data` Docker volume. Run the seed on the host because the API image excludes the supplied data files.

## Running locally

After database setup, run these in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

These root scripts start the respective workspace development servers; there is no combined root startup script.

| Service | Address |
| --- | --- |
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 (routes under `/api`) |
| PostgreSQL | `localhost:5432` |
| pgweb, when started | http://localhost:8081 |

Vite's default port is 5173; it may choose another if that port is occupied. Do not run both the host API and Docker API on port 3000 simultaneously.

## Docker development

Compose provides PostgreSQL 17 with a healthcheck and persistent volume, the compiled NestJS API on Node 24, and pgweb for development database inspection. A separate one-shot migration service is available through the `tools` profile. The API and pgweb wait for PostgreSQL health; migrations remain a separate step.

For a fresh Docker-based setup, first complete installation/environment setup above, then:

```sh
docker compose up -d --wait postgres
docker compose --profile tools run --rm --build migrate
npm run db:seed -w @test-dashboard/api
docker compose up --build
```

After adding migrations, rerun the one-shot migration command above. Ordinary `docker compose up` does not run migrations or seed data.

The Dockerfile uses the repository root build context and lockfile, with both workspace manifests available for npm resolution. Only API dependencies are installed; the required `xlstream` patch is applied in both dependency installations. The migration service uses the build stage with Drizzle tooling. The final API image runs compiled ESM JavaScript (`dist/main.js`) as the non-root Node user, with production dependencies. No frontend source/build or environment files are copied into the image.

`docker compose down` removes containers while preserving the `postgres_data` volume. The API and pgweb restart unless explicitly stopped.

To switch from the container API to the host API:

```sh
docker compose stop api
docker compose up -d --wait postgres pgweb
npm run db:migrate -w @test-dashboard/api
npm run dev:api
```

The frontend is not containerized. Run `npm run dev:web` separately and use the same frontend/API URLs above. pgweb binds to localhost on port 8081. This Compose configuration is for local development; public deployment instructions and a deployment link will be supplied separately.

## API overview

| Endpoint | Description |
| --- | --- |
| `GET /api/widgets` | List widget summaries. |
| `GET /api/widgets/:id` | Fetch persisted chart data/configuration or text. |
| `POST /api/widgets` | Create a widget with a `type` of `LINE`, `BAR`, `STACKED_BAR`, `PIE`, or `TEXT`. |
| `PATCH /api/widgets/:id` | Save a text widget with `{ "text": "..." }`. |
| `DELETE /api/widgets/:id` | Delete a widget; returns 204. |

Creation returns 201. Invalid input returns 400, missing widgets return 404, and unexpected errors return safe 500 responses. File importing is exposed as a backend service and seed workflow, not an HTTP upload endpoint. The starter `/api` greeting has been removed; it returns 404.

## Testing and quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

These root scripts check both workspaces. Unit tests require no PostgreSQL. For database integration and API end-to-end tests, start PostgreSQL, configure the API environment, and apply migrations as described above:

```sh
npm run test:db -w @test-dashboard/api
npm run test:e2e -w @test-dashboard/api
```

Use a local development/test database. Import and widget API suites use disposable schemas; the focused database-constraint suite uses rolled-back transactions against the migrated schema.

For the browser acceptance test, start local PostgreSQL and configure the API environment, then run:

```sh
npx playwright install chromium
npm run test:e2e -w @test-dashboard/web
```

This starts dedicated API/frontend servers on ports 3001/5174. It checks the seeded charts, creation of all five types, per-widget loading/read errors, text-save failure/retry, persistence after reload, and deletion. The runner in `apps/api/test/run-browser-tests.ts` runs directly on Node 24 and is excluded from the production build. It applies committed migrations and runs the folder seed in a disposable schema, then removes that schema. Existing application data is retained. It uses the PostgreSQL connection from `apps/api/.env` unless `DATABASE_URL` is overridden; the database user must be able to create schemas. Browser artifacts are ignored.

## Assignment-specific notes

Provided source values are not hardcoded: XLSX and CSV files are parsed programmatically. The XLSX contains separate line-chart and pie-chart worksheets, each persisted as its own dataset. New charts use randomized persisted data as required by the assignment; editing is implemented for text widgets. Dataset selection and chart field editing are outside this assignment implementation's scope.

The API pool limits connection acquisition to five seconds; this is not a query execution timeout. Chart detail reads use a short read-only REPEATABLE READ transaction to avoid inconsistent data during concurrent deletion.

## Trade-offs

- A modular monolith keeps the assignment's feature boundaries clear without microservice overhead.
- PostgreSQL JSONB rows support heterogeneous datasets without dynamically creating tables.
- One transaction per file is suitable for the supplied small files; large production imports could use staging/import status and shorter transactions.
- Generated values are persisted instead of regenerated on reads.
- Synchronous imports meet the small-data scope without Redis or background jobs.
