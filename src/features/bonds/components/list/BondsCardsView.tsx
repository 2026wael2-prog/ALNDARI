import React from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Eye,
  FileText,
  MessageCircle,
  Printer,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import type { Bond } from '../../types';
import { cn, formatCurrency } from '../../../../core/utils';

interface BondsCardsViewProps {
  bonds: Bond[];
  onPreviewBond?: ((bond: Bond) => void) | undefined;
  onWhatsAppShare: (bond: Bond) => void;
  onExport: (bond: Bond) => void;
  onDelete: (id: string, number: string) => void;
}

export const BondsCardsView: React.FC<BondsCardsViewProps> = ({
  bonds,
  onPreviewBond,
  onWhatsAppShare,
  onExport,
  onDelete,
}) => (
  <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 gap-4 duration-500 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {bonds.map(bond => (
      <div
        key={bond.id}
        onClick={() => onPreviewBond?.(bond)}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-[var(--app-surface)] p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:hover:border-blue-900/30"
      >
        <div
          className={cn(
            'absolute right-0 top-0 -mr-8 -mt-8 h-24 w-24 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-20',
            bond.type === 'receipt' ? 'bg-emerald-500' : 'bg-rose-500'
          )}
        />

        <div className="relative mb-4 flex items-start justify-between">
          <div
            className={cn(
              'rounded-xl border p-2 transition-colors',
              bond.type === 'receipt'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-900/20'
                : 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-800/40 dark:bg-rose-900/20'
            )}
          >
            {bond.type === 'receipt' ? (
              <ArrowDownCircle size={20} />
            ) : (
              <ArrowUpCircle size={20} />
            )}
          </div>
          <div className="text-left font-mono">
            <span className="mb-1 block text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500">
              المبلغ
            </span>
            <span
              className={cn(
                'text-lg font-black tracking-tighter',
                bond.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {bond.type === 'receipt' ? '+' : '-'}
              {formatCurrency(bond.amount, bond.currency_code)}
            </span>
          </div>
        </div>

        <div className="relative space-y-3">
          <div>
            <span className="mb-1 flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500">
              <FileText size={10} /> {bond.payment_number}
            </span>
            <h4 className="line-clamp-1 text-xs font-bold text-gray-800 dark:text-slate-100">
              {bond.description || 'بدون بيان'}
            </h4>
          </div>

          <div className="flex items-center gap-2 border-y border-gray-50 py-2 dark:border-slate-800/50">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <User size={12} />
            </div>
            <span className="truncate text-xs font-bold text-gray-600 dark:text-slate-400">
              {bond.party_name || bond.account_name}
            </span>
          </div>

          <div
            className="flex items-center justify-between pt-1"
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-gray-400 dark:text-slate-500">
                <Calendar size={10} />
                {bond.date}
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-blue-500">
                <Wallet size={10} />
                {bond.payment_method === 'cash'
                  ? 'نقداً'
                  : bond.payment_method === 'bank'
                    ? 'بنك'
                    : bond.payment_method || 'نقداً'}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-80 transition-all group-hover:opacity-100">
              {onPreviewBond && (
                <button
                  onClick={() => {
                    onPreviewBond(bond);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
                  title="معاينة السند"
                >
                  <Eye size={14} />
                </button>
              )}
              <button
                onClick={() => onWhatsAppShare(bond)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/20"
                title="واتساب"
              >
                <MessageCircle size={14} />
              </button>
              <button
                onClick={() => onExport(bond)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-500 dark:hover:bg-indigo-900/20"
                title="تصدير إكسل / طباعة"
              >
                <Printer size={14} />
              </button>
              <button
                onClick={() => {
                  onDelete(bond.id, bond.payment_number);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20"
                title="حذف"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);
