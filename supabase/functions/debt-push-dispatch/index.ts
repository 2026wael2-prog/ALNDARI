import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ============================================================
// debt-push-dispatch — Al-Zahra Smart ERP
// ============================================================
// يرسل تنبيهات Web Push لاشتراكات المتصفح المسجّلة في push_subscriptions،
// فيصل التنبيه والتطبيق مغلق. يعتمد على VAPID + Service Worker (public/sw.js).
//
// يستدعيه: pg_cron (service_role) أو يدوياً بمفتاح cron.
// لا يستقبل JWT مستخدم: الإرسال جماعي على مستوى المنشأة، والتحقق من هوية
// المستدعي يتم بمفتاح service_role أو DEBT_PUSH_CRON_SECRET.
//
// الأسرار المطلوبة (supabase secrets set):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...),
//   DEBT_PUSH_CRON_SECRET
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

interface PushSubscriptionRow {
  id: string;
  company_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface CompanySignal {
  criticalCount: number;
  brokenPromises: number;
  dueToday: number;
  maxDaysLate: number;
}

const isServiceCaller = (authHeader: string, cronSecret: string): boolean => {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (cronSecret !== '' && token === cronSecret) return true;
  const envKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (envKey !== '' && token === envKey) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
    };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
};

/** تاريخ اليوم بتوقيت UTC بصيغة ISO (تاريخ فقط). */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

const daysBetween = (isoDate: string, today: string): number => {
  const from = Date.parse(`${isoDate}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(Math.floor((to - from) / 86_400_000), 0);
};

type DbClient = ReturnType<typeof createClient>;

/**
 * إشارات التحصيل لمنشأة واحدة — أعداد فقط.
 * لا نجمع مبالغ هنا: الفواتير بعملات مختلفة (YER/SAR) وجمعها بلا تحويل
 * يُنتج رقماً مضلِلاً في نص التنبيه، وهو نفس الخطأ الذي مُنع في التقارير.
 */
async function computeSignal(
  admin: DbClient,
  companyId: string,
  today: string
): Promise<CompanySignal> {
  const { data: config } = await admin
    .from('debt_followup_config')
    .select('critical_days')
    .eq('company_id', companyId)
    .maybeSingle();
  const criticalDays =
    Number((config as { critical_days?: number } | null)?.critical_days ?? 30) || 30;

  const { data: overdue } = await admin
    .from('invoices')
    .select('due_date')
    .eq('company_id', companyId)
    .eq('type', 'sale')
    .in('status', ['posted', 'confirmed', 'partially_paid'])
    .is('deleted_at', null)
    .lt('due_date', today);

  const overdueRows = (overdue ?? []) as Array<{ due_date: string | null }>;
  let criticalCount = 0;
  let maxDaysLate = 0;
  for (const row of overdueRows) {
    if (row.due_date === null) continue;
    const late = daysBetween(row.due_date, today);
    if (late > maxDaysLate) maxDaysLate = late;
    if (late >= criticalDays) criticalCount += 1;
  }

  const { count: dueToday } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('type', 'sale')
    .in('status', ['posted', 'confirmed', 'partially_paid'])
    .is('deleted_at', null)
    .eq('due_date', today);

  const { count: brokenPromises } = await admin
    .from('debt_payment_promises')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .lt('promise_date', today);

  return {
    criticalCount,
    brokenPromises: Number(brokenPromises ?? 0),
    dueToday: Number(dueToday ?? 0),
    maxDaysLate,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const cronSecret = Deno.env.get('DEBT_PUSH_CRON_SECRET') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  const headerSecret = req.headers.get('x-cron-secret') ?? '';
  const authorized =
    isServiceCaller(authHeader, cronSecret) || (cronSecret !== '' && headerSecret === cronSecret);
  if (!authorized) return json({ error: 'unauthorized' }, 401);

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const subject = Deno.env.get('VAPID_SUBJECT') ?? '';
  if (publicKey === '' || privateKey === '' || subject === '') {
    return json({ error: 'vapid_not_configured' }, 503);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const { data: subsData, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, company_id, user_id, endpoint, p256dh, auth')
    .is('revoked_at', null);

  if (subsError) {
    return json({ error: 'subscriptions_unreadable', detail: subsError.message }, 500);
  }

  const subscriptions = (subsData ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return json({ ok: true, sent: 0, note: 'no_subscriptions' });
  }

  const today = todayIso();
  const byCompany = new Map<string, PushSubscriptionRow[]>();
  for (const subscription of subscriptions) {
    const list = byCompany.get(subscription.company_id) ?? [];
    list.push(subscription);
    byCompany.set(subscription.company_id, list);
  }

  let sent = 0;
  let revoked = 0;
  let skipped = 0;
  const deliveredIds: string[] = [];
  const failures: Array<{ company_id: string; status: number; error: string }> = [];

  for (const [companyId, companySubs] of byCompany) {
    const signal = await computeSignal(admin, companyId, today);
    const hasSignal =
      signal.criticalCount > 0 || signal.brokenPromises > 0 || signal.dueToday > 0;
    if (!hasSignal) {
      skipped += companySubs.length;
      continue;
    }

    const parts: string[] = [];
    if (signal.criticalCount > 0) parts.push(`${signal.criticalCount} عميل متأخر حرج`);
    if (signal.brokenPromises > 0) parts.push(`${signal.brokenPromises} وعد سداد مخلَف`);
    if (signal.dueToday > 0) parts.push(`${signal.dueToday} فاتورة مستحقة اليوم`);
    if (signal.maxDaysLate > 0) parts.push(`أقصى تأخير ${signal.maxDaysLate} يوماً`);

    const payload = JSON.stringify({
      title: 'الجعفري ERP — تحصيل اليوم',
      body: `${parts.join(' • ')}. ابدأ من طابور الأولوية.`,
      link: '/debts',
      // وسم يومي: تنبيه جديد كل يوم، وتكرار اليوم نفسه يُستبدل لا يتكدّس.
      tag: `debt-daily-${companyId}-${today}`,
      requireInteraction: signal.criticalCount > 0 || signal.brokenPromises > 0,
    });

    for (const subscription of companySubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 3600, urgency: 'high' }
        );
        sent += 1;
        deliveredIds.push(subscription.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 0;
        // 404/410 = اشتراك ميت (أُلغي من المتصفح أو انتهت صلاحيته) ⇒ إبطال لا حذف،
        // فنُبقي أثراً تشغيلياً بدل أن نفقد السجل.
        if (status === 404 || status === 410) {
          await admin
            .from('push_subscriptions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', subscription.id);
          revoked += 1;
        } else {
          failures.push({
            company_id: companyId,
            status,
            error: err instanceof Error ? err.message : 'unknown_error',
          });
        }
      }
    }
  }

  if (deliveredIds.length > 0) {
    await admin
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', deliveredIds);
  }

  return json({
    ok: true,
    sent,
    revoked,
    skipped,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
});
