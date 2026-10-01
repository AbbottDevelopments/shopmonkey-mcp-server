// Email and phone are sub-resources in Shopmonkey. After creating a customer, use POST /v3/customer/:id/email
// and POST /v3/customer/:id/phone_number to attach contact info. Those sub-resource tools are tracked in Spec 2.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { shopmonkeyRequest, fetchAllRecordsPost, sanitizePathParam, getDefaultLocationId } from '../client.js';
import type { Customer } from '../types/shopmonkey.js';
import type { ToolHandlerMap } from '../types/tools.js';
import { pickFields } from '../types/tools.js';

export const definitions: Tool[] = [
  {
    name: 'search_customers',
    description:
      'Find customers by name, company, email, phone or external id. Matching is case-insensitive and word order does not matter. ' +
      'Normally filters server-side, so an empty result is meaningful. ALWAYS read the returned `coverage` field: if `filtering` says "client-side fallback", a zero result does NOT prove the customer is absent, because that endpoint has been seen not to enumerate every record. ' +
      'Nicknames do not resolve ("Bob" will not find "Robert"). Returns compact summaries; use get_customer for the full record.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Name, email or phone to search for. Substring, case-insensitive, word order independent.' },
        where: { type: 'object', description: 'Raw Shopmonkey filter object, passed through verbatim. For probing filter syntax; leave unset for normal use.' },
        locationId: { type: 'string', description: 'Filter by location ID. Defaults to SHOPMONKEY_LOCATION_ID env var if set.' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 25)' },
        skip: { type: 'number', description: 'Number of records to skip for pagination (default: 0)' },
      },
    },
  },
  {
    name: 'search_customers_by_email',
    description: 'Search for a customer in Shopmonkey by email address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string', description: 'Customer email address to search for' },
      },
      required: ['email'],
    },
  },
  {
    name: 'search_customers_by_phone',
    description: 'Search for a customer in Shopmonkey by phone number.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        phoneNumber: { type: 'string', description: 'Customer phone number to search for' },
      },
      required: ['phoneNumber'],
    },
  },
  {
    name: 'get_customer',
    description: 'Get detailed information about a single customer by their ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The customer ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer in Shopmonkey.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        firstName: { type: 'string', description: 'Customer first name' },
        lastName: { type: 'string', description: 'Customer last name' },
        address: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
      },
    },
  },
  {
    name: 'update_customer',
    description: 'Update an existing customer\'s information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The customer ID to update' },
        firstName: { type: 'string', description: 'Customer first name' },
        lastName: { type: 'string', description: 'Customer last name' },
        address: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        zip: { type: 'string', description: 'ZIP code' },
      },
      required: ['id'],
    },
  },
];

const ALLOWED_FIELDS = ['firstName', 'lastName', 'address', 'city', 'state', 'zip'];
const SEARCH_FIELDS = ['query', 'limit', 'skip', 'locationId', 'where'];

function applyDefaultLocation(body: Record<string, unknown>): void {
  if (!body.locationId) {
    const defaultId = getDefaultLocationId();
    if (defaultId) body.locationId = defaultId;
  }
}

function jsonResult(payload: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

type Row = Record<string, unknown>;

function queryTokens(query: string): string[] {
  return query.toLowerCase().match(/[a-z0-9@.+-]{2,}/g) ?? [];
}

/** Everything a person would plausibly search by, flattened and lower-cased. */
function customerHaystack(c: Customer): string {
  const r = c as unknown as Row;
  const emails = Array.isArray(r.emails) ? (r.emails as Row[]) : [];
  const phones = Array.isArray(r.phoneNumbers) ? (r.phoneNumbers as Row[]) : [];
  return [r.firstName, r.lastName, r.companyName, r.normalizedName, r.externalId, ...emails.map((e) => e?.email), ...phones.map((p) => p?.number)]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * Records matching every word of the query, or — if none match them all —
 * partial matches ranked by how long (so how specific) the matched words are.
 * Example: for "ann smith", a record holding "annabel smith" outranks one that
 * only matches "ann". Substring matching means a nickname that is not a literal
 * substring of the stored name ("bob" vs "robert") finds nothing.
 */
export function rankCustomerMatches(records: Customer[], query: string): Customer[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const scored = records.map((c) => {
    const hay = customerHaystack(c);
    const hit = tokens.filter((t) => hay.includes(t));
    return { c, hits: hit.length, weight: hit.reduce((n, t) => n + t.length, 0) };
  });
  const full = scored.filter((x) => x.hits === tokens.length);
  if (full.length > 0) return full.map((x) => x.c);
  return scored.filter((x) => x.hits > 0).sort((a, b) => b.weight - a.weight || b.hits - a.hits).map((x) => x.c);
}

/** Full customer records are large enough that a page of them can swamp a model's context. */
function summariseCustomer(c: Customer): Row {
  const r = c as unknown as Row;
  const emails = Array.isArray(r.emails) ? (r.emails as Row[]) : [];
  const phones = Array.isArray(r.phoneNumbers) ? (r.phoneNumbers as Row[]) : [];
  return {
    id: r.id,
    firstName: r.firstName ?? null,
    lastName: r.lastName ?? null,
    companyName: r.companyName ?? null,
    emails: emails.map((e) => e?.email).filter(Boolean),
    phoneNumbers: phones.map((p) => p?.number).filter(Boolean),
    city: r.city ?? null,
    state: r.state ?? null,
    externalId: r.externalId ?? null,
    createdDate: r.createdDate ?? null,
  };
}

export const handlers: ToolHandlerMap = {
  // Field report (issue #5): the `query` argument sent previously is ignored by
  // POST /customer/search, which returns arbitrary records. The documentation
  // types `where` only as "any". CJVlady's fork found by live testing that
  // `where: { normalizedName: { contains: <word> } }` is honoured, that it takes
  // a single substring (so a multi-word query must be split), and that the
  // `like` / `%` form is silently ignored.
  // UNVERIFIED by us: the `contains` operator and `normalizedName` field are
  // not in Shopmonkey's documentation. To stay safe if they stop working, every
  // response is checked against the word that requested it, and a failed check
  // falls back to a client-side scan whose `coverage` warns that it is partial.
  async search_customers(args) {
    const base = pickFields(args, SEARCH_FIELDS);
    applyDefaultLocation(base);
    delete base.query; delete base.limit; delete base.skip; delete base.where;

    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const limit = typeof args.limit === 'number' ? args.limit : 25;
    const skip = typeof args.skip === 'number' ? args.skip : 0;
    const rawWhere = args.where && typeof args.where === 'object' ? (args.where as Row) : null;

    if (rawWhere) {
      const { records, truncated } = await fetchAllRecordsPost<Customer>('/customer/search', { ...base, where: rawWhere }, { maxRecords: 1000 });
      return jsonResult({
        query: query || null, filtering: 'raw where passthrough', whereUsed: rawWhere,
        matched: records.length, truncated, results: records.slice(skip, skip + limit).map(summariseCustomer),
      });
    }

    const tokens = query ? queryTokens(query) : [];
    if (tokens.length > 0) {
      const union = new Map<unknown, Customer>();
      let serverFiltered = true;
      let anyTruncated = false;

      for (const token of tokens) {
        try {
          const { records, truncated } = await fetchAllRecordsPost<Customer>(
            '/customer/search', { ...base, where: { normalizedName: { contains: token } } }, { maxRecords: 1000 }
          );
          const honoured = records.every((r) => {
            const n = (r as unknown as Row).normalizedName;
            return typeof n === 'string' && n.toLowerCase().includes(token);
          });
          if (!honoured) { serverFiltered = false; break; }
          anyTruncated = anyTruncated || truncated;
          for (const r of records) {
            const id = (r as unknown as Row).id;
            if (id !== undefined) union.set(id, r);
          }
        } catch {
          serverFiltered = false;
          break;
        }
      }

      if (serverFiltered) {
        const ranked = rankCustomerMatches([...union.values()], query);
        const page = ranked.slice(skip, skip + limit);
        return jsonResult({
          query, filtering: 'server-side (per-word contains)', wordsSearched: tokens,
          matched: ranked.length, returned: page.length, truncated: anyTruncated,
          coverage: anyTruncated
            ? 'A word matched more records than the cap allows; results are partial.'
            : 'The filter was applied by Shopmonkey and every response was checked against the word that requested it. An empty result means no customer name contains these words, though a customer may still be reachable by email or phone.',
          results: page.map(summariseCustomer),
        });
      }
    }

    // Fallback: the server filter was not honoured, or there was no query.
    const { records, truncated } = await fetchAllRecordsPost<Customer>('/customer/search', base, { maxRecords: 5000 });
    const matched = query ? rankCustomerMatches(records, query) : records;
    const page = matched.slice(skip, skip + limit);
    return jsonResult({
      query: query || null, filtering: 'client-side fallback',
      matched: matched.length, returned: page.length, scanned: records.length, truncated,
      coverage:
        'WARNING — the server-side filter was not honoured, so this fell back to reading pages and filtering here. ' +
        'That endpoint has been seen not to enumerate every customer, so ' + records.length + ' records reached' + (truncated ? ' before the scan cap' : '') +
        ' is a sample, not the whole list. A zero result is NOT proof the customer is absent: confirm with search_customers_by_email, ' +
        'search_customers_by_phone or the Shopmonkey web UI before creating a new customer.',
      results: page.map(summariseCustomer),
    });
  },

  // UNVERIFIED element shape. Shopmonkey types `emails` only as "array"
  // (example: `{ "emails": [] }`). v1.1.0 sent `[{ email }]`, extrapolated from
  // the phone shape. ZanPope's fork and CJVlady's live testing both use plain
  // strings, so strings are tried first; a rejection retries the object form.
  async search_customers_by_email(args) {
    if (!args.email) return { content: [{ type: 'text', text: 'Error: email is required' }], isError: true };
    const email = String(args.email);
    let data: Customer[];
    try {
      data = await shopmonkeyRequest<Customer[]>('POST', '/customer/email/search', { emails: [email] });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('Shopmonkey API error')) throw err;
      data = await shopmonkeyRequest<Customer[]>('POST', '/customer/email/search', { emails: [{ email }] });
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  // Element shape `[{ number }]` was found live by Andy Kimberle
  // (AndyKimberle/shopmonkey-mcp-server); the docs type it only as "array".
  async search_customers_by_phone(args) {
    if (!args.phoneNumber) return { content: [{ type: 'text', text: 'Error: phoneNumber is required' }], isError: true };
    const data = await shopmonkeyRequest<Customer[]>('POST', '/customer/phone_number/search', { phoneNumbers: [{ number: String(args.phoneNumber) }] });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async get_customer(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const data = await shopmonkeyRequest<Customer>('GET', `/customer/${sanitizePathParam(String(args.id))}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async create_customer(args) {
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Customer>('POST', '/customer', body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },

  async update_customer(args) {
    if (!args.id) return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
    const body = pickFields(args, ALLOWED_FIELDS);
    const data = await shopmonkeyRequest<Customer>('PUT', `/customer/${sanitizePathParam(String(args.id))}`, body);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
};
