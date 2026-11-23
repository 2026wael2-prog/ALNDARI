import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * telegram-intelligence-webhook
 * Handles authorized Telegram Bot commands (/summary, /buy, /part <query>)
 * and inline approval callbacks (approve:<recId>, postpone:<recId>).
 * Security: Validates optional Telegram secret header AND matches chat_id
 * against `messaging_config` with `telegram_enabled = true`.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function replyTelegram(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')?.trim();
    if (!expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Webhook secret is not configured' }),
        { status: 503, headers: corsHeaders }
      );
    }
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (incomingSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized webhook secret' }), { status: 401, headers: corsHeaders });
    }

    const update = await req.json();
    const message = update?.message;
    const callback = update?.callback_query;
    const rawChatId = String(message?.chat?.id ?? callback?.message?.chat?.id ?? '');
    if (!rawChatId) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Authorize chat_id against messaging_config
    const { data: cfg } = await supabase
      .from('messaging_config')
      .select('company_id, telegram_bot_token, telegram_chat_id, telegram_enabled')
      .eq('telegram_chat_id', rawChatId)
      .eq('telegram_enabled', true)
      .maybeSingle();

    if (!cfg || !cfg.telegram_bot_token) {
      return new Response(JSON.stringify({ error: 'Unauthorized chat_id' }), { status: 403, headers: corsHeaders });
    }

    const companyId = cfg.company_id as string;
    const botToken = cfg.telegram_bot_token as string;

    // 1) Handle inline approval callbacks
    if (callback?.data) {
      const [action, recId] = String(callback.data).split(':');
      if ((action === 'approve' || action === 'postpone') && recId) {
        const nextStatus = action === 'approve' ? 'approved' : 'postponed';
        const { error: updErr } = await supabase
          .from('inv_intelligence_recommendations')
          .update({ status: nextStatus, decided_at: new Date().toISOString() })
          .eq('id', recId)
          .eq('company_id', companyId);

        if (!updErr) {
          await replyTelegram(
            botToken,
            rawChatId,
            action === 'approve'
              ? `✅ تم اعتماد التوصية رقم <code>${recId}</code> بنجاح.`
              : `⏸️ تم تأجيل التوصية رقم <code>${recId}</code>.`
          );
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
    }

    // 2) Handle text commands
    const text = String(message?.text ?? '').trim();
    if (text.startsWith('/summary')) {
      const { count: pendingCount } = await supabase
        .from('inv_intelligence_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending');

      await replyTelegram(
        botToken,
        rawChatId,
        `📊 <b>ملخص ذكاء المخزون</b>\n• التوصيات المعلقة بانتظار القرار: <b>${pendingCount ?? 0}</b>\nاستخدم <code>/buy</code> لأهم توصيات الشراء أو <code>/part اسم_الصنف</code> للبحث السريع.`
      );
    } else if (text.startsWith('/buy')) {
      const { data: recs } = await supabase
        .from('inv_intelligence_recommendations')
        .select('id, product_name, recommended_qty, urgency')
        .eq('company_id', companyId)
        .eq('rec_type', 'purchase')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(8);

      const lines = (recs ?? []).map(
        (r, i) => `${i + 1}. <b>${r.product_name ?? 'صنف'}</b> — الكمية: <b>${r.recommended_qty}</b> (${r.urgency})`
      );
      await replyTelegram(
        botToken,
        rawChatId,
        lines.length > 0
          ? `🛒 <b>أهم توصيات الشراء المعلقة:</b>\n${lines.join('\n')}`
          : '✅ لا توجد توصيات شراء معلقة حالياً.'
      );
    } else if (text.startsWith('/part')) {
      const query = text.replace(/^\/part\s*/i, '').trim();
      if (!query || query.length < 2) {
        await replyTelegram(botToken, rawChatId, 'يرجى كتابة اسم الصنف أو رقمه بعد الأمر، مثال: <code>/part 1200</code>');
      } else {
        const safeQuery = `"%${query.replace(/["\\]/g, '')}%"`;
        const { data: prods } = await supabase
          .from('products')
          .select('id, name_ar, sku, part_number, brand')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .or(`name_ar.ilike.${safeQuery},sku.ilike.${safeQuery},part_number.ilike.${safeQuery}`)
          .limit(5);

        const lines = (prods ?? []).map(
          (p, i) => `${i + 1}. <b>${p.name_ar}</b> | SKU: <code>${p.sku ?? '—'}</code> | P/N: <code>${p.part_number ?? '—'}</code>`
        );
        await replyTelegram(
          botToken,
          rawChatId,
          lines.length > 0 ? `🔍 <b>نتائج البحث عن "${query}":</b>\n${lines.join('\n')}` : `لم يتم العثور على أصناف مطابقة لـ "${query}".`
        );
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
