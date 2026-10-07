# xlstream 2.5.5 patch

Applied by the API workspace's `postinstall` script using `patch-package`.
The version is pinned so installation fails clearly if an incompatible package is introduced.

The patch is needed by the streaming parser contract:

- Close the ZIP handle used by `getWorksheets`, including failures.
- Own the ZIP handle in `getXlsxStreams` and close it on completion, early cancellation, or failure.
- Deliver synchronous row-transform failures through the stream error callback.
- Preserve cells explicitly marked as booleans, cached strings, or ISO dates instead of coercing them to numbers. This uses the XLSX cell type, not inference.

Worksheet rows remain streamed. xlstream still caches the shared-string table and style metadata internally. Excel dates stored as numeric serials remain numbers, and formulas are not evaluated; only cached values can be read. Merged-cell filling stays disabled.

Recheck this patch and the resource-lifecycle parser tests before upgrading xlstream.
