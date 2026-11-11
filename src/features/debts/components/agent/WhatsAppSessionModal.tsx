import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import {
  ultraMsgService,
  DEFAULT_ULTRAMSG_PHONE,
  type UltraMsgCredentials,
  type UltraMsgStatusResult,
  type UltraMsgMeResult,
} from '../../services/ultraMsgService';
import { useFeedbackStore } from '../../../feedback/store';
import { DebtsModalShell } from '../DebtsModalShell';

interface WhatsAppSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials?: UltraMsgCredentials | undefined;
  onConnected?: (() => void) | undefined;
}

export const WhatsAppSessionModal: React.FC<WhatsAppSessionModalProps> = ({
  isOpen,
  onClose,
  credentials,
  onConnected,
}) => {
  const { showToast } = useFeedbackStore();
  const [status, setStatus] = useState<UltraMsgStatusResult['status']>('loading');
  const [meInfo, setMeInfo] = useState<UltraMsgMeResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [qrTimestamp, setQrTimestamp] = useState<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const instanceId = ultraMsgService.extractInstanceId(credentials?.url);

  const checkConnection = useCallback(async (): Promise<void> => {
    setIsChecking(true);
    try {
      const statusRes = await ultraMsgService.getStatus(credentials);
      setStatus(statusRes.status);

      if (statusRes.status === 'authenticated') {
        const meRes = await ultraMsgService.getMe(credentials);
        if (meRes.ok) {
          setMeInfo(meRes);
        }
        if (onConnected) onConnected();
      } else {
        setMeInfo(null);
        setQrTimestamp(Date.now());
      }
    } catch {
      setStatus('disconnected');
    } finally {
      setIsChecking(false);
    }
  }, [credentials, onConnected]);

  // فحص الاتصال عند فتح النافذة ومؤقت دوري كل 12 ثانية لتفقد حالة الاقتران
  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    void checkConnection();

    timerRef.current = setInterval(() => {
      void checkConnection();
    }, 12000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, checkConnection]);

  if (!isOpen) return null;

  const handleRestart = async (): Promise<void> => {
    setIsRestarting(true);
    try {
      const res = await ultraMsgService.restartInstance(credentials);
      if (res.ok) {
        showToast('تم إرسال أمر إعادة تشغيل الجلسة بنجاح، جارٍ تحديث الحالة...', 'success');
        setTimeout(() => {
          void checkConnection();
        }, 3000);
      } else {
        showToast(`فشلت إعادة تشغيل الجلسة: ${res.error || 'خطأ غير معروف'}`, 'error');
      }
    } catch {
      showToast('تعذر الاتصال بالبوابة لإعادة التشغيل', 'error');
    } finally {
      setIsRestarting(false);
    }
  };

  const handleRefreshQr = (): void => {
    setQrTimestamp(Date.now());
    void checkConnection();
  };

  const qrImageUrl = `${ultraMsgService.getQrImageUrl(credentials)}&_r=${qrTimestamp}`;
  const isAuthenticated = status === 'authenticated';

  return (
    <DebtsModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="حالة بوابة واتساب وجلسة الاقتران"
      description={`معرّف الجلسة: ${instanceId} • فحص حي مباشر`}
    >
      <div className="space-y-4">
        {/* Status Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isAuthenticated
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isAuthenticated ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--app-text)]">
                  {isAuthenticated ? 'الجلسة متصلة ومقترنة بنجاح' : 'جلسة واتساب بحاجة لمسح رمز QR'}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isAuthenticated
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  {status === 'authenticated' && 'متصل ✓'}
                  {status === 'standby' && 'في وضع الاستعداد'}
                  {status === 'qr' && 'بانتظار المسح'}
                  {status === 'loading' && 'جارٍ الفحص...'}
                  {status === 'disconnected' && 'غير متصل'}
                </span>
              </div>
              <p className="text-[10px] text-[var(--app-text-muted)]">
                {isAuthenticated
                  ? `الرقم المتصل: ${meInfo?.phone || DEFAULT_ULTRAMSG_PHONE}`
                  : 'امسح الرمز أدناه من تطبيق واتساب لربط رقم المتجر وإرسال التذكيرات'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isChecking}
              onClick={() => void checkConnection()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
              title="فحص الاتصال الآن"
            >
              <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
              <span>فحص الآن</span>
            </button>

            <button
              type="button"
              disabled={isRestarting}
              onClick={() => void handleRestart()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
              title="إعادة تشغيل الجلسة في خادم UltraMsg إذا كانت معلقة"
            >
              <RotateCcw size={12} className={isRestarting ? 'animate-spin' : ''} />
              <span>إعادة تشغيل الجلسة</span>
            </button>
          </div>
        </div>

        {/* State Content */}
        {isAuthenticated ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <ShieldCheck size={26} />
            </div>
            <h4 className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
              بوابة UltraMsg تعمل بكفاءة تامة
            </h4>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              الرسائل المباشرة وتذكيرات الديون الآلية تصدر فوراً دون أي عوائق.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-[var(--app-surface)] px-3 py-1 font-mono text-xs text-[var(--app-text)]">
              <Smartphone size={13} className="text-emerald-600" />
              <span>{meInfo?.phone || DEFAULT_ULTRAMSG_PHONE}</span>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-hover)] p-4 text-center">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                <img
                  src={qrImageUrl}
                  alt="رمز QR لربط واتساب"
                  className="h-48 w-48 object-contain"
                  onError={() => {
                    // إذا فشل تحميل الصورة مباشرة
                  }}
                />
                {isChecking && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-xs">
                    <RefreshCw size={24} className="animate-spin text-blue-600" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRefreshQr}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
              >
                <RefreshCw size={12} />
                <span>تحديث الرمز</span>
              </button>
            </div>

            {/* Instruction Steps */}
            <div className="flex flex-col justify-between space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3.5">
              <div>
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]">
                  <QrCode size={14} className="text-blue-500" />
                  <span>خطوات ربط رقم هاتف المتجر:</span>
                </h4>
                <ol className="mt-2.5 space-y-2 text-xs leading-relaxed text-[var(--app-text-muted)]">
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      1
                    </span>
                    <span>افتح تطبيق واتساب على هاتف المنشأة أو المحل.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      2
                    </span>
                    <span>اضغط على النقاط الثلاث أو الإعدادات ⇦ <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      3
                    </span>
                    <span>اضغط <strong>ربط جهاز</strong> ووجّه كاميرا الهاتف نحو الرمز المقابل.</span>
                  </li>
                </ol>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
                💡 بمجرد اكتمال المسح من الهاتف، سيتصل النظام تلقائياً خلال ثوانٍ وتتحول الشارة إلى «متصل ✓».
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end border-t border-[var(--app-border)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-1.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </DebtsModalShell>
  );
};
