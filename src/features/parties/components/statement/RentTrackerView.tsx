/* eslint-disable complexity, max-lines-per-function */
/**
 * RentTrackerView – متابعة الإيجار الشهري
 * يُنظّم حركات كشف الحساب لصاحب الإيجار بحيث يظهر لكل شهر:
 *  - استحقاق الإيجار (SAR + YER)
 *  - المدفوعات النقدية (سند صرف)
 *  - خصم المبيعات/المقاصة (قطع مباعة أو تسوية)
 *  - الرصيد المتبقي مع حالة واضحة
 */
import React, { useMemo } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Banknote,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import type { StatementMovement } from '../../service';

// ─── أسماء الأشهر بالعربية ───────────────────────────────────────────────────
const ARABIC_MONTHS: Record<string, string> = {
  '01': 'يناير',  '02': 'فبراير', '03': 'مارس',    '04': 'أبريل',
  '05': 'مايو',   '06': 'يونيو',  '07': 'يوليو',   '08': 'أغسطس',
  '09': 'سبتمبر', '10': 'أكتوبر', '11': 'نوفمبر',  '12': 'ديسمبر',
};

// ─── نموذج بيانات الشهر ──────────────────────────────────────────────────────
interface RentMonth {
  key: string;           // '2026-10'
  label: string;         // 'أكتوبر 2026'
  accrualSAR: number;
  accrualYER: number;
  paidSAR: number;
  paidYER: number;
  settlementSAR: number;
  settlementYER: number;
  remainingSAR: number;
  remainingYER: number;
  transactions: StatementMovement[];
}

// ─── تصنيف الحركة ────────────────────────────────────────────────────────────
type MoveType = 'accrual' | 'payment' | 'settlement' | 'sale' | 'other';

function classifyMovement(m: StatementMovement): MoveType {
  const desc = (m.desc ?? '').toLowerCase();
  const op   = (m.operation_type ?? '').toLowerCase();
  if (desc.includes('استحقاق إيجار')) return 'accrual';
  if (desc.includes('تسوية') || desc.includes('مقاصة') || desc.includes('سحبيات')) return 'settlement';
  if (desc.includes('سند صرف') || op.includes('payment') || op.includes('صرف'))    return 'payment';
  if (desc.includes('فاتورة مبيعات') || op.includes('sale'))                        return 'sale';
  return 'other';
}

// ─── استخراج مفتاح الشهر من الوصف ───────────────────────────────────────────
const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03',    april: '04',
  may: '05',     june: '06',     july: '07',      august: '08',
  september: '09', october: '10', november: '11', december: '12',
  يناير: '01', فبراير: '02', مارس: '03',  أبريل: '04',
  مايو: '05',  يونيو: '06',  يوليو: '07', أغسطس: '08',
  سبتمبر: '09', أكتوبر: '10', نوفمبر: '11', ديسمبر: '12',
};

function extractMonthKey(desc: string, date: string): string {
  const lower = desc.toLowerCase();
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (lower.includes(name)) {
      const yearMatch = desc.match(/20\d\d/);
      const year = yearMatch ? yearMatch[0] : date.slice(0, 4);
      return `${year}-${num}`;
    }
  }
  return date.slice(0, 7);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface RentTrackerViewProps {
  movements: StatementMovement[];
}

// ─── المكوّن الرئيسي ──────────────────────────────────────────────────────────
export const RentTrackerView: React.FC<RentTrackerViewProps> = ({ movements }) => {
  const [expandedMonths, setExpandedMonths] = React.useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── بناء خريطة الأشهر ────────────────────────────────────────────────────
  const rentMonths = useMemo<RentMonth[]>(() => {
    const map = new Map<string, RentMonth>();

    // 1. حدد الأشهر من قيود الاستحقاق
    for (const m of movements) {
      if (classifyMovement(m) !== 'accrual') continue;
      const key = extractMonthKey(m.desc ?? '', m.date);
      if (!map.has(key)) {
        const [yr, mo] = key.split('-');
        map.set(key, {
          key, label: `${ARABIC_MONTHS[mo] ?? mo} ${yr}`,
          accrualSAR: 0, accrualYER: 0,
          paidSAR: 0,    paidYER: 0,
          settlementSAR: 0, settlementYER: 0,
          remainingSAR: 0, remainingYER: 0,
          transactions: [],
        });
      }
      const e = map.get(key)!;
      e.transactions.push(m);
      if (m.currency === 'SAR') e.accrualSAR += m.credit;
      if (m.currency === 'YER') e.accrualYER += m.credit;
    }

    if (map.size === 0) return [];

    const sortedKeys = Array.from(map.keys()).sort();

    // 2. وزّع المدفوعات والمقاصة على أقرب شهر استحقاق
    for (const m of movements) {
      const type = classifyMovement(m);
      if (type === 'accrual' || type === 'other') continue;
      const movMonth = m.date.slice(0, 7);
      const targetKey =
        sortedKeys.find(k => k === movMonth) ??
        sortedKeys.slice().reverse().find(k => k <= movMonth) ??
        sortedKeys[0];
      if (!targetKey) continue;

      const e = map.get(targetKey)!;
      e.transactions.push(m);

      if (type === 'payment') {
        const amt = m.debit > 0 ? m.debit : m.credit;
        if (m.currency === 'SAR') e.paidSAR += amt;
        if (m.currency === 'YER') e.paidYER += amt;
      } else {
        // settlement | sale
        const amt = m.debit > 0 ? m.debit : m.credit;
        if (m.currency === 'SAR') e.settlementSAR += amt;
        if (m.currency === 'YER') e.settlementYER += amt;
      }
    }

    // 3. احسب المتبقي
    for (const e of map.values()) {
      e.remainingSAR = Math.max(0, e.accrualSAR - e.paidSAR - e.settlementSAR);
      e.remainingYER = Math.max(0, e.accrualYER - e.paidYER - e.settlementYER);
    }

    return sortedKeys.map(k => map.get(k)!).filter(Boolean);
  }, [movements]);

  if (rentMonths.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-16 text-slate-400">
        <Building2 size={40} className="opacity-30" />
        <p className="font-bold">لا توجد قيود إيجار مسجلة</p>
      </div>
    );
  }

  const grandRemaining = rentMonths.reduce((s, m) => s + m.remainingSAR, 0);

  return (
    <div className="space-y-3">
      {/* ── شريط الإجمالي ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-xl border border-blue-200/60 bg-gradient-to-l from-blue-50 to-indigo-50/50 px-4 py-3 dark:border-blue-900/40 dark:from-blue-950/20 dark:to-indigo-950/10">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-blue-800 dark:text-blue-200">متابعة إيجار المحل — شهري</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/50">
            {rentMonths.length} أشهر
          </span>
        </div>
        {grandRemaining > 0 ? (
          <span className="rounded-lg bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            إجمالي المتبقي: {formatCurrency(grandRemaining, 'SAR')}
          </span>
        ) : (
          <span className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            ✓ جميع الأشهر مسددة
          </span>
        )}
      </div>

      {/* ── بطاقة كل شهر ─────────────────────────────────────────────────── */}
      {rentMonths.map(month => {
        const totalPaid = month.paidSAR + month.settlementSAR;
        const isPaid    = month.remainingSAR <= 0;
        const isPartial = !isPaid && totalPaid > 0;
        const isOpen    = expandedMonths.has(month.key);

        const borderCls = isPaid
          ? 'border-emerald-200/80 dark:border-emerald-900/50'
          : isPartial
            ? 'border-amber-200/80 dark:border-amber-900/50'
            : 'border-rose-200/80 dark:border-rose-900/50';

        const bgCls = isPaid
          ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
          : isPartial
            ? 'bg-amber-50/20 dark:bg-amber-950/10'
            : 'bg-rose-50/20 dark:bg-rose-950/10';

        return (
          <div key={month.key} className={cn('overflow-hidden rounded-xl border shadow-sm', borderCls, bgCls)}>

            {/* ── رأس الشهر ─────────────────────────────────────────────── */}
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-right transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => toggle(month.key)}
            >
              {/* الجانب الأيمن: أيقونة الحالة + اسم الشهر + Badge */}
              <div className="flex items-center gap-2.5">
                {isPaid
                  ? <CheckCircle2 size={19} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  : isPartial
                    ? <Clock size={19} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    : <AlertCircle size={19} className="shrink-0 text-rose-600 dark:text-rose-400" />
                }
                <Calendar size={13} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  إيجار شهر {month.label}
                </span>
                {isPaid
                  ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">مسدد ✓</span>
                  : isPartial
                    ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">جزئي</span>
                    : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">غير مسدد</span>
                }
              </div>

              {/* الجانب الأيسر: مجموعات الأرقام */}
              <div className="flex items-center gap-5">
                <div className="text-right text-[11px] font-medium text-slate-500">
                  مستحق:{' '}
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {formatCurrency(month.accrualSAR, 'SAR')}
                  </span>
                  {month.accrualYER > 0 && (
                    <span className="mr-1 font-mono text-slate-500">
                      + {formatCurrency(month.accrualYER, 'YER')}
                    </span>
                  )}
                </div>
                {totalPaid > 0 && (
                  <div className="text-right text-[11px] text-emerald-700 dark:text-emerald-400">
                    مدفوع:{' '}
                    <span className="font-mono font-bold">{formatCurrency(totalPaid, 'SAR')}</span>
                  </div>
                )}
                {month.remainingSAR > 0 && (
                  <div className="text-right text-[11px] text-rose-700 dark:text-rose-400">
                    متبقي:{' '}
                    <span className="font-mono font-bold">{formatCurrency(month.remainingSAR, 'SAR')}</span>
                  </div>
                )}
                {isOpen
                  ? <ChevronDown size={15} className="shrink-0 text-slate-400" />
                  : <ChevronRight size={15} className="shrink-0 rotate-180 text-slate-400" />
                }
              </div>
            </button>

            {/* ── جدول التفاصيل ─────────────────────────────────────────── */}
            {isOpen && (
              <div className="border-t border-slate-200/60 px-3 pb-3 pt-2 dark:border-slate-700/40">
                <div className="overflow-hidden rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                        <th className="p-2 text-right font-bold">التاريخ</th>
                        <th className="p-2 text-right font-bold">البيان</th>
                        <th className="p-2 text-center font-bold">النوع</th>
                        <th className="p-2 text-center font-bold text-rose-700 dark:text-rose-400">استحقاق</th>
                        <th className="p-2 text-center font-bold text-blue-700 dark:text-blue-400">سداد نقدي</th>
                        <th className="p-2 text-center font-bold text-indigo-700 dark:text-indigo-400">خصم/مقاصة</th>
                      </tr>
                    </thead>
                    <tbody>

                      {/* قيود الاستحقاق */}
                      {month.transactions
                        .filter(t => classifyMovement(t) === 'accrual')
                        .map((t, i) => (
                          <tr key={`acc-${i}`} className="border-t border-slate-100 bg-rose-50/40 dark:border-slate-700/30 dark:bg-rose-950/10">
                            <td className="p-2 font-mono text-slate-500" dir="ltr">{t.date}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                                <Building2 size={10} className="shrink-0 text-rose-500" />
                                استحقاق إيجار شهر {month.label}
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                استحقاق شهري
                              </span>
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-rose-700 dark:text-rose-400" dir="ltr">
                              {t.credit > 0 ? formatCurrency(t.credit, t.currency) : '—'}
                            </td>
                            <td className="p-2 text-center text-slate-300">—</td>
                            <td className="p-2 text-center text-slate-300">—</td>
                          </tr>
                        ))}

                      {/* سندات الدفع */}
                      {month.transactions
                        .filter(t => classifyMovement(t) === 'payment')
                        .map((t, i) => {
                          const amt = t.debit > 0 ? t.debit : t.credit;
                          return (
                            <tr key={`pay-${i}`} className="border-t border-slate-100 dark:border-slate-700/30">
                              <td className="p-2 font-mono text-slate-500" dir="ltr">{t.date}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                                  <Banknote size={10} className="shrink-0 text-blue-500" />
                                  <span>سداد نقدي — خصم من إيجار {month.label}</span>
                                  <span className="font-mono text-slate-400">({t.ref})</span>
                                </div>
                              </td>
                              <td className="p-2 text-center">
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                  دفع نقدي
                                </span>
                              </td>
                              <td className="p-2 text-center text-slate-300">—</td>
                              <td className="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-400" dir="ltr">
                                {formatCurrency(amt, t.currency)}
                              </td>
                              <td className="p-2 text-center text-slate-300">—</td>
                            </tr>
                          );
                        })}

                      {/* مقاصة + مبيعات */}
                      {month.transactions
                        .filter(t => {
                          const tp = classifyMovement(t);
                          return tp === 'settlement' || tp === 'sale';
                        })
                        .map((t, i) => {
                          const tp  = classifyMovement(t);
                          const amt = t.debit > 0 ? t.debit : t.credit;
                          const invRef = t.desc?.match(/INV-[\w-]+/)?.[0] ?? t.ref;
                          return (
                            <tr key={`set-${i}`} className="border-t border-slate-100 bg-indigo-50/30 dark:border-slate-700/30 dark:bg-indigo-950/10">
                              <td className="p-2 font-mono text-slate-500" dir="ltr">{t.date}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                                  <ShoppingCart size={10} className="shrink-0 text-indigo-500" />
                                  <span>
                                    {tp === 'sale'
                                      ? `قطع غيار مباعة — تُخصم من إيجار ${month.label}`
                                      : `مقاصة — تُخصم من إيجار ${month.label}`}
                                  </span>
                                  {invRef && (
                                    <span className="font-mono text-indigo-400">({invRef})</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 text-center">
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                  {tp === 'sale' ? 'مبيعات' : 'مقاصة'}
                                </span>
                              </td>
                              <td className="p-2 text-center text-slate-300">—</td>
                              <td className="p-2 text-center text-slate-300">—</td>
                              <td className="p-2 text-center font-mono font-bold text-indigo-700 dark:text-indigo-400" dir="ltr">
                                {formatCurrency(amt, t.currency)}
                              </td>
                            </tr>
                          );
                        })}

                      {/* صف الإجمالي */}
                      <tr className="border-t-2 border-slate-300/80 bg-slate-100/80 font-bold dark:border-slate-600 dark:bg-slate-800/50">
                        <td colSpan={3} className="p-2 text-right text-slate-700 dark:text-slate-200">
                          إجمالي — إيجار {month.label}
                        </td>
                        <td className="p-2 text-center font-mono text-rose-700 dark:text-rose-400" dir="ltr">
                          {formatCurrency(month.accrualSAR, 'SAR')}
                          {month.accrualYER > 0 && (
                            <div className="text-[10px] opacity-70">{formatCurrency(month.accrualYER, 'YER')}</div>
                          )}
                        </td>
                        <td className="p-2 text-center font-mono text-blue-700 dark:text-blue-400" dir="ltr">
                          {month.paidSAR > 0 ? formatCurrency(month.paidSAR, 'SAR') : '—'}
                        </td>
                        <td className="p-2 text-center font-mono text-indigo-700 dark:text-indigo-400" dir="ltr">
                          {month.settlementSAR > 0 ? formatCurrency(month.settlementSAR, 'SAR') : '—'}
                        </td>
                      </tr>

                      {/* صف المتبقي (إن وجد) */}
                      {month.remainingSAR > 0 && (
                        <tr className={cn(
                          'font-bold',
                          isPartial
                            ? 'bg-amber-100/70 dark:bg-amber-950/30'
                            : 'bg-rose-100/70 dark:bg-rose-950/30'
                        )}>
                          <td colSpan={3} className="p-2 text-right text-rose-700 dark:text-rose-300">
                            ⚠ المتبقي غير المسدد — إيجار {month.label}
                          </td>
                          <td colSpan={3} className="p-2 text-center font-mono font-bold text-rose-700 dark:text-rose-300" dir="ltr">
                            {formatCurrency(month.remainingSAR, 'SAR')}
                            {month.remainingYER > 0 && (
                              <span className="mr-2 text-[10px] opacity-80">
                                + {formatCurrency(month.remainingYER, 'YER')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RentTrackerView;
