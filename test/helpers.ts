import { vi } from 'vitest';
import { OnetClient, type OnetClientOptions } from '../src/index.js';

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * A fake fetch that dispatches on the request path. Records every call so a
 * test can assert what went over the wire.
 */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const impl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, init });
    const route = routes[url.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route(url, init);
  });
  return { fetch: impl as unknown as typeof globalThis.fetch, calls };
}

export function client(routes: Record<string, Route>, options: Partial<OnetClientOptions> = {}) {
  const f = fakeFetch(routes);
  const c = new OnetClient({ apiKey: 'test-key', fetch: f.fetch, rateLimitDelayMs: 200, ...options });
  return { client: c, calls: f.calls, fetch: f.fetch };
}
