# Credits

This server was built without access to a Shopmonkey API key, so every endpoint
in v1.0.0 was written from the published documentation and never executed. Most
of what was wrong with it was found by people who ran it against real shops and
published their forks.

Their work is the substance of v1.1.0. It is credited here, in
`Co-Authored-By:` trailers on the commits that carry it, and inline in the code
and docs wherever a specific behaviour traces back to one of them.

## [Zan Pope](https://github.com/ZanPope) — [ZanPope/shopmonkey-mcp-server](https://github.com/ZanPope/shopmonkey-mcp-server)

Found that services and labor are nested resources and that the flat routes
v1.0.0 called do not exist — the single largest correctness problem in the
release. Also identified the dropped order `name` field, and built the two tools
that the nested routes make reachable.

- `list_services` → `GET /order/:orderId/service`
- `list_labor` → `GET /order/:orderId/service/:serviceId/labor`
- `add_service_to_order`, including copying a canned service template onto an
  order via `fromCannedServiceId`
- Technician assignment as a capability
- `create_order` / `update_order` silently discarding `name`

Carried in `2570d3a`. One deliberate divergence: `assign_technician` here uses
the documented `labor_bulk` endpoint rather than the per-line-item `PUT` in that
fork — see [docs/API-PROVENANCE.md](docs/API-PROVENANCE.md).

## [Andy Kimberle](https://github.com/AndyKimberle) — [AndyKimberle/shopmonkey-mcp-server](https://github.com/AndyKimberle/shopmonkey-mcp-server)

Runs this server in production on Railway, and found the two API behaviours that
made the reporting tools quietly wrong — neither of which is discoverable from
the documentation:

- Flat list endpoints accept date filters and ignore them, so every "revenue
  between these dates" answer was really "revenue in whatever batch came back"
- Those same endpoints return unstable, non-repeatable subsets across identical
  calls, so the same question could produce three different totals in a row

Also: that `/appointment/search` *does* filter by date server-side, that revenue
should be filtered on `invoicedDate` rather than `createdDate`, the label tools,
and the `{ phoneNumbers: [{ number }] }` body shape for customer phone search.

Carried in `adacf3a`, `fdf3b67` and `626c2fa`. The pagination here follows his
approach but terminates on the API's documented `meta.hasMore` signal rather
than a fixed page budget.

## [audioedgeaz](https://github.com/audioedgeaz) — [issue #1](https://github.com/AbbottDevelopments/shopmonkey-mcp-server/issues/1)

Filed the single most valuable bug report this project has had: a live-account
investigation showing that Shopmonkey accepts unknown body fields, ignores them,
applies defaults and still returns 200 — so every canned-service line item was
being written with the wrong field names and persisting at default values while
every call reported success. Included the correct per-type schemas, a
reproduction, and the reason the test suite could not have caught it (it asserted
the body the server built, never what Shopmonkey stored).

That report also independently confirmed, against the live API, that
`GET /v3/labor` and `GET /v3/service` return 404 — corroborating the nested-route
finding above — and identified the `phoneNumbers`/`emails` body shapes and two
filters that are accepted and ignored.

Carried in the canned-service line-item fix in v1.1.0. The still-unfixed items
from that report are tracked in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Reporting something

If you are running this against a real shop and find an endpoint that behaves
differently from what is documented here, please open an issue — field reports
are the only verification this project currently has.
