import { useMemo } from 'react';
import { Edit, Trash2, History, Globe, MessageCircle, FileText, AlertTriangle } from 'lucide-react';
import type { Party, PartyCurrencyFilter, PartyType } from '../types';
import type { Column } from '../../../ui/common/ExcelTable';
import Avatar from '../../../ui/base/Avatar';
import { formatCurrency, cn } from '../../../core/utils';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { buildWhatsAppLink, hasValidWhatsAppPhone } from '../../debts/lib/whatsapp';
import { EntityInfoDot } from '../../entity-inspector';
import {
  classifyPartyBalance,
  getPartyActiveCurrencies,
  getPartyCurrencyBalance,
  hasMultipleActiveCurrencies,
  PARTY_BALANCE_EPSILON,
} from '../services/partyStatementService';

interface UsePartiesColumnsProps {
  partyType: PartyType;
  currencyFilter?: PartyCurrencyFilter;
  onEdit: (party: Party) => void;
  onDelete: (partyId: string) => void;
  onOpenTimeline: (party: Party) => void;
  onOpenPortal: (party: Party) => void;
  onViewStatement?: (party: Party, currencyCode?: string) => void;
}

const renderCurrencyBalanceCell = (params: {
  row: Party;
  currency: 'SAR' | 'YER';
  onViewStatement?: ((party: Party, currencyCode?: string) => void) | undefined;
  isHighlighted: boolean;
}) => {
  const { row, currency, onViewStatement, isHighlighted } = params;
  const val = getPartyCurrencyBalance(row, currency);

  if (Math.abs(val) <= PARTY_BALANCE_EPSILON) {
    return <span className="font-mono text-xs text-slate-300 dark:text-slate-600">—</span>;
  }

  const isDebit = val > 0;
  const dirLabel = isDebit ? 'عليه' : 'له';

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-bold tracking-tighter transition-all',
        isDebit
          ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-400',
        isHighlighted && 'ring-1 ring-blue-400/60',
        onViewStatement && 'cursor-pointer hover:brightness-95'
      )}
    >
      <span dir="ltr">{formatCurrency(Math.abs(val), currency)}</span>
      <span className="font-sans text-[9px] font-black opacity-80">{dirLabel}</span>
    </span>
  );

  if (!onViewStatement) return content;

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onViewStatement(row, currency);
      }}
      title={`عرض كشف حساب ${row.name} بعملة ${currency}`}
    >
      {content}
    </button>
  );
};

/* eslint-disable max-lines-per-function */
export function usePartiesColumns({
  partyType,
  currencyFilter = 'ALL',
  onEdit,
  onDelete,
  onOpenTimeline,
  onOpenPortal,
  onViewStatement,
}: UsePartiesColumnsProps): Array<Column<Party>> {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        header: t('name'),
        accessor: (row: Party) => {
          const isMulti = hasMultipleActiveCurrencies(row);
          const isOppositeSign = classifyPartyBalance(row) === 'mixed_currency';
          return (
            <div className="flex items-center gap-3">
              <Avatar name={row.name} size="sm" />
              <div className="flex translate-y-[1px] flex-col items-start">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold leading-tight text-gray-900 dark:text-white">
                    {row.name}
                  </span>
                  <EntityInfoDot type="party" id={row.id} label={row.name} subType={partyType} />
                  {isOppositeSign ? (
                    <span
                      title="رصيد مدين بعملة ودائن بعملة أخرى — يتم الفصل بين العملتين بدقة"
                      className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      <AlertTriangle size={9} />
                      متعاكس العملات
                    </span>
                  ) : isMulti ? (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      SAR + YER
                    </span>
                  ) : null}
                </div>
                {row.email && (
                  <span className="text-[10px] font-medium text-gray-400">{row.email}</span>
                )}
              </div>
            </div>
          );
        },
        accessorKey: 'name',
        sortKey: 'name',
        align: 'right',
      },
      {
        header: t('phone'),
        accessor: (row: Party) => (
          <span dir="ltr" className="font-mono text-xs text-slate-500">
            {row.phone || '---'}
          </span>
        ),
        accessorKey: 'phone',
        width: '130px',
        align: 'center',
      },
      {
        header: t('category'),
        accessor: (row: Party) => (
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {row.category || t('general')}
          </span>
        ),
        accessorKey: 'category',
        width: '95px',
        align: 'center',
      },
      {
        header: 'رصيد (ر.س SAR)',
        accessor: (row: Party) =>
          renderCurrencyBalanceCell({
            row,
            currency: 'SAR',
            onViewStatement,
            isHighlighted: currencyFilter === 'SAR',
          }),
        accessorKey: 'sar_balance',
        sortKey: 'sar_balance',
        width: '145px',
        align: 'center',
      },
      {
        header: 'رصيد (ر.ي YER)',
        accessor: (row: Party) =>
          renderCurrencyBalanceCell({
            row,
            currency: 'YER',
            onViewStatement,
            isHighlighted: currencyFilter === 'YER',
          }),
        accessorKey: 'yer_balance',
        sortKey: 'yer_balance',
        width: '155px',
        align: 'center',
      },
      {
        header: t('status'),
        accessor: (row: Party) => (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              row.status === 'active'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30'
            )}
          >
            {row.status === 'active' ? t('active') : t('blocked')}
          </span>
        ),
        accessorKey: 'status',
        width: '75px',
        align: 'center',
      },
      {
        header: t('actions'),
        accessor: (row: Party) => (
          <div className="flex items-center justify-center gap-1">
            {hasValidWhatsAppPhone(row.phone) && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const activeCurrencies = getPartyActiveCurrencies(row);
                  const debtParts = activeCurrencies
                    .filter(c => c.balance > PARTY_BALANCE_EPSILON)
                    .map(c => formatCurrency(c.balance, c.currency));
                  const msg =
                    partyType === 'customer'
                      ? debtParts.length > 0
                        ? `مرحباً ${row.name}، نود تذكيركم برصيد حسابكم الحالي: ${debtParts.join(' و ')}.`
                        : `مرحباً ${row.name}، نأمل أن تكونوا بخير.`
                      : `مرحباً ${row.name}، بخصوص حسابات التوريد والمشتريات.`;
                  window.open(buildWhatsAppLink(row.phone!, msg), '_blank', 'noopener,noreferrer');
                }}
                className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                title="مراسلة عبر واتساب (بأرصدة كل عملة على حدة)"
              >
                <MessageCircle size={14} />
              </button>
            )}
            {onViewStatement && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const targetCurr =
                    currencyFilter === 'SAR' || currencyFilter === 'YER'
                      ? currencyFilter
                      : undefined;
                  onViewStatement(row, targetCurr);
                }}
                className="rounded-lg p-1.5 text-sky-600 transition-colors hover:bg-sky-50 dark:hover:bg-sky-900/20"
                title="عرض كشف الحساب"
              >
                <FileText size={14} />
              </button>
            )}
            {partyType === 'supplier' && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenPortal(row);
                }}
                className="rounded-lg p-1.5 text-teal-600 transition-colors hover:bg-teal-50 dark:hover:bg-teal-900/20"
                title="رابط بوابة المورد"
              >
                <Globe size={14} />
              </button>
            )}
            {partyType === 'customer' && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenTimeline(row);
                }}
                className="rounded-lg p-1.5 text-purple-600 transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/20"
                title="تاريخ العميل"
              >
                <History size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onEdit(row);
              }}
              className="rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title={t('edit')}
            >
              <Edit size={14} />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (window.confirm(t('confirm_delete'))) onDelete(row.id);
              }}
              className="rounded-lg p-1.5 text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20"
              title={t('delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
        width: '150px',
        align: 'center',
      },
    ],
    [t, partyType, currencyFilter, onEdit, onDelete, onOpenTimeline, onOpenPortal, onViewStatement]
  );
}
/* eslint-enable max-lines-per-function */

export default usePartiesColumns;
