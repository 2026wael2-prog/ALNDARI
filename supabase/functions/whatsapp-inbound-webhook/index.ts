import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ============================================================
// whatsapp-inbound-webhook — Al-Zahra Smart ERP
// ============================================================
// يستقبل رسائل الواتساب الواردة من WASender أو UltraMsg أو أي بوابة Webhook لحظياً.
// يقوم بالتعرف على العميل، وتحليل رسالته بالذكاء الاصطناعي،
// وتدوين الملاحظة أو وعد السداد تلقائياً في قاعدة البيانات وتحديث التطبيق،
// والرد على العميل آلياً باحترافية عبر WASender أو UltraMsg.
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

interface NormalizedInboundMessage {
  senderPhone: string;
  messageText: string;
  fromMe: boolean;
  pushName?: string;
  isGroup?: boolean;
}

/** استخراج ومعايرة الرسالة الواردة لدعم كل من WASender و UltraMsg والبوابات المعيارية */
function extractInboundMessage(body: Record<string, unknown>): NormalizedInboundMessage | null {
  if (!body || typeof body !== 'object') return null;

  const data = (body.data && typeof body.data === 'object' ? body.data : null) as Record<string, unknown> | null;

  // 1. فحص هل الرسالة مرسلة من المنشأة نفسها (fromMe)
  const fromMe = Boolean(
    body.fromMe === true ||
    data?.fromMe === true ||
    (data?.key && typeof data.key === 'object' && (data.key as Record<string, unknown>).fromMe === true)
  );

  // 2. استخراج رقم المرسل
  let rawFrom = '';
  if (typeof body.sender === 'string') rawFrom = body.sender;
  else if (typeof body.phone === 'string') rawFrom = body.phone;
  else if (typeof body.from === 'string') rawFrom = body.from;
  else if (data && typeof data.from === 'string') rawFrom = data.from;
  else if (data && typeof data.sender === 'string') rawFrom = data.sender;
  else if (data && typeof data.phone === 'string') rawFrom = data.phone;
  else if (data && data.key && typeof data.key === 'object') {
    const key = data.key as Record<string, unknown>;
    if (typeof key.remoteJid === 'string') rawFrom = key.remoteJid;
  }

  // 3. فحص هل الرسالة داخل مجموعة (Group)
  const isGroup = Boolean(
    body.isGroup === true ||
    data?.isGroup === true ||
    rawFrom.includes('@g.us') ||
    (typeof body.chatId === 'string' && body.chatId.includes('@g.us'))
  );

  // 4. استخراج نص الرسالة من مختلف هياكل WASender و UltraMsg
  let messageText = '';
  if (typeof body.message === 'string') messageText = body.message;
  else if (typeof body.text === 'string') messageText = body.text;
  else if (typeof body.body === 'string') messageText = body.body;
  else if (data) {
    if (typeof data.body === 'string') messageText = data.body;
    else if (typeof data.message === 'string') messageText = data.message;
    else if (typeof data.text === 'string') messageText = data.text;
    else if (data.message && typeof data.message === 'object') {
      const msgObj = data.message as Record<string, unknown>;
      if (typeof msgObj.conversation === 'string') messageText = msgObj.conversation;
      else if (msgObj.extendedTextMessage && typeof msgObj.extendedTextMessage === 'object') {
        const ext = msgObj.extendedTextMessage as Record<string, unknown>;
        if (typeof ext.text === 'string') messageText = ext.text;
      }
    }
  }

  // تنظيف رقم الهاتف وإزالة بادئات الواتساب والرموز غير الرقمية
  const senderPhone = rawFrom.replace(/@.*$/, '').replace(/[^0-9]/g, '');

  return {
    senderPhone,
    messageText: messageText.trim(),
    fromMe,
    pushName: typeof body.pushname === 'string' ? body.pushname : (typeof data?.pushname === 'string' ? data.pushname : undefined),
    isGroup,
  };
}

interface AiAnalysisResult {
  intent: 'promise' | 'inquiry' | 'dispute' | 'general_note';
  summary: string;
  promise_date: string | null;
  promise_amount: number | null;
  promise_currency: string | null;
  reply_to_customer: string | null;
}

/** تنظيف واستخراج JSON من رد الذكاء الاصطناعي */
function parseAiJson(raw: string): AiAnalysisResult | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return JSON.parse(cleaned) as AiAnalysisResult;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as AiAnalysisResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** استدعاء الذكاء الاصطناعي لتحليل كلام العميل */
async function analyzeCustomerMessageWithAI(params: {
  customerName: string;
  messageText: string;
  balanceSummary: string;
}): Promise<AiAnalysisResult | null> {
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('DEEPSEEK_API_KEY');
  if (!openRouterKey) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isDeepSeek = Boolean(Deno.env.get('DEEPSEEK_API_KEY'));
  const apiUrl = isDeepSeek ? 'https://api.deepseek.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const modelName = isDeepSeek ? 'deepseek-chat' : 'google/gemini-2.0-flash-001';

  const systemPrompt = `أنت خبير مالي وإداري ذكي لتحصيل الديون ومتابعة العملاء في منشأة تجارية.
وظيفتك تحليل رد العميل الوارد عبر واتساب واستخراج:
1. نية العميل (intent):
   - "promise": إذا وعد بالسداد وحدد موعداً أو قال "سأسدد"، "بحول لكم"، "يوم الأحد"، "نهاية الشهر".
   - "inquiry": إذا استفسر عن حسابه أو طلب تفاصيل أو كشف حساب.
   - "dispute": إذا اعترض على فاتورة أو مبالغ مسجلة عليه.
   - "general_note": عذر عام، سفر، مرض، أو شكر.
2. ملخص موجز باللغة العربية لما أفاد به العميل (summary).
3. تاريخ الوعد المتوقع بصيغة YYYY-MM-DD (promise_date) إذا ذكر موعداً (تاريخ اليوم كمرجع: ${todayStr}).
4. مبلغ الوعد كعدد (promise_amount) إذا حدد مبلغاً معيناً.
5. عملة الوعد (SAR أو YER).
6. نص رد مهذب ورسمي وودود يرسله النظام للعميل فوراً عبر واتساب (reply_to_customer).

أخرج كائن JSON بالهيكل التالي فقط:
{
  "intent": "promise" | "inquiry" | "dispute" | "general_note",
  "summary": "ملخص باللغة العربية",
  "promise_date": "YYYY-MM-DD" أو null,
  "promise_amount": 1000 أو null,
  "promise_currency": "YER" أو "SAR" أو null,
  "reply_to_customer": "نص الرد باللغة العربية"
}`;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://alzhra-erp.vercel.app',
        'X-Title': 'Al Zhra Inbound AI',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `اسم العميل: ${params.customerName}\nالأرصدة الحالية: ${params.balanceSummary}\nرسالة العميل: "${params.messageText}"`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return parseAiJson(content);
  } catch (err) {
    console.error('[InboundAI] Error analyzing message:', err);
    return null;
  }
}

/** إرسال رسالة واتساب للعميل سواء عبر WASender أو UltraMsg */
async function sendWhatsAppReply(
  instanceUrl: string,
  apiKey: string,
  toPhone: string,
  text: string
): Promise<boolean> {
  try {
    const cleanUrl = instanceUrl.replace(/\/+$/, '');

    // 1. إذا كان المزود UltraMsg
    if (cleanUrl.includes('ultramsg.com')) {
      const endpoint = cleanUrl.endsWith('/messages/chat') ? cleanUrl : `${cleanUrl}/messages/chat`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: apiKey, to: toPhone, body: text }),
      });
      return res.ok;
    }

    // 2. إذا كان المزود Evolution API / Evolution Go
    if (cleanUrl.includes('evolution') || cleanUrl.includes('/message/sendText') || cleanUrl.includes(':8080')) {
      let endpoint = cleanUrl;
      if (!endpoint.includes('/message/sendText')) {
        const parts = cleanUrl.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && !lastPart.includes(':') && !lastPart.startsWith('http')) {
          const base = cleanUrl.substring(0, cleanUrl.lastIndexOf('/'));
          endpoint = `${base}/message/sendText/${lastPart}`;
        } else {
          endpoint = `${cleanUrl}/message/sendText/default`;
        }
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number: toPhone,
          text,
        }),
      });
      return res.ok;
    }

    // 3. إذا كان المزود WASender أو خادم API مخصص
    const endpoint = (cleanUrl.endsWith('/api/send-message') || cleanUrl.endsWith('/send-message'))
      ? cleanUrl
      : `${cleanUrl}/api/send-message`;

    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        phone: toPhone,
        to: toPhone,
        message: text,
        text,
      }),
    });

    if (res.ok) return true;

    // محاولة بديلة إذا كان المسار /send-message بدون /api
    if (endpoint.endsWith('/api/send-message')) {
      const fallbackEndpoint = `${cleanUrl}/send-message`;
      const fallbackRes = await fetch(fallbackEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ phone: toPhone, to: toPhone, message: text, text }),
      });
      return fallbackRes.ok;
    }

    return false;
  } catch (err) {
    console.error('[sendWhatsAppReply] Error sending reply:', err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // دعم فحص الـ Webhook بواسطة GET
  if (req.method === 'GET') {
    return json({ status: 'active', service: 'Al-Zahra WhatsApp Inbound Webhook (WASender & UltraMsg)' });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = extractInboundMessage(body);

    if (!parsed) {
      return json({ status: 'unrecognized_payload' });
    }

    // 1. تجاهل أي رسائل مرسلة من المحل نفسه لتفادي الحلقات التكرارية (Loop)
    if (parsed.fromMe) {
      return json({ status: 'ignored_outgoing' });
    }

    // 2. تجاهل رسائل المجموعات (التركيز على محادثات العملاء المباشرة)
    if (parsed.isGroup) {
      return json({ status: 'ignored_group_message' });
    }

    const { senderPhone, messageText } = parsed;

    if (!senderPhone || !messageText) {
      return json({ status: 'empty_payload' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Missing Supabase service configuration' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. البحث عن العميل في المنظومة بمطابقة آخر 9 أرقام من هاتفه
    const clean9 = senderPhone.slice(-9);
    const { data: matchedParties, error: partyError } = await supabaseAdmin
      .from('parties')
      .select('id, name, company_id, currency_code, phone')
      .is('deleted_at', null)
      .ilike('phone', `%${clean9}%`)
      .limit(1);

    if (partyError) {
      console.error('[InboundWebhook] Party query error:', partyError);
    }

    const party = matchedParties?.[0];

    // إذا لم يكن العميل مسجلاً
    if (!party) {
      console.log(`[InboundWebhook] Unregistered customer phone: ${senderPhone}`);
      return json({ status: 'unregistered_customer', phone: senderPhone });
    }

    // 4. قراءة أرصدة العميل المحدثة
    const { data: balances } = await supabaseAdmin.rpc('get_party_all_balances', {
      p_company_id: party.company_id,
      p_party_id: party.id,
    });

    let balanceText = 'لا توجد مديونية مسجلة';
    if (balances && Array.isArray(balances) && balances.length > 0) {
      balanceText = balances
        .map((b: { currency_code: string; balance: number }) => `${b.balance} ${b.currency_code}`)
        .join(' · ');
    }

    // 5. استدعاء الذكاء الاصطناعي لتحليل الرسالة
    const aiAnalysis = await analyzeCustomerMessageWithAI({
      customerName: party.name,
      messageText,
      balanceSummary: balanceText,
    });

    const summary = aiAnalysis?.summary || `رسالة واتساب: ${messageText}`;
    const intent = aiAnalysis?.intent || 'general_note';

    // 6. إذا كان الرد يتضمن وعداً بالسداد -> إدراجه في جدول وعود السداد تلقائياً
    if (intent === 'promise' && aiAnalysis?.promise_date) {
      await supabaseAdmin.from('debt_payment_promises').insert({
        company_id: party.company_id,
        party_id: party.id,
        amount: aiAnalysis.promise_amount || balances?.[0]?.balance || 0,
        currency_code: aiAnalysis.promise_currency || party.currency_code || 'YER',
        promise_date: aiAnalysis.promise_date,
        notes: `وعد مسجل آلياً عبر واتساب: "${messageText}" (${summary})`,
        status: 'pending',
      });
    }

    // 7. تدوين النشاط في الخط الزمني وسجل المتابعة (customer_activities)
    await supabaseAdmin.rpc('log_collection_activity', {
      p_company_id: party.company_id,
      p_party_id: party.id,
      p_activity_type: 'whatsapp',
      p_subject: intent === 'promise' ? 'وعد سداد مسجل آلياً (واتساب)' : 'رسالة واردة من العميل (واتساب)',
      p_notes: `نص العميل: "${messageText}"\nملخص الذكاء الاصطناعي: ${summary}`,
      p_next_action_date: aiAnalysis?.promise_date || null,
      p_priority: intent === 'promise' ? 'high' : 'medium',
    });

    // 8. الرد الآلي على العميل عبر WASender أو UltraMsg (إذا توفر رد ذكي ورابط البوابة)
    const { data: config } = await supabaseAdmin
      .from('messaging_config')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_enabled')
      .eq('company_id', party.company_id)
      .maybeSingle();

    const instanceUrl = config?.whatsapp_api_url || 'https://api.ultramsg.com/instance196299/';
    const apiKey = config?.whatsapp_api_key || 'mkojxebwykcncp10';

    if (aiAnalysis?.reply_to_customer && instanceUrl) {
      await sendWhatsAppReply(instanceUrl, apiKey, senderPhone, aiAnalysis.reply_to_customer);
    }

    return json({
      status: 'success',
      party_id: party.id,
      customer_name: party.name,
      intent,
      summary,
      promise_date: aiAnalysis?.promise_date ?? null,
    });
  } catch (error) {
    console.error('[InboundWebhook] Global exception:', error);
    return json({ error: (error as Error).message }, 500);
  }
});

