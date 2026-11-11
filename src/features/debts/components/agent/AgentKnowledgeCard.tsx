import React, { useState, useEffect } from 'react';
import { Landmark, Save, Copy, Check, Building2, Wallet } from 'lucide-react';
import type { DebtFollowupConfig, DebtFollowupConfigUpdate } from '../../types';

interface Props {
  config: DebtFollowupConfig | null | undefined;
  isSaving: boolean;
  onSave: (updates: DebtFollowupConfigUpdate) => void;
}

const DEFAULT_SIGNATURE_PLACEHOLDER = `حسابات التحويل المعتمدة:
• بنك الكريمي (حساب مميز): 300XXXXX - باسم: مؤسسة الجعفري
• بنك التضامن: 123XXXXX
• محفظة جوالي / كاش: 77XXXXXXX
يرجى إرسال إشعار التحويل بعد السداد لتحديث كشف الحساب فوراً.`;

export const AgentKnowledgeCard: React.FC<Props> = ({ config, isSaving, onSave }) => {
  const [signature, setSignature] = useState(config?.reminder_signature || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (config?.reminder_signature !== undefined) {
      setSignature(config.reminder_signature || '');
    }
  }, [config?.reminder_signature]);

  const handleSave = () => {
    onSave({ reminder_signature: signature.trim() });
  };

  const handleCopy = () => {
    if (!signature) return;
    navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertPreset = (presetText: string) => {
    setSignature(prev => (prev ? `${prev}\n${presetText}` : presetText));
  };

  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-xs md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-emerald-500" />
          <h3 className="text-sm font-extrabold text-[var(--app-text)]">
            بيانات الحسابات البنكية وتذييل الوكيل
          </h3>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save size={13} />
          <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ البيانات'}</span>
        </button>
      </div>

      <div className="mt-4 space-y-3.5">
        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--app-text-muted)]">إدراج سريع:</span>
          <button
            type="button"
            onClick={() => handleInsertPreset('• بنك الكريمي (حساب مميز): 300XXXXXX - باسم: مؤسسة الجعفري')}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-text)] hover:border-emerald-500/50 hover:bg-emerald-500/5"
          >
            <Building2 size={12} className="text-emerald-500" />
            <span>+ بنك الكريمي</span>
          </button>
          <button
            type="button"
            onClick={() => handleInsertPreset('• بنك التضامن: رقم الحساب (123XXXXXX) - باسم: مؤسسة الجعفري')}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-text)] hover:border-blue-500/50 hover:bg-blue-500/5"
          >
            <Building2 size={12} className="text-blue-500" />
            <span>+ بنك التضامن</span>
          </button>
          <button
            type="button"
            onClick={() => handleInsertPreset('• محفظة جوالي / كاش: رقم (77XXXXXXX)')}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-text)] hover:border-amber-500/50 hover:bg-amber-500/5"
          >
            <Wallet size={12} className="text-amber-500" />
            <span>+ محفظة إلكترونية</span>
          </button>
        </div>

        {/* Text Area */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--app-text)]">
              نص التذييل وحسابات السداد المعتمدة
            </label>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
            </button>
          </div>
          <textarea
            value={signature}
            onChange={e => setSignature(e.target.value)}
            rows={5}
            dir="rtl"
            placeholder={DEFAULT_SIGNATURE_PLACEHOLDER}
            className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 font-mono text-xs text-[var(--app-text)] outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Live Preview */}
        {signature.trim() && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              معاينة تذييل الرسالة في واتساب:
            </div>
            <div className="whitespace-pre-line rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 font-mono text-[11px] text-[var(--app-text)]">
              {signature}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
