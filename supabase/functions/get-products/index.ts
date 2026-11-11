import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

// CORS is resolved centrally in `_shared/cors.ts` (production allow-list +
// loopback dev origins + SITE_URL fallback). The previous local list fell back
// to ALLOWED_ORIGINS[0] — a foreign project URL — so dev origins were refused.
const corsHeaders = (req: Request) =>
  buildCorsHeaders(req.headers.get('Origin'), {
    methods: 'GET, POST, OPTIONS',
    headers: 'authorization, x-client-info, apikey, content-type',
  });

const jsonResponse = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401, req);
    }

    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get query parameters
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = url.searchParams.get('search') || '';

    // Build query
    let query = supabaseClient
      .from('products')
      .select('id, name_ar, sku, brand, part_number, sale_price, purchase_price, status, barcode, category_id', { count: 'exact' })
      .is('deleted_at', null)
      .eq('status', 'active')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    // Add search filter if provided
    if (search) {
      query = query.or(`name_ar.ilike.%${search}%,sku.ilike.%${search}%,part_number.ilike.%${search}%,brand.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return jsonResponse({
        error: 'Database error',
        details: error.message,
        hint: error.hint,
        code: error.code,
      }, 500, req);
    }

    return jsonResponse({ data, count, limit, offset }, 200, req);
  } catch (err) {
    console.error('Unexpected error:', err);
    return jsonResponse({ error: 'Internal server error', message: err.message }, 500, req);
  }
});