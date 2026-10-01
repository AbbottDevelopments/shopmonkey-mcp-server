# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because other systems connect to this server as an MCP client, versions are cut
against the **tool contract**, not the internals:

| Bump | When |
|---|---|
| MAJOR | A tool is removed or renamed, or an existing argument changes meaning or becomes required |
| MINOR | A tool is added, or an argument is added without breaking existing calls |
| PATCH | A fix that leaves the tool contract unchanged |

A corrected endpoint is a PATCH if callers are unaffected and a MAJOR if it is
not — v1.1.0 is a MINOR despite making `orderId` required on `list_services`,
because the previous route returned 404 and no working call could break.

## [1.2.0] — 2026-10-01

Reconciles this server with Shopmonkey's current documentation and with what
three public forks learned running against real shops. Full credit in
[CREDITS.md](CREDITS.md); what each change rests on, and how sure we are, in the
*Verification ledger* in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

**Still no live account.** Nothing here has been executed by the maintainers.
Entries marked **(unverified)** rest on a field report or on documentation that
does not specify the detail in question.

### Fixed

- **Inventory tools called routes that no page documents.** `list_inventory_parts`,
  `get_inventory_part` and `list_inventory_tires` now use `POST /inventory_part/search`,
  `GET /inventory_part/:id` and `POST /inventory_tire/search`. `search_parts` called
  `GET /part`, which is the order line-item resource, and now matches over the
  inventory search client-side. Location filters are rechecked client-side
  **(server-side `where` unverified)**.
- **Payment reads called routes that no page documents.** `list_payments` and
  `get_payment` now use `POST /integration/payment/search`, the only documented
  payment read. `get_payment` requires the returned id to match rather than
  trusting the filter **(`where` unverified)**.
- **`list_timeclock` called `GET /timeclock`.** It now uses `POST /timesheet/search`.
  Date ranges are applied client-side on `clockIn`, because no date filter is
  documented for the endpoint. Results are now an object carrying `truncated`.
- **`assign_technician` used `labor_bulk`, which has been removed from the
  documentation** and answers "Route not found" on a live shop. It now writes each
  line with `PUT /order/:orderId/service/:serviceId/labor/:id`, then reads the
  order back and reports per line whether the technician persisted. `laborIds` is
  now optional (omit it to assign every labor line on the order).
- **`list_labor` called a nested `GET .../labor` route that is not documented.** It
  now reads the `labors` carried on `GET /order/:orderId/service`.
- **`search_customers` ignored its `query`** (issue #5). It now filters by
  `normalizedName` `contains`, one request per word, verifies each response
  against the word that asked for it, and falls back to a client-side scan whose
  `coverage` field says plainly that it is partial **(unverified — the operator is
  a field report, not documented)**. Results are compact summaries; use
  `get_customer` for the full record.
- **`list_orders` ignored `status` and `customerId`** (issue #6). When either is
  given, the list is now paged and filtered client-side, and the result reports
  `truncated`.
- **`create_order` could not set `status`.** `POST /order` has no such field. The
  status is now applied with a follow-up `PUT`, and the result reports what was
  corrected and anything that still did not persist.
- **`search_customers_by_email` body shape** now sends plain strings first and
  retries the `{ email }` object form if rejected **(unverified)**. The v1.1.0
  entry that attributed the object form to a field report was wrong — see
  [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md) §8.

### Added

- `update_service` — set a service's name or note, verified by read-back
- `complaint`, `recommendation` and `workflowStatusId` on `create_order` and
  `update_order`; `update_order` now reports which fields persisted
- `fetchAllRecordsPost` — pages `POST …/search` endpoints, which take `limit` and
  `skip` in the body
- Tool annotations (`readOnlyHint`, `destructiveHint`) on every tool
- `MCP_READ_ONLY=true` — opt-in; hides and refuses every non-read tool

### Changed

- Tool count 69 → 70
- Response shapes changed on routes that previously failed or misbehaved:
  `search_customers`, `search_parts`, `list_timeclock`, `create_order`,
  `update_order` and filtered `list_orders` now return objects with diagnostic
  fields rather than bare arrays. Callers that parsed the old shapes need updating.
  This is a MINOR under the convention above only because the previous routes did
  not work.
- `@modelcontextprotocol/sdk` 1.30.0 → 1.31.0; `npm audit fix` clears three
  moderate advisories (`fast-uri`, `hono`, `ip-address`). Audit now reports zero.
- `docs/API-PROVENANCE.md` corrected: the Labor page it cited documented four
  endpoints, not one; the email body shape was an extrapolation, not a field
  report.

### Not changed, on purpose

- **`create_payment`** still posts to the undocumented `POST /payment`. The
  documented route lists no body parameters, and a guessed payment body is how
  the v1.0.0 line-item bug happened. It fails loudly instead. See
  [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- Fee / subcontract / tire canned-service field names (issue #4) remain unverified.

## [1.1.1] — 2026-09-04

Security patch. No tool contract changes.

### Fixed

- **48 known vulnerabilities in transitive dependencies** (12 high), all reached
  through `@modelcontextprotocol/sdk`: `hono`, `fast-uri`, `path-to-regexp`,
  `@hono/node-server`, `qs`, `ip-address` and `body-parser`. The vulnerable
  versions were pinned by a stale lockfile rather than by the SDK — bumping the
  SDK alone changed nothing. Relocking moved every affected package past its fix
  version. Snyk now reports zero.
- **Prototype pollution in the report tools.** `report_revenue_summary` and
  `report_appointment_summary` build their breakdown maps keyed by a status field
  taken straight from the API response, so a value of `__proto__` or
  `constructor` reached `Object.prototype`. Both maps are now null-prototype.
- **The HTTP transport returned raw error text to callers.** A failed request
  answered with the exception message, which can carry internal paths, upstream
  URLs and Shopmonkey error detail. It is now logged server-side and answered
  with a generic message.

### Changed

- `@modelcontextprotocol/sdk` floor raised from `^1.12.1` to `^1.30.0`, matching
  what was already being installed and tested against.
- Plaintext HTTP in `src/http.ts` is documented in `docs/LIMITATIONS.md` as
  intentional — TLS terminates at the proxy in front of it — along with the
  condition that comes with it: do not expose this process directly.

## [1.1.0] — 2026-09-03

The first release informed by people running this server against real shops.
v1.0.0 was written entirely from Shopmonkey's published documentation without an
API key, and several tools called endpoints that do not exist. Most of this
release is correcting that, from two public forks and one live-account bug report.

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
- **Canned-service line items were written with the wrong field names.** One
  shared allowlist was reused for all five line-item types. Shopmonkey ignores
  unknown body keys, applies its defaults and returns 200, so labor persisted at
  `hours: 1` and parts at `retailCostCents: 0` regardless of what was passed, and
  `update_*` corrections silently no-opped. Labor now sends `hours`/`rateCents`/
  `costRateCents`/`note` and parts `quantity`/`retailCostCents`/
  `wholesaleCostCents`/`note`. Reported with a live reproduction in
  [#1](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/issues/1).
  Fee, subcontract and tire are deliberately left on the old allowlist — see
  *Known gaps*.
- **`search_customers_by_email` sent the wrong body shape**, the same bug as the
  phone variant. The endpoint takes `{ emails: [{ email }] }`.
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
- `add_canned_service_fee`, `_subcontract` and `_tire` are still on the old
  shared field allowlist and are very likely wrong in the same way labor and
  parts were. Their schemas could not be verified, and guessing field names is
  what caused that bug, so they were left alone rather than changed on a hunch.
- `search_customers` ignores its `query` argument and `list_orders` ignores its
  `status` filter, both confirmed against a live account. Not fixed here — the
  correct request shape is unknown without an account to test against.
- Whether `GET /timeclock` honours date filters is untested.

## [1.0.0] — 2026-04-13

Initial release. 64 tools across 11 resource groups, dual stdio and Streamable
HTTP transports, retry with backoff, concurrency limiting, and multi-location
support.

Built from the published Shopmonkey documentation without access to an API key —
see [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md).

⚠ The `v1.0.0` tag does not point at any commit on `master`. It resolves to
`2f96973`, which sits on an orphaned lineage left behind by a history rewrite —
`master` carries a twin of that commit (`7f46463`) with the same message and a
different hash. Checking out the tag therefore gets you code that diverged before
the nine commits that followed on master, including the fix for
`StreamableHTTPServerTransport` being unusable after its first request in
stateless mode. It also still contains `docs/CLIENT-CLARIFICATIONS.md`, removed
from master in `b350588`.

The tag has been left where it is rather than moved — it has been published since
April, and repointing a released tag is worse than documenting it. Use `v1.1.0`.

[1.2.0]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AbbottDevelopments/shopmonkey-mcp-server/releases/tag/v1.0.0
