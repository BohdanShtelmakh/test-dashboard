# Web workspace

React dashboard built with Vite, Mantine, TanStack Query, and Recharts. Follow the [root README](../../README.md) for installation, environment configuration, startup, and quality checks. Run the documented commands from the repository root.

## Dashboard widgets

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

### Mutations

The header opens a Mantine Create widget modal with a type selector and an optional initial-text field for TEXT widgets. Each
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
without a DOM testing dependency. Browser acceptance coverage uses Playwright and a disposable PostgreSQL schema; see the [root testing workflow](../../README.md#testing-and-quality-checks).
