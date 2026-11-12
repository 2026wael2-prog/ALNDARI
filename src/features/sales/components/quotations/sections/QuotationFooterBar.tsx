import type { FC, ReactElement } from 'react';
import {
  ArrowRightLeft,
  CheckCircle,
  Copy,
  FileText,
  Loader2,
  Send,
  Share2,
  XCircle,
} from 'lucide-react';
import type { QuotationDetailRow } from '@/features/sales/api/quotationsApi';
import type { ShareResult } from '../hooks/useQuotationShare';

export interface StatusAction {
  label: string;
  icon: ReactElement;
  color: string;
  nextStatus: string;
}

export const statusActions = (status: string): StatusAction[] => {
  switch (status) {
    case 'draft':
      return [
        {
          label: 'إرسال للعميل',
          icon: <Send size={14} />,
          color: 'bg-blue-600 hover:bg-blue-700',
          nextStatus: 'sent',
        },
      ];
    case 'sent':
      return [
        {
          label: 'قبول',
          icon: <CheckCircle size={14} />,
          color: 'bg-emerald-600 hover:bg-emerald-700',
          nextStatus: 'accepted',
        },
        {
          label: 'رفض',
          icon: <XCircle size={14} />,
          color: 'bg-rose-600 hover:bg-rose-700',
          nextStatus: 'rejected',
        },
      ];
    case 'accepted':
      return [
        {
          label: 'تحويل لفاتورة',
          icon: <ArrowRightLeft size={14} />,
          color: 'bg-indigo-600 hover:bg-indigo-700',
          nextStatus: 'converted',
        },
      ];
    default:
      return [];
  }
};

const FooterButton = ({
  label,
  icon,
  onClick,
  tone,
}: {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  tone: string;
}): ReactElement => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 ${tone}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface ShareButtonsProps {
  onWhatsApp: () => void;
  onTelegram: () => void;
  onCopy: () => void;
  onExcel: () => void;
}

const ShareButtons: FC<ShareButtonsProps> = ({
  onWhatsApp,
  onTelegram,
  onCopy,
  onExcel,
}) => (
  <>
    <FooterButton
      label="واتساب"
      icon={<Share2 size={14} />}
      onClick={onWhatsApp}
      tone="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/30 dark:bg-emerald-900/20 dark:text-emerald-400"
    />
    <FooterButton
      label="تيليجرام"
      icon={<Send size={14} />}
      onClick={onTelegram}
      tone="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800/30 dark:bg-sky-900/20 dark:text-sky-400"
    />
    <FooterButton
      label="نسخ النص"
      icon={<Copy size={14} />}
      onClick={onCopy}
      tone="border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-gray-400 dark:hover:bg-slate-800"
    />
    <FooterButton
      label="إكسل"
      icon={<FileText size={14} />}
      onClick={onExcel}
      tone="border-emerald-100 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800/20 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
    />
  </>
);

export interface QuotationFooterBarProps {
  quotation: QuotationDetailRow | null;
  busy: boolean;
  share: ShareResult;
  onClose: () => void;
  run: (nextStatus: string) => void;
}

export const QuotationFooterBar: FC<QuotationFooterBarProps> = ({
  quotation,
  busy,
  share,
  onClose,
  run,
}) => {
  const actions =
    quotation !== null && quotation.type === 'purchase'
      ? []
      : statusActions(quotation?.status ?? '');

  return (
    <div className="no-print flex w-full flex-wrap items-center justify-between gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 sm:px-4 sm:py-2 sm:text-sm"
      >
        إغلاق
      </button>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <ShareButtons
          onWhatsApp={share.shareWhatsApp}
          onTelegram={share.shareTelegram}
          onCopy={share.copyText}
          onExcel={share.exportExcel}
        />
        {actions.map(action => (
          <button
            key={action.nextStatus}
            type="button"
            onClick={() => {
              run(action.nextStatus);
            }}
            disabled={busy}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm ${action.color}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
