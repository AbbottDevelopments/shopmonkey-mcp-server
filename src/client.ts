import type { ResponseMeta, ShopmonkeyResponse } from './types/shopmonkey.js';

const RAW_BASE_URL = process.env.SHOPMONKEY_BASE_URL ?? 'https://api.shopmonkey.cloud/v3';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');
const MAX_RETRIES = 3;
const MAX_CONCURRENT = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    requestQueue.push({ resolve });
  });
}

function releaseSlot(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) {
    activeRequests++;
    next.resolve();
  }
}

function getApiKey(): string {
  const key = process.env.SHOPMONKEY_API_KEY;
  if (!key) {
    throw new Error(
      'SHOPMONKEY_API_KEY is not configured. ' +
      'Set it in your environment, .env file, or MCP client config. ' +
      'Create one at: Shopmonkey Settings > Integration > API Keys'
    );
  }
  return key;
}

export function getDefaultLocationId(): string | undefined {
  return process.env.SHOPMONKEY_LOCATION_ID || undefined;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null, attempt: number): number {
  if (!header) return 1000 * Math.pow(2, attempt);
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return 1000 * Math.pow(2, attempt);
}

export function sanitizePathParam(value: string): string {
  return encodeURIComponent(value);
}

// ── Date filtering ───────────────────────────────────────────────────────────
//
// Shopmonkey's flat list endpoints (GET /order, GET /appointment, ...) accept
// date parameters but do not apply them: neither flat startDate/endDate query
// params nor a Mongo-style `where` JSON param change which records come back.
// The server answers with its default batch either way. This was found in
// production against a live shop by Andy Kimberle
// (AndyKimberle/shopmonkey-mcp-server); see docs/LIMITATIONS.md.
//
// So date filtering is done one of two ways, depending on the resource:
//   1. A /search endpoint, where structured where.<field>.gte/.lte filters do
//      work server-side (preferred — correct and cheap).
//   2. Client-side, by paginating the list and comparing each record's own
//      date field here.

/** True when `value` falls inside [startDate, endDate]. Absent bounds are open. */
export function isWithinDateRange(
  value: string | undefined | null,
  startDate?: string,
  endDate?: string
): boolean {
  if (!startDate && !endDate) return true;
  if (!value) return false;

  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return false;

  if (startDate) {
    const startTs = Date.parse(toDateRangeBoundary(startDate, 'start'));
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }
  if (endDate) {
    const endTs = Date.parse(toDateRangeBoundary(endDate, 'end'));
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }
  return true;
}

/**
 * Widens a date-only value ("2026-08-18") to the correct edge of that whole day
 * so a range reads inclusively, and leaves a full ISO datetime untouched.
 */
export function toDateRangeBoundary(value: string, edge: 'start' | 'end'): string {
  if (/T\d/.test(value)) return value;
  return edge === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
}

// ── Pagination ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RECORDS = 1000;

export interface FetchAllResult<T> {
  records: T[];
  /** True when the safety cap was hit before the API ran out of records. */
  truncated: boolean;
}

/**
 * Reads every page of a list endpoint, rather than a single capped fetch.
 *
 * A single capped GET is not safe to reason about here: identical requests to
 * these endpoints, seconds apart, have been observed returning different and
 * sometimes non-overlapping subsets of the same data, so "fetch 100 and filter"
 * silently undercounts and gives a different answer each time it runs. Reported
 * from production by Andy Kimberle (AndyKimberle/shopmonkey-mcp-server), whose
 * fork saw three identical revenue queries return three different totals.
 *
 * Paging until the data is exhausted removes the dependence on where an
 * arbitrary cutoff lands. Termination, in order of preference:
 *   - `meta.hasMore === false` — the API's own end-of-data signal
 *   - a short page — the conventional fallback when meta is absent
 *   - `maxRecords` — a safety cap so a very large shop cannot page forever,
 *     reported back as `truncated` so callers can say the answer is partial
 *
 * Records are de-duplicated by id, since the reordering described above can
 * surface the same record on two pages. `skip` (not the de-duplicated count)
 * drives the loop, so dedupe can never stall it.
 */
export async function fetchAllRecords<T extends { id?: unknown }>(
  path: string,
  params?: Record<string, string>,
  options?: { pageSize?: number; maxRecords?: number }
): Promise<FetchAllResult<T>> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRecords = options?.maxRecords ?? DEFAULT_MAX_RECORDS;

  const records: T[] = [];
  const seenIds = new Set<unknown>();
  let skip = 0;
  let moreRemain = false;

  while (skip < maxRecords) {
    const limit = Math.min(pageSize, maxRecords - skip);

    const { data: page, meta } = await shopmonkeyRequestWithMeta<T[]>('GET', path, undefined, {
      ...params,
      limit: String(limit),
      skip: String(skip),
    });

    if (!Array.isArray(page) || page.length === 0) {
      moreRemain = false;
      break;
    }

    for (const record of page) {
      const id = record?.id;
      if (id !== undefined) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      records.push(record);
    }

    skip += page.length;

    if (meta?.hasMore === false) { moreRemain = false; break; }
    if (page.length < limit) { moreRemain = false; break; }
    moreRemain = true;
  }

  return { records, truncated: moreRemain && skip >= maxRecords };
}

export interface RequestResult<T> {
  data: T;
  meta?: ResponseMeta;
}

export async function shopmonkeyRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<T> {
  const result = await shopmonkeyRequestWithMeta<T>(method, path, body, params);
  return result.data;
}

/**
 * Same request as {@link shopmonkeyRequest}, but keeps the response envelope's
 * `meta` block. List endpoints report `meta.hasMore` and `meta.total` there;
 * plain shopmonkeyRequest discards them, which leaves a caller with no reliable
 * way to know whether it has seen every page.
 */
export async function shopmonkeyRequestWithMeta<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<RequestResult<T>> {
  const apiKey = getApiKey();
  await acquireSlot();

  try {
    return await shopmonkeyRequestInner<T>(apiKey, method, path, body, params);
  } finally {
    releaseSlot();
  }
}

async function shopmonkeyRequestInner<T>(
  apiKey: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<RequestResult<T>> {
  let url: URL;
  try {
    url = new URL(`${BASE_URL}${path}`);
  } catch {
    throw new Error(`Invalid API URL: ${BASE_URL}${path}. Check SHOPMONKEY_BASE_URL configuration.`);
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error(`Network error after ${MAX_RETRIES} attempts: ${lastError.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = parseRetryAfter(retryAfter, attempt);

      if (attempt < MAX_RETRIES - 1) {
        await sleep(waitMs);
        continue;
      }

      if (response.status === 429) {
        throw new Error(
          `Rate limited by Shopmonkey API after ${MAX_RETRIES} attempts. ` +
          `Retry after ${retryAfter ?? 'unknown'} seconds.`
        );
      }
      lastError = new Error(`Shopmonkey API returned ${response.status} after ${MAX_RETRIES} attempts`);
      break;
    }

    if (!response.ok) {
      const text = await response.text();
      let errorMessage: string;
      let errorCode: string | undefined;

      try {
        const errorData = JSON.parse(text) as ShopmonkeyResponse<unknown>;
        errorMessage = errorData.message ?? `HTTP ${response.status}`;
        errorCode = errorData.code;
      } catch {
        errorMessage = text || `HTTP ${response.status} ${response.statusText}`;
      }

      throw new Error(
        errorCode
          ? `Shopmonkey API error [${errorCode}]: ${errorMessage}`
          : `Shopmonkey API error: ${errorMessage}`
      );
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { data: undefined as T };
    }

    let data: ShopmonkeyResponse<T>;
    try {
      data = await response.json() as ShopmonkeyResponse<T>;
    } catch {
      throw new Error(`Invalid JSON response from Shopmonkey API (HTTP ${response.status})`);
    }

    if (!data.success) {
      throw new Error(
        data.code
          ? `Shopmonkey API error [${data.code}]: ${data.message ?? 'Unknown error'}`
          : `Shopmonkey API error: ${data.message ?? 'Unknown error'}`
      );
    }

    if (data.data === undefined || data.data === null) {
      throw new Error('Shopmonkey API returned success but no data');
    }

    return { data: data.data, meta: data.meta };
  }

  throw lastError ?? new Error('Request failed after maximum retries');
}
