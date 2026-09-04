# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-03

The first release informed by people running this server against real shops.
v1.0.0 was written entirely from Shopmonkey's published documentation without an
API key, and several tools called endpoints that do not exist. Most of this
release is correcting that, from two public forks.

Full credit in [CREDITS.md](CREDITS.md). Why the errors happened, and which were
ours versus changes on Shopmonkey's side, in [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md).

### Fixed

- **`list_services` called a route that does not exist.** Services are nested
  under their order. Now `GET /order/:orderId/service`; `orderId` is required.
- **`list_labor` called a route that does not exist.** Labor is nested under
  order → service. Now `GET /order/:orderId/service/:serviceId/labor`; both
  `orderId` and `serviceId` are required.
- **`create_order` and `update_order` silently discarded `name`** (the order
  title) because it was missing from the field allowlists.
- **`search_customers_by_phone` sent the wrong body shape.** The endpoint takes
  `{ phoneNumbers: [{ number }] }`, not `{ phoneNumber }`.
- **Reports trusted date filters the API ignores.** `report_revenue_summary`,
  `report_appointment_summary` and `list_appointments` passed `startDate`/`endDate`
  to endpoints that accept and discard them, then presented the result as if the
  range had applied. Combined with a single 100-record fetch off an unstably
  ordered list, the same revenue question could return a different total on
  consecutive runs. Appointments now use `POST /appointment/search`, whose
  `where` filter works server-side; order reports page the full list and filter
  client-side.
- **Revenue was attributed by the wrong date.** `report_revenue_summary` now
  filters on `invoicedDate`, not `createdDate` — an order opened in one month
  and invoiced in the next belongs to the month it was invoiced, and orders
  never invoiced are excluded.
- **The HTTP transport leaked on every request.** In stateless mode a fresh
  transport and `McpServer` are created per request; neither was closed, leaking
  a full tool registry per request for the life of the process.

### Added

- `add_service_to_order` — add a service to a work order, including copying a
  canned service template onto it via `fromCannedServiceId`
- `assign_technician` — assign a technician to labor line items, via the
  documented `labor_bulk` endpoint
- `list_labels`, `get_label`, `assign_label` — the Label resource
- `shopmonkeyRequestWithMeta` — preserves the response envelope's `meta` block,
  which carries the `hasMore` and `total` that list endpoints report and the
  previous client discarded
- `fetchAllRecords` — pages a list endpoint to exhaustion, terminating on
  `meta.hasMore` where available, de-duplicating by `id`, and reporting
  `truncated` when a safety cap is hit
- `isWithinDateRange` / `toDateRangeBoundary` — client-side date filtering, with
  a bare date treated as the whole day so ranges are inclusive at both ends
- Reports now return `truncated` (and revenue returns `scannedOrders`) so a
  partial answer is visible as one
- [CREDITS.md](CREDITS.md) and [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md)

### Changed

- Tool count 64 → 69
- `docs/LIMITATIONS.md` rewritten. The previous "use tighter date ranges to stay
  within the 100-record limit" guidance was wrong — narrowing the range has no
  effect on what these endpoints return. Report ceiling is now 1000 records,
  reported via `truncated`.
- `docs/LIMITATIONS.md` and `docs/CAPABILITIES.md` no longer claim endpoints are
  "verified against the Shopmonkey REST API v3." No endpoint in this repo has
  been executed against a live account by the maintainers.
- `create_order` is no longer flagged as resting on an undocumented endpoint —
  Shopmonkey has since published `POST /order`. It remains unexecuted here.
- `PaginationParams.page` → `.skip`, matching what the tools have sent since
  `b396298`.

### Known gaps

- Still no API key. `GET /order/:orderId/service/:serviceId/labor` and
  `PUT /label/:labelId/assign` are field-reported but undocumented; `create_order`
  and several body schemas remain unexecuted. See `docs/LIMITATIONS.md`.
- Whether `GET /timeclock` honours date filters is untested.

## [1.0.0] — 2026-04-26

Initial release. 64 tools across 11 resource groups, dual stdio and Streamable
HTTP transports, retry with backoff, concurrency limiting, and multi-location
support.

Built from the published Shopmonkey documentation without access to an API key —
see [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md).

[1.1.0]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/releases/tag/v1.0.0
