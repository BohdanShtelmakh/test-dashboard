# Local Docker development

Run these commands from the repository root:

```sh
docker compose build api
docker compose up -d --wait postgres
docker compose run --build --rm migrate
docker compose up -d api pgweb
docker compose ps
```

`migrate` is an explicit, one-shot tools-profile service. It runs the existing
`db:migrate` script against Docker PostgreSQL using the migration files in
`apps/api/drizzle`. Run it again after adding migrations. It is excluded from
ordinary `docker compose up`; the API does not run migrations on startup.
No schema synchronization or seeding occurs.

- API: http://localhost:3000
- pgweb: http://localhost:8081 (bound to loopback)
- PostgreSQL: localhost:5432

The PostgreSQL named volume `postgres_data` is preserved across container
recreation. `docker compose down` stops/removes containers while retaining data.
The API and pgweb restart unless explicitly stopped.

The Dockerfile uses the repository root as its build context and the root
lockfile. Only API dependencies are installed, with both workspace manifests
available for npm resolution. The existing API patch-package hook runs in both
dependency installations. No frontend source or build is copied into the image.
The build stage includes Drizzle tooling for the migration service; the final
image contains production dependencies and compiled ESM JavaScript, runs as the
Node user, and starts `dist/main.js` directly with Node 24.

Docker-specific connection URLs live in Compose. The host API's existing
`apps/api/.env` retains its localhost connection; environment files are excluded
from the Docker build context.

To run the API on the host instead:

```sh
docker compose stop api
docker compose up -d --wait postgres pgweb
npm run db:migrate -w @test-dashboard/api
npm run dev:api
```

The host and container API share port 3000, so stop one before starting the other.
The React frontend continues to run directly on the host.
