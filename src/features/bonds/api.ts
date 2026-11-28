import { logger } from '../../core/utils/logger';
import { parseError } from '../../core/utils/errorUtils';

import { supabase } from '../../lib/supabaseClient';
import { edgeClient, shouldUseLocalFailover } from '@/core/offline/edgeClient';
import type { BondFormData, BondType } from './types';

interface GetBondsFilter {
  type?: BondType | undefined;
  limitNum?: number | undefined;
  offsetNum?: number | undefined;
}

const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isPosNum = (v: unknown): v is number => typeof v === 'number' && v > 0;

function pickOptionalBondFields(
  data: BondFormData & { branchId?: string | null }
): Record<string, unknown> {
  const opt: Record<string, unknown> = {};
  if (isNonEmptyStr(data.invoice_id)) opt.p_invoice_id = data.invoice_id;
  if (isNonEmptyStr(data.currency_code)) opt.p_currency_code = data.currency_code;
  if (isPosNum(data.exchange_rate)) opt.p_exchange_rate = data.exchange_rate;
  if (isPosNum(data.foreign_amount)) opt.p_foreign_amount = data.foreign_amount;
  if (isNonEmptyStr(data.branchId)) opt.p_branch_id = data.branchId;
  if (isPosNum(data.commission_amount) && isNonEmptyStr(data.commission_account_id)) {
    opt.p_commission_amount = data.commission_amount;
    opt.p_commission_account_id = data.commission_account_id;
  }
  return opt;
}

function buildBondRpcParams(
  companyId: string,
  userId: string,
  data: BondFormData & { branchId?: string | null; idempotency_key?: string }
): Record<string, unknown> {
  const paymentType =
    data.type === 'receipt' ? 'receipt' : data.type === 'transfer' ? 'transfer' : 'disbursement';
  const idempotencyKey = isNonEmptyStr(data.idempotency_key)
    ? data.idempotency_key
    : crypto.randomUUID();

  return {
    p_bond_type: paymentType,
    p_company_id: companyId,
    p_user_id: userId,
    p_amount: data.amount,
    p_date: data.date,
    p_cash_account_id: data.cash_account_id,
    p_counterparty_type: data.counterparty_type,
    p_counterparty_id: data.counterparty_id,
    p_description: data.description,
    p_payment_method: isNonEmptyStr(data.payment_method) ? data.payment_method : 'cash',
    p_idempotency_key: idempotencyKey,
    ...pickOptionalBondFields(data),
  };
}

const TYPE_FILTER_MAP = new Map<BondType, string[]>([
  ['receipt', ['receipt']],
  ['transfer', ['transfer']],
  ['payment', ['disbursement', 'payment']],
]);

function resolveGetBondsRange(
  typeOrOpts?: BondType | GetBondsFilter,
  limitNum = 200,
  offsetNum = 0
): { resolvedType: BondType | undefined; from: number; to: number } {
  const opts: GetBondsFilter =
    typeof typeOrOpts === 'object' ? typeOrOpts : { type: typeOrOpts };
  const safeLimit = Math.max(1, opts.limitNum ?? limitNum);
  const safeOffset = Math.max(0, opts.offsetNum ?? offsetNum);
  return {
    resolvedType: opts.type,
    from: safeOffset,
    to: safeOffset + safeLimit - 1,
  };
}

export const bondsApi = {
  // eslint-disable-next-line max-params
  getBonds: async (
    companyId: string,
    branchId?: string | null,
    typeOrOpts?: BondType | GetBondsFilter,
    limitNum = 200,
    offsetNum = 0
  ) => {
    const { resolvedType, from, to } = resolveGetBondsRange(typeOrOpts, limitNum, offsetNum);

    let query = supabase
      .from('payments')
      .select(
        `id, payment_number, payment_date, created_at, amount, currency_code, exchange_rate,
         payment_method, type, notes, status, party_id,
         party:parties!fk_payments_company_party(name),
         account:accounts!fk_payments_company_account(name_ar, code)`,
        { count: 'exact' }
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('status', 'void')
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    const types = resolvedType ? TYPE_FILTER_MAP.get(resolvedType) : undefined;
    if (types !== undefined) {
      query = query.in('type', types);
    }

    if (isNonEmptyStr(branchId)) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    return await query;
  },

  getBondById: async (bondId: string) => {
    return await supabase
      .from('payments')
      .select(
        `
        id,
        payment_number,
        payment_date,
        created_at,
        amount,
        currency_code,
        exchange_rate,
        payment_method,
        type,
        notes,
        status,
        party_id,
        party:parties!fk_payments_company_party(name),
        account:accounts!fk_payments_company_account(name_ar, code)
      `
      )
      .eq('id', bondId)
      .single();
  },

  createPaymentRPC: async (
    companyId: string,
    userId: string,
    data: BondFormData & { branchId?: string | null }
  ) => {
    if (data.cash_account_id === '' || data.counterparty_id === '') {
      throw new Error('يجب اختيار الحسابات المطلوبة');
    }

    if (data.amount <= 0) {
      throw new Error('لا يمكن إنشاء سند بقيمة صفر أو قيمة سالبة');
    }

    const bondRpcParams = buildBondRpcParams(companyId, userId, data);

    if (shouldUseLocalFailover()) {
      return await edgeClient.enqueueBond(bondRpcParams, userId);
    }

    try {
      const { data: resultData, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: unknown }>
      )('create_financial_bond', bondRpcParams);

      if (error !== null && error !== undefined) {
        if (shouldUseLocalFailover(error)) {
          return await edgeClient.enqueueBond(bondRpcParams, userId);
        }
        throw parseError(error);
      }

      return resultData;
    } catch (netErr) {
      if (shouldUseLocalFailover(netErr)) {
        return await edgeClient.enqueueBond(bondRpcParams, userId);
      }
      throw netErr;
    }
  },

  getUnpaidPartyInvoices: async (
    companyId: string,
    partyId: string,
    partyType: 'customer' | 'supplier',
    branchId?: string | null
  ) => {
    let query = supabase
      .from('invoices')
      .select(
        `
        *,
        invoice_items(
          *,
          product:products(name_ar, sku, part_number, brand)
        )
      `
      )
      .eq('company_id', companyId)
      .eq('party_id', partyId)
      .eq('type', partyType === 'customer' ? 'sale' : 'purchase')
      .neq('payment_method', 'cash')
      .in('status', ['posted', 'partially_paid'])
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (typeof branchId === 'string' && branchId !== '') {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (error !== null) throw error;
    return data.filter(inv => inv.total_amount > inv.paid_amount);
  },

  deleteBond: async (id: string) => {
    // void_bond RPC (hardened 2026-08-19):
    //  - verifies company access + open fiscal year,
    //  - posts a balanced REVERSAL journal via fn_reverse_journal_entries
    //    (the posted journal is immutable) and then voids the payment.
    // Failure must abort the whole delete to prevent double-entry imbalance.
    const { error: rpcError } = await supabase.rpc('void_bond', {
      p_payment_id: id,
    });

    if (rpcError !== null) {
      // Must fail strictly to prevent double-entry imbalance and preserve permission/fiscal-year messages
      logger.error('api', 'Fatal: void_bond RPC failed', rpcError);
      throw parseError(rpcError);
    }

    return { error: null };
  },

  getBondsStats: async (companyId: string, branchId?: string | null, period?: string) => {
    return await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_bonds_stats', {
      p_company_id: companyId,
      p_branch_id: branchId ?? null,
      p_period: period ?? null,
    });
  },
};
