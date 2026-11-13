/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/explicit-function-return-type, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, security/detect-object-injection, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion */
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store';
import { reportsApi } from '../api';
import { toBaseCurrency, formatLocalDate } from '../../../core/utils';
import { bucketForDays as bucketForOverdueDays } from '../../debts/lib/aging';
import { daysDiffLocal } from '../../../core/utils/dateBucket';
import { type AgingPartyRow, type DebtAgingData, AGING_LABELS } from '../types/debtAging';
import { useBranchFilter } from '../../branches/hooks/useBranchFilter';

export interface DebtAgingInvoiceInput {
  id: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  party_id: string | null;
  parties: { name: string; type: string } | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
}

export interface DebtAgingCreditsInput {
  creditReturns: Array<{
    party_id: string | null;
    total_amount: number;
    paid_amount: number;
    currency_code?: string | null;
    exchange_rate?: number | null;
  }>;
  unallocatedReceipts: Array<{
    party_id: string | null;
    unallocated_amount: number;
    currency_code?: string | null;
    exchange_rate?: number | null;
  }>;
}

/**
 * Pure computation for Debt Aging:
 * - Aggregates unpaid non-cash sales invoices into aging buckets in base currency.
 * - Deducts unpaid credit sales returns and unallocated customer receipt bonds
 *   oldest-first (days90 -> days60 -> days30 -> current) per AGENTS.md Rule 3.
 */
export function computeDebtAgingData(
  invoices: DebtAgingInvoiceInput[],
  credits: DebtAgingCreditsInput,
  todayLocal: string = formatLocalDate()
): DebtAgingData {
  const partyAging: Record<string, AgingPartyRow> = {};

  for (const inv of invoices) {
    const dueKey = inv.due_date || inv.issue_date;
    const daysDiff = daysDiffLocal(dueKey, todayLocal);
    const remainingRaw = (inv.total_amount || 0) - (inv.paid_amount || 0);
    if (remainingRaw <= 0) continue;

    const remaining = toBaseCurrency({
      amount: remainingRaw,
      currency_code: inv.currency_code ?? null,
      exchange_rate: inv.exchange_rate ?? null,
    });

    const partyId = inv.party_id ?? '';
    const partyName = inv.parties?.name || 'غير محدد';
    const partyType = inv.parties?.type || 'customer';

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!partyAging[partyId]) {
      partyAging[partyId] = {
        id: partyId,
        name: partyName,
        type: partyType,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        total: 0,
        oldestDate: inv.due_date || inv.issue_date,
      };
    }

    const bucket = bucketForOverdueDays(daysDiff);
    if (bucket === 'b0_30') {
      partyAging[partyId].current += remaining;
    } else if (bucket === 'b31_60') {
      partyAging[partyId].days30 += remaining;
    } else if (bucket === 'b61_90') {
      partyAging[partyId].days60 += remaining;
    } else {
      partyAging[partyId].days90 += remaining;
    }

    partyAging[partyId].total += remaining;
    const invoiceOldest = inv.due_date || inv.issue_date;
    if (invoiceOldest < partyAging[partyId].oldestDate) {
      partyAging[partyId].oldestDate = invoiceOldest;
    }
  }

  // Aggregate per-party credits in base currency (credit returns + unallocated receipt bonds)
  const partyCredits = new Map<string, number>();

  for (const ret of credits.creditReturns) {
    if (!ret.party_id) continue;
    const remRaw = Math.max(0, (ret.total_amount || 0) - (ret.paid_amount || 0));
    if (remRaw <= 0.01) continue;
    const baseCredit = toBaseCurrency({
      amount: remRaw,
      currency_code: ret.currency_code ?? null,
      exchange_rate: ret.exchange_rate ?? null,
    });
    partyCredits.set(ret.party_id, (partyCredits.get(ret.party_id) ?? 0) + baseCredit);
  }

  for (const rec of credits.unallocatedReceipts) {
    if (!rec.party_id || rec.unallocated_amount <= 0.01) continue;
    const baseCredit = toBaseCurrency({
      amount: rec.unallocated_amount,
      currency_code: rec.currency_code ?? null,
      exchange_rate: rec.exchange_rate ?? null,
    });
    partyCredits.set(rec.party_id, (partyCredits.get(rec.party_id) ?? 0) + baseCredit);
  }

  // Apply credits oldest-first: days90 -> days60 -> days30 -> current
  for (const [partyId, row] of Object.entries(partyAging)) {
    let remCredit = partyCredits.get(partyId) ?? 0;
    if (remCredit <= 0) continue;

    const buckets: Array<'days90' | 'days60' | 'days30' | 'current'> = [
      'days90',
      'days60',
      'days30',
      'current',
    ];
    for (const key of buckets) {
      if (remCredit <= 0) break;
      const deduct = Math.min(row[key], remCredit);
      row[key] -= deduct;
      remCredit -= deduct;
    }
    row.total = row.current + row.days30 + row.days60 + row.days90;
  }

  const partiesList = Object.values(partyAging)
    .filter(p => p.total > 0.01)
    .sort((a, b) => b.total - a.total);

  const agingBuckets = partiesList.reduce(
    (acc, p) => ({
      current: acc.current + p.current,
      days30: acc.days30 + p.days30,
      days60: acc.days60 + p.days60,
      days90: acc.days90 + p.days90,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0 }
  );

  const totalOutstanding = partiesList.reduce((s, p) => s + p.total, 0);
  const criticalCount = partiesList.filter(p => p.days90 > 0).length;

  const chartData = [
    { name: AGING_LABELS[0]!, value: Math.max(0, agingBuckets.current) },
    { name: AGING_LABELS[1]!, value: Math.max(0, agingBuckets.days30) },
    { name: AGING_LABELS[2]!, value: Math.max(0, agingBuckets.days60) },
    { name: AGING_LABELS[3]!, value: Math.max(0, agingBuckets.days90) },
  ];

  return {
    agingBuckets,
    partiesList,
    totalOutstanding,
    criticalCount,
    chartData,
  };
}

/**
 * Hook لحساب أعمار الديون بناءً على تاريخ الاستحقاق المحلي (لا انزياح UTC)
 * ومصنفة عبر bucketForDays الموحد مع قسم الديون، مع خصم السندات والمرتجعات الآجلة.
 */
export const useDebtAging = () => {
  const { user } = useAuthStore();
  const { branchId } = useBranchFilter();
  return useQuery<DebtAgingData | null>({
    queryKey: ['debt_aging', user?.company_id, branchId],
    queryFn: async () => {
      if (!user?.company_id) return null;

      const [{ data: invoices, error: invError }, creditsRes] = await Promise.all([
        reportsApi.getDebtAgingInvoices(user.company_id, branchId),
        reportsApi.getDebtAgingCredits(user.company_id, branchId),
      ]);

      if (invError !== null) throw new Error(invError.message);
      if (creditsRes.error !== null) throw new Error(creditsRes.error.message);

      return computeDebtAgingData(invoices || [], {
        creditReturns: creditsRes.creditReturns,
        unallocatedReceipts: creditsRes.unallocatedReceipts,
      });
    },
    enabled: !!user?.company_id,
  });
};
