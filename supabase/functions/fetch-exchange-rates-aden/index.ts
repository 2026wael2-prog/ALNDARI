import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { buildCorsHeaders } from '../_shared/cors.ts'

// CORS is resolved centrally in `_shared/cors.ts` (production allow-list +
// loopback dev origins + SITE_URL fallback). The previous local list fell back
// to ALLOWED_ORIGINS[0] — a foreign project URL — so dev origins were refused.
const corsHeaders = (req: Request) => buildCorsHeaders(req.headers.get('Origin'))

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const { company_id } = await req.json()

    // Here you would typically fetch real market rates from an external API (e.g., Aden Exchange APIs)
    // For now, we return mock data that matches the expected format in the app.
    const mockRates = {
      SAR: { buy: 1.0, sell: 1.0 },
      USD: { buy: 3.75, sell: 3.76 },
      YER: { buy: 0.002, sell: 0.0021 },
    }

    return new Response(
      JSON.stringify(mockRates),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
