import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { buildCorsHeaders } from '../_shared/cors.ts'

const corsHeaders = (req: Request) => buildCorsHeaders(req.headers.get('Origin'))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // 1. Strict JWT Authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHENTICATED: يتطلب تسجيل الدخول' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHENTICATED: جلسة غير صالحة' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const companyId = typeof body?.company_id === 'string' && body.company_id.trim() !== ''
      ? body.company_id.trim()
      : null

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'company_id is required' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 2. Return latest RLS-authorized company exchange rates from DB (never fabricated mock rates)
    const { data: rows, error: dbErr } = await userClient
      .from('exchange_rates')
      .select('currency_code, rate_to_base, effective_date, created_at')
      .eq('company_id', companyId)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (dbErr) {
      return new Response(
        JSON.stringify({ error: 'تعذر جلب أسعار الصرف المعتمدة' }),
        { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const rates: Record<string, { buy: number; sell: number; effective_date?: string }> = {
      SAR: { buy: 1.0, sell: 1.0 },
    }
    for (const row of rows ?? []) {
      const code = String(row.currency_code || '').toUpperCase().trim()
      const rate = Number(row.rate_to_base || 0)
      if (code && rate > 0 && !rates[code]) {
        rates[code] = {
          buy: rate,
          sell: rate,
          effective_date: row.effective_date ?? undefined,
        }
      }
    }

    return new Response(
      JSON.stringify(rates),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
