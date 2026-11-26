import { supabase } from '../../lib/supabaseClient';
import type { Json } from '../../core/database.types';
import { parseError } from '../../core/utils/errorUtils';
import { parseNumberFlexible } from '../../core/utils/currencyUtils';
import type { ExpenseFormData } from './types';

// Typed interfaces for category create payload
interface CategoryInsert {
  company_id: string;
  name: string;
  [key: string]: unknown;
}

export const expensesApi = {
  getExpenseCategories: async (companyId: string) => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('id, company_id, name, description, color, account_id, is_system, created_at, updated_at, deleted_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .limit(500);
    if (error) throw parseError(error);
    return { data: data || [], error: null };
  },

  getExpensesRaw: async (
    companyId: string,
    branchId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null
  ): Promise<{ data: Record<string, unknown>[]; error: null }> => {
    // ⚡ استدعاء RPC الموحد والسريع لجلب كافة المصروفات التشغيلية والايجارات وسندات الصرف
    const { data: unifiedData, error: rpcError } = await supabase.rpc('get_unified_expenses', {
      p_company_id: companyId,
      ...(branchId ? { p_branch_id: branchId } : {}),
      ...(dateFrom ? { p_date_from: dateFrom } : {}),
      ...(dateTo ? { p_date_to: dateTo } : {}),
    });

    if (!rpcError && Array.isArray(unifiedData)) {
      return { data: unifiedData as unknown as Record<string, unknown>[], error: null };
    }

    if (rpcError && import.meta.env.DEV) {
      console.warn('[ExpensesApi] get_unified_expenses error, attempting direct query:', rpcError);
    }

    // Fallback: جلب مباشر من جدول expenses إذا حدث خطأ غير متوقع
    let fallbackQuery = supabase
      .from('expenses')
      .select(
        `
        id,
        category_id,
        voucher_number,
        description,
        amount,
        currency_code,
        exchange_rate,
        expense_date,
        status,
        payment_method,
        is_recurring,
        frequency,
        recurring_end_date,
        created_at,
        branch_id,
        expense_categories!fk_expenses_company_category(name)
      `
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false });

    if (branchId) {
      fallbackQuery = fallbackQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data: expData, error: expError } = await fallbackQuery;
    if (expError) throw parseError(expError);
    return { data: (expData || []) as unknown as Record<string, unknown>[], error: null };
  },

  // استخدام RPC الموحد v2 الذي يدعم الربط المباشر بالحسابات وتحسين الأداء ومنع التكرار
  createExpenseRPC: async (companyId: string, userId: string, data: ExpenseFormData) => {
    return await supabase.rpc('commit_expense_v2', {
      p_company_id: companyId,
      p_user_id: userId,
      p_data: {
        idempotency_key: (data as any).idempotency_key || crypto.randomUUID(),
        category_id: data.category_id || null,
        amount: parseNumberFlexible(data.amount),
        description: data.description?.trim() || 'مصروف نثري',
        expense_date: data.expense_date,
        date: data.expense_date,
        payment_method: data.payment_method || 'cash',
        ...(data.voucher_number ? { voucher_number: data.voucher_number.trim() } : {}),
        currency_code: data.currency_code || 'SAR',
        currency: data.currency_code || 'SAR',
        exchange_rate: Number(data.exchange_rate) > 0 ? Number(data.exchange_rate) : 1,
        confirm_large_sar: Boolean(data.confirm_large_sar),
        branch_id: data.branch_id || null,
      } as unknown as Json,
    });
  },

  createExpenseCategory: async (categoryData: CategoryInsert) => {
    return await supabase
      .from('expense_categories')
      .insert({
        company_id: categoryData.company_id,
        name: categoryData.name,
      })
      .select()
      .single();
  },

  deleteExpenseRecord: async (id: string) => {
    // Use the void_expense RPC: it voids the expense AND creates the reversal
    // journal entry atomically. There is deliberately NO soft-delete fallback —
    // voiding without reversing the journal would leave the ledger unbalanced.
    const { error: rpcError } = await supabase.rpc('void_expense', {
      p_expense_id: id,
    });

    if (rpcError) {
      throw parseError(rpcError);
    }
  },
};
