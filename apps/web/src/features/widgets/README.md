# Dashboard widgets

Run the API on port 3000, then start the frontend from the repository root:

```sh
VITE_API_URL=http://localhost:3000 npm run dev -w @test-dashboard/web
```

`useWidgets` fetches summaries with the `['widgets']` query key. Each card uses
`useWidget(id)` with `['widgets', id]`, so detail loading, errors, and retries are
independent. Requests use the existing native-fetch client and cancellation signal.

`WidgetRenderer` selects LINE, BAR, STACKED_BAR, PIE, or TEXT components using the
API's discriminated types. Chart transformations use configuration keys and dataset
column names rather than fixture-specific labels.

LINE data is pivoted into dynamic series; DATE/DATETIME axes are ordered
chronologically. Missing or invalid numbers remain gaps. Duplicate x/series pairs
retain the last valid value; the supplied dataset has no duplicate pairs. Ordinary
numeric values are not interpreted as dates. STACKED_BAR uses the configured series
keys with a shared stack; PIE excludes invalid and negative values.

Verification commands:

```sh
npm run typecheck -w @test-dashboard/web
npm run lint -w @test-dashboard/web
npm run build -w @test-dashboard/web
npm run test -w @test-dashboard/web
```

## Mutations

The header opens a Mantine Create widget modal with only a type selector. Each
card has a delete action; TEXT cards offer Edit, Save, and Cancel. Errors remain
local to the action, drafts survive failed saves, and pending actions prevent
duplicate submissions.

API functions and hooks stay separate. `useCreateWidget` invalidates only the
exact `['widgets']` list. `useUpdateWidget(id)` writes the returned TEXT detail
into `['widgets', id]` without refetching charts. `useDeleteWidget(id)` cancels
in-flight detail reads, removes the detail and list entry, and invalidates only
the list. PostgreSQL persists all data; no localStorage or generated client data
is used.

BAR renders `categoryKey`/`valueKey` configs and continues to support the prior
`xKey` contract. The desktop grid remains three columns with additional rows,
two columns on tablets, and one on mobile.

Tests cover native-fetch mutation requests and 204 responses, transformations,
renderer choice, and cache behavior using the existing React/TanStack runtime
without another UI testing dependency.
