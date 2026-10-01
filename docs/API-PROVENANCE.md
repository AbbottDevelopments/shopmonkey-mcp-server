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
| 7 | Inventory, payment, timeclock and parts-search routes | **No** — never documented at those paths | Our error |
| 8 | Email search body element shape | Not specified | Our extrapolation (see §8) |

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

There is a sharper version of this. On **2026-04-11** — two days before `92a6712`
shipped the flat route — an endpoint reference extracted from shopmonkey.dev was
written into this project's working notes, and it contains the line
`GET /v3/order/:orderId/service`, along with the nested
`fee/labor/part/subcontract/tire` sub-resources. The correct shape was not merely
available in the public documentation; it had already been read, transcribed and
saved by this project, and the implementation went the other way regardless.

The failure was never a shortage of information. It was not consulting the
information already gathered, and then calling the result "verified."

Fixed in `2570d3a`.

### 2. Labor has never had a flat list route — our error

`GET /labor` was not taken from the documentation, because no flat labor route
has ever been documented. It was inferred from the REST pattern the other
resources follow and shipped without ever being called.

> **Correction (v1.2.0).** Earlier versions of this file said the
> [Labor resource page as archived 2025-09-15][lab] "documents exactly one
> endpoint, `PUT /v3/order/:orderId/labor_bulk`". **That was wrong.** The same
> archived page documents four: `labor_bulk`, plus `PUT`, `POST` and `DELETE`
> on `/v3/order/:orderId/service/:serviceId/labor[/:id]`. It was not checked
> carefully, and it fed the decision below to prefer `labor_bulk` over the
> per-line-item `PUT` that [ZanPope's fork][zan] had found. The page no longer
> exists (`/resources/labor` is a 404 and the sidebar has no Labor entry), the
> current [Order page](https://shopmonkey.dev/resources/order) no longer lists
> `labor_bulk`, and CJVlady reports `labor_bulk` answering "Route not found" on
> a live shop. The per-line-item `PUT` is documented on the Order page today and
> accepts `technicianId`.

What this means for the code:

- `assign_technician` originally used `labor_bulk` (`2570d3a`) on the strength
  of the mistaken claim above. As of v1.2.0 it uses the per-line-item `PUT`, as
  ZanPope's fork did, and reads the order back to confirm the write.
- `list_labor` originally called `GET /order/:orderId/service/:serviceId/labor`.
  **No such route is documented.** The current Order page's `GET
  /order/:orderId/service` response carries each service's `labors`, and v1.2.0
  reads labor from there instead, as CJVlady's fork does.

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

### 7. Four more v1.0.0 routes that no page documents — our error

Found by reading the current documentation while reconciling the forks (v1.2.0).
Each was, like the flat labor route, inferred from the REST pattern and never
called. None of them was ever corrected by a field report, because nobody had
reported on them.

| Tool | Route we called | What the docs document |
|---|---|---|
| `list_inventory_parts`, `get_inventory_part` | `GET /inventory/part[/:id]` | `GET /inventory_part/:id`, `POST /inventory_part/search` — underscore, not slash |
| `list_inventory_tires` | `GET /inventory/tire` | `POST /inventory_tire/search` |
| `search_parts` | `GET /part?query=` | Nothing. `/part` is the order line-item resource, not inventory |
| `list_payments`, `get_payment` | `GET /payment[/:id]` | `POST /integration/payment/search` only |
| `list_timeclock` | `GET /timeclock` | `POST /timesheet/search` (documented on the *Timeclock* page) |

CJVlady's fork reached the same routes by running against a live shop, which is
independent confirmation that the documented ones are the ones that work.

`create_payment` still posts to `POST /payment`, which is also undocumented. The
documented route is `POST /integration/payment/manual/charge`, but its page
lists **no body parameters**, and guessing a payment body is exactly how
`add_canned_service_labor` came to persist wrong values behind a 200. It has
been left on the old route, where it fails loudly, until someone can confirm the
body against a live account. See `docs/LIMITATIONS.md`.

### 8. Email search body — an extrapolation, not a finding

v1.1.0 changed `search_customers_by_email` to send `{ emails: [{ email }] }` and
the changelog credited the shape to a field report. **It was not in the report.**
audioedgeaz's issue #1 said only that the API "requires `phoneNumbers` /
`emails`" — the key names, not their elements. The `[{ email }]` form was copied
by analogy from the phone fix, whose `[{ number }]` element shape *was* found
live by Andy Kimberle.

Shopmonkey's [Customer page](https://shopmonkey.dev/resources/customer) types
both as bare `array` and gives `{ "emails": [] }` as its example, so the
documentation cannot settle the element shape for either.

Two independent forks — ZanPope's and CJVlady's — changed email search to plain
strings (`{ emails: ["a@b.com"] }`), and CJVlady's change came out of live
acceptance testing. v1.2.0 sends strings first and falls back to the object form
if the API rejects it. **Still unverified by us.**

## What is still unverified

Still no API key. Everything above is documentation research plus field reports
from fork operators — no endpoint in this repo has been executed by us against a
live Shopmonkey account. `docs/LIMITATIONS.md` marks the specific routes that
rest on field reports rather than published documentation.

[svc]: https://web.archive.org/web/20260207104717/https://shopmonkey.dev/resources/service
[ord]: https://web.archive.org/web/20260410225847/https://shopmonkey.dev/resources/order
[lab]: https://web.archive.org/web/20250915071202/https://shopmonkey.dev/resources/labor
[zan]: https://github.com/ZanPope/shopmonkey-mcp-server
