// ============================================================
// Shared CORS resolver for Supabase Edge Functions
// ============================================================
// Problem this solves
// -------------------
// Every function used to hard-code its own ALLOWED_ORIGINS list and fell back
// to the *first* entry when the request origin was not listed. The deployed
// ai-proxy therefore answered `Access-Control-Allow-Origin:
// https://zzthamxjxnxzzpswllid.supabase.co` for `http://localhost:8081` and the
// browser blocked every AI call in local development (CORS preflight failure →
// AI features silently degraded to template fallbacks).
//
// Rules implemented here
// ----------------------
//   1. Explicit allow-list (production app origins + SITE_URL env).
//   2. Loopback development origins (http://localhost:<port>,
//      http://127.0.0.1:<port>, http://[::1]:<port>) are always allowed:
//      a public website cannot forge `Origin: http://localhost:*`, so this
//      does not widen the attack surface the way `*` would.
//   3. Anything else gets SITE_URL (never a foreign project URL, never `*`).
// ============================================================

const PRODUCTION_ORIGINS = [
  'https://alzhra-erp.vercel.app',
  'https://alzhra-erp.netlify.app',
  'https://alzhra-2030karim2-devs-projects.vercel.app',
  // Supabase project origins (old + current) — used when the app is served
  // from the project domain itself (storage / preview builds).
  'https://zzthamxjxnxzzpswllid.supabase.co',
  'https://orxlyiokccaodypindye.supabase.co',
];

// Any loopback origin, any port (Vite picks 8081/5173/... freely).
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export interface CorsOptions {
  /** Comma separated list; defaults to 'POST, OPTIONS'. */
  methods?: string;
  /** Comma separated list; defaults to the ai-proxy header set. */
  headers?: string;
  /** Seconds the browser may cache the preflight result. */
  maxAgeSeconds?: number;
}

/** Resolves the value of `Access-Control-Allow-Origin` for a request origin. */
export function resolveAllowedOrigin(origin: string | null): string {
  const siteUrl = Deno.env.get('SITE_URL') ?? '';
  const allowList = siteUrl ? [...PRODUCTION_ORIGINS, siteUrl] : PRODUCTION_ORIGINS;

  if (origin && allowList.includes(origin)) return origin;
  if (origin && LOOPBACK_ORIGIN.test(origin)) return origin;

  // Never echo an unknown origin; never return '*' (it would let any website
  // drive the proxy with a stolen token).
  return siteUrl || PRODUCTION_ORIGINS[0];
}

/** Full CORS header set for a single request. */
export function buildCorsHeaders(
  origin: string | null,
  options: CorsOptions = {}
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
    'Access-Control-Allow-Methods': options.methods ?? 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      options.headers ??
      'authorization, x-client-info, apikey, content-type, x-application-name',
    'Access-Control-Max-Age': String(options.maxAgeSeconds ?? 86400),
  };
}
