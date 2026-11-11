import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  QrCode,
  Copy,
  Bot,
  Zap,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import Card from '@/ui/base/Card';
import type { MessagingConfig } from '@/features/notifications/messagingApi';
import { messagingApi } from '@/features/notifications/messagingApi';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { WhatsAppSessionModal } from '@/features/debts/components/agent/WhatsAppSessionModal';

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface Props {
  config: MessagingConfig;
  onUpdate: (updates: Partial<MessagingConfig>) => void;
}

const WhatsAppCard: React.FC<Props> = ({ config, onUpdate }) => {
  const [isTesting, setIsTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedChatwootUrl, setCopiedChatwootUrl] = useState(false);
  const companyId = useAuthStore(s => s.user?.company_id);
  const { showToast } = useFeedbackStore();

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://alzhra-smart.vercel.app'}/functions/v1/whatsapp-inbound-webhook`;
  const chatwootWidgetUrl = `${window.location.origin}/#/chatwoot-widget`;

  const handleCopyWebhook = () => {
    void navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    showToast('تم نسخ رابط الـ Webhook للرد الآلي بنجاح 📋', 'success');
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const handleCopyChatwootUrl = () => {
    void navigator.clipboard.writeText(chatwootWidgetUrl);
    setCopiedChatwootUrl(true);
    showToast('تم نسخ رابط ودجت شات ووت بنجاح 📋', 'success');
    setTimeout(() => setCopiedChatwootUrl(false), 2500);
  };

  // فحص إذا كان المفتاح يحتوي على رقم هاتف ملتصق بالمفتاح (مثل 779816860mkojxebwykcncp10)
  const tokenMatch = (config.whatsapp_api_key || '').match(/^(\d{9,12})([a-zA-Z0-9]{10,})$/);

  const handleSeparateTokenAndPhone = () => {
    if (!tokenMatch) return;
    const phonePart = tokenMatch[1];
    const keyPart = tokenMatch[2];
    onUpdate({
      whatsapp_api_key: keyPart,
      whatsapp_phone: config.whatsapp_phone ? config.whatsapp_phone : phonePart,
    });
    showToast('تم فصل المفتاح عن رقم الهاتف بنجاح ✅', 'success');
  };

  const handleApplyPresetEvolution = () => {
    onUpdate({
      whatsapp_enabled: true,
      whatsapp_api_url: 'http://localhost:8080/message/sendText/alzhra',
      whatsapp_api_key: '',
    });
    showToast('تم ضبط إعدادات خادم Evolution API الافتراضية بنجاح ⚡', 'success');
  };

  const handleApplyPresetUltraMsg = () => {
    onUpdate({
      whatsapp_enabled: true,
      whatsapp_api_url: 'https://api.ultramsg.com/instance196299/',
      whatsapp_api_key: 'mkojxebwykcncp10',
      whatsapp_phone: '967771147694',
    });
    showToast('تم ضبط إعدادات بوابة UltraMsg الخاصة بالمؤسسة بنجاح ✅', 'success');
  };

  const handleApplyPresetWasender = () => {
    onUpdate({
      whatsapp_enabled: true,
      whatsapp_api_url: 'http://localhost:3000/api/send-message',
      whatsapp_api_key: '',
    });
    showToast('تم ضبط إعدادات بوابة WASender الافتراضية بنجاح ✅', 'success');
  };

  const handleTest = async () => {
    if (!config.whatsapp_api_url || !config.whatsapp_api_key || !config.whatsapp_phone) {
      showToast('يرجى ملء جميع حقول WhatsApp (الرابط، المفتاح، ورقم الهاتف) أولاً', 'error');
      return;
    }

    if (!companyId) return;

    try {
      setIsTesting(true);
      const res = await messagingApi.sendNotification(
        companyId,
        'test_connection',
        'اختبار اتصال Al-Jaafari Smart ERP مع WhatsApp ناجح! 🚀'
      );

      if (res.success) {
        showToast('تم إرسال رسالة الاختبار بنجاح إلى WhatsApp!', 'success');
      } else {
        showToast('فشل اختبار الاتصال، تأكد من صحة المفاتيح والرابط', 'error');
      }
    } catch {
      showToast('حدث خطأ أثناء اختبار الاتصال', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="overflow-hidden border border-[var(--app-border)]">
      <div className="border-b border-gray-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[#25D366]">
              <WhatsAppIcon />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">WhatsApp</h3>
              <p className="text-xs text-slate-500">إرسال الإشعارات والرد الآلي الذكي عبر واتساب (Evolution API / WASender / UltraMsg)</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApplyPresetEvolution}
              className="flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
              title="تعبئة إعدادات خادم Evolution API / Evolution Go تلقائياً"
            >
              <Zap size={12} />
              <span>تعبئة Evolution API</span>
            </button>
            <button
              type="button"
              onClick={handleApplyPresetWasender}
              className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
              title="تعبئة إعدادات بوابة WASender (محلي أو خادم) تلقائياً"
            >
              <Bot size={12} />
              <span>تعبئة WASender</span>
            </button>
            <button
              type="button"
              onClick={handleApplyPresetUltraMsg}
              className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
              title="تعبئة بيانات بوابة UltraMsg الخاصة بمؤسسة الجعفري تلقائياً"
            >
              <Sparkles size={12} />
              <span>تعبئة UltraMsg</span>
            </button>
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                config.whatsapp_enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {config.whatsapp_enabled ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>مفعل</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" />
                  <span>معطل</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={config.whatsapp_enabled}
            onChange={e => {
              onUpdate({ whatsapp_enabled: e.target.checked });
            }}
            className="h-5 w-5 cursor-pointer rounded-lg text-green-600 focus:ring-green-500"
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
            تفعيل إشعارات وتذكيرات واتساب
          </span>
        </label>

        {tokenMatch && (
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>
              ⚠️ تم رصد رقم هاتف مدمج بالخطأ مع المفتاح ({tokenMatch[1]} + {tokenMatch[2]})
            </span>
            <button
              type="button"
              onClick={handleSeparateTokenAndPhone}
              className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
            >
              <Check size={12} />
              فصلهما وتصحيح الحقول تلقائياً
            </button>
          </div>
        )}

        {config.whatsapp_enabled && (
          <div className="animate-in fade-in mr-8 space-y-4 duration-300">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">
                  رابط API البوابة
                </label>
                <input
                  type="text"
                  value={config.whatsapp_api_url}
                  onChange={e => {
                    onUpdate({ whatsapp_api_url: e.target.value.trim() });
                  }}
                  placeholder="https://api.ultramsg.com/instance196299/"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  dir="ltr"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300">
                    API Key / Token
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  >
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showToken ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={config.whatsapp_api_key}
                    onChange={e => {
                      onUpdate({ whatsapp_api_key: e.target.value.trim() });
                    }}
                    placeholder="mkojxebwykcncp10"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">
                  رقم الهاتف المتصل بالبوابة (لإرسال الاختبار)
                </label>
                <input
                  type="text"
                  value={config.whatsapp_phone}
                  onChange={e => {
                    onUpdate({ whatsapp_phone: e.target.value.trim() });
                  }}
                  placeholder="967771147694"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm text-slate-800 focus:border-transparent focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  dir="ltr"
                />
              </div>
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTest}
                className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-green-700 disabled:opacity-60"
              >
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>اختبار الإرسال</span>
              </button>

              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                title="فحص الجلسة الحية ومسح رمز الاستجابة السريعة QR للاتصال"
              >
                <QrCode size={14} />
                <span>فحص الجلسة ومسح QR</span>
              </button>
            </div>

            {/* بطاقة رابط الـ Webhook للرد الآلي (Evolution API & WASender) */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg bg-indigo-100 p-1.5 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      رابط الـ Webhook للرد الآلي (Evolution API & WASender & Inbound AI)
                    </h4>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      انسخ هذا الرابط وضعه في إعدادات Webhook داخل خادم Evolution API أو WASender لتمكين المنظومة من قراءة رسائل العملاء، والرد الذكي عليها، وتوثيق وعود السداد تلقائياً.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                >
                  {copiedWebhook ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{copiedWebhook ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-indigo-200/70 bg-white/80 px-3 py-2 font-mono text-xs text-slate-700 select-all dark:border-indigo-900/50 dark:bg-slate-900/80 dark:text-indigo-200" dir="ltr">
                {webhookUrl}
              </div>
            </div>

            {/* بطاقة ودجت شريط Chatwoot الجانبي (Dashboard App) */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      ودجت خدمة العملاء داخل Chatwoot (Dashboard App)
                    </h4>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      أضف هذا الرابط كتطبيق جانبي (Dashboard App) داخل منصة Chatwoot ليرى موظفو المبيعات والدعم رصيد العميل الحالي، وآخر فواتيره، ووعود سداده مباشرة أثناء المحادثة.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="#/chatwoot-widget"
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    title="معاينة مظهر الودجت في تبويب مستقل"
                  >
                    <span>معاينة</span>
                    <ExternalLink size={12} />
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyChatwootUrl}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                  >
                    {copiedChatwootUrl ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{copiedChatwootUrl ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200/70 bg-white/80 px-3 py-2 font-mono text-xs text-slate-700 select-all dark:border-emerald-900/50 dark:bg-slate-900/80 dark:text-emerald-200" dir="ltr">
                {chatwootWidgetUrl}
              </div>
            </div>
          </div>
        )}
      </div>

      <WhatsAppSessionModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        credentials={{
          url: config.whatsapp_api_url,
          token: config.whatsapp_api_key,
        }}
      />
    </Card>
  );
};

export default WhatsAppCard;
