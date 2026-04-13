import type { ShopmonkeyResponse } from './types/shopmonkey.js';

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

export async function shopmonkeyRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<T> {
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
): Promise<T> {
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
      return undefined as T;
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

    return data.data;
  }

  throw lastError ?? new Error('Request failed after maximum retries');
}
