# API Provenance

Why some v1.0.0 tools called endpoints that do not exist, and which of those
errors were ours versus changes on Shopmonkey's side.

This file exists so that the next person to find a wrong endpoint can tell,
without re-doing the research, whether the code drifted from the API or was
never right in the first place.

## What "verified" meant in v1.0.0

`docs/CAPABILITIES.md` and `docs/LIMITATIONS.md` both opened with "All endpoints
are verified against the Shopmonkey REST API v3."

**No Shopmonkey API key was available at any point during the v1.0.0 build.**
Every endpoint, body shape and field name was read off the published
documentation and reasoned about; none of it was executed. "Verified" meant
"matches the docs as we read them," which is a much weaker claim than it
sounded like, and it is the reason a route that no page ever documented shipped
as though it had been confirmed.

Build dates, for dating the evidence below:

| Commit | Date | What |
|---|---|---|
| `851992f` | 2026-03-25 | Initial build, 33 tools |
| `92a6712` | 2026-04-13 | Expansion to 64 tools |

## Findings

Each row was checked against the documentation as it stood at build time, via
the Internet Archive, not against today's docs.

| # | Issue | Documented at build time? | Verdict |
|---|---|---|---|
| 1 | Services called as flat `GET /service?orderId=` | **Yes** — the nested route was documented | Our error |
| 2 | Labor called as flat `GET /labor?orderId=` | **No** — no flat labor route has ever been documented | Our error |
| 3 | `create_order` recorded as "not in the public API documentation" | Correct at the time | **Upstream drift** |
| 4 | Date filters on list endpoints silently ignored | Documented as working | Upstream doc inaccuracy |
| 5 | List endpoints return unstable, non-repeatable subsets | Not documented either way | Undocumented behaviour |
| 6 | `meta.hasMore` / `meta.total` unused | **Yes** — documented on list responses | Our omission |

### 1. Services are nested under their order — our error

The [Service resource page as archived 2026-02-07][svc], seven weeks *before*
the initial build, documented `orderId` as a required **URL parameter** and gave
this example:

```
curl https://api.shopmonkey.cloud/v3/order/ORDERID/service
```

The [Order resource page as archived 2026-04-10][ord], three days before the
64-tool expansion, listed only three endpoints — and two of them are the nested
service routes:

- `GET /v3/customer/:id/order`
- `GET /v3/order/:orderId/service`
- `PUT /v3/order/:orderId/service/:id`

No flat `GET /v3/service` appears on either page, at either date. The nested
shape was documented, plainly, before we wrote the tool. We read `orderId` as a
query filter when the docs presented it as a path segment.

Fixed in `2570d3a`.

### 2. Labor has never had a flat list route — our error

The [Labor resource page as archived 2025-09-15][lab] — six months before the
build — documents exactly one endpoint, `PUT /v3/order/:orderId/labor_bulk`, and
today's page still documents exactly that one endpoint. The page has not
meaningfully changed in a year.

`GET /labor` was not taken from the documentation, because it was never in the
documentation. It was inferred from the REST pattern the other resources follow
and shipped without ever being called.

Two consequences for the fix, both in `2570d3a`:

- `list_labor` now reads the nested `GET /order/:orderId/service/:serviceId/labor`
  route. This route is **also** undocumented, but unlike the flat route it has
  been exercised against a live shop (see below).
- `assign_technician` uses the documented `labor_bulk` endpoint rather than the
  per-line-item `PUT` used in the fork it came from, because `labor_bulk` is the
  only technician-assignment route Shopmonkey documents.

### 3. `create_order` — genuine upstream drift

`LIMITATIONS.md` recorded that `POST /v3/order` "is not visible in the public
API documentation" and marked `create_order` unverified. **That was accurate
when written**: the archived Order page of 2026-04-10 does not list it.

Shopmonkey has since published it. The current OpenAPI description for the Work
Orders API documents `POST /order` with an `OrderInput` body schema and marks it
a confirmed endpoint.

This is the one item on this list where the documentation moved underneath us
rather than us misreading it. The `LIMITATIONS.md` entry has been updated
accordingly — the tool is no longer flagged as resting on an undocumented
endpoint, though it remains unexecuted here.

### 4 & 5. Ignored date filters and unstable ordering — not visible from docs

Neither of these could have been caught by reading documentation, and neither is
a drift:

- The list endpoints document a `where` query param as "an object to use for
  filtering the results", alongside `limit`, `skip` and `orderby`. In practice,
  on the flat list endpoints, neither `where` nor flat `startDate`/`endDate`
  changes which records come back — the server answers with its default batch
  and reports no error. The documentation describes a filter that does not
  filter.
- Identical `GET /appointment` calls seconds apart return different, sometimes
  non-overlapping subsets of the same data. On a shop with 2000+ orders, three
  identical revenue queries returned three different totals.

Both were found in production against a live shop by
[Andy Kimberle](https://github.com/AndyKimberle/shopmonkey-mcp-server), whose
fork runs this server on Railway. They are the reason `docs/LIMITATIONS.md`
previously recommended a workaround — "use tighter date ranges to stay within
the 100-record limit" — that cannot work, since narrowing the range has no
effect on what the API returns.

Worked around in `fdf3b67`: date-filtered appointment queries now use
`POST /appointment/search`, whose structured `where.<field>.gte/.lte` filter
*is* applied server-side, and order-based reports page the full list and filter
client-side.

### 6. `meta.hasMore` was there the whole time — our omission

The archived Order page documents a `meta` object on list responses carrying
`hasMore`, `total` and `sums`. The v1.0.0 client discarded the entire envelope
except `data`, so nothing downstream could tell a full page from the last page,
and the reports simply took the first 100 records and called it the answer.

Fixed in `adacf3a`: `shopmonkeyRequestWithMeta` preserves it and `fetchAllRecords`
terminates on `hasMore` where the API provides it.

## What is still unverified

Still no API key. Everything above is documentation research plus field reports
from fork operators — no endpoint in this repo has been executed by us against a
live Shopmonkey account. `docs/LIMITATIONS.md` marks the specific routes that
rest on field reports rather than published documentation.

[svc]: https://web.archive.org/web/20260207104717/https://shopmonkey.dev/resources/service
[ord]: https://web.archive.org/web/20260410225847/https://shopmonkey.dev/resources/order
[lab]: https://web.archive.org/web/20250915071202/https://shopmonkey.dev/resources/labor
