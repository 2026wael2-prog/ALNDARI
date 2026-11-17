import { supabase } from '../../lib/supabaseClient';
import type { Json } from '../../core/database.types';
import { parseError } from '../../core/utils/errorUtils';
import { parseNumberFlexible } from '../../core/utils/currencyUtils';
import type { ExpenseFormData } from './types';
import { isCogsAccount } from '../accounting/services/reportService';

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
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    if (error) throw parseError(error);
    return { data: data || [], error: null };
  },

  getExpensesRaw: async (companyId: string, branchId?: string | null) => {
    const PAGE_SIZE = 1000;
    const allRows: Record<string, unknown>[] = [];
    let from = 0;

    while (true) {
      let query = supabase
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
        .order('expense_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw parseError(error);
      const batch = (data || []) as Record<string, unknown>[];
      allRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // أيضاً: جلب المصروفات التشغيلية المرحلة مباشرة في القيود (غير ناتجة عن جدول expenses)
    // حتى تظهر جميع المصروفات التشغيلية التاريخية والقيود اليدوية في صفحة المصروفات والتحليلات
    const journalExpenses: Record<string, unknown>[] = [];
    let jFrom = 0;
    while (true) {
      let jQuery = supabase
        .from('journal_entry_lines')
        .select(
          `
          id,
          debit_amount,
          credit_amount,
          description,
          created_at,
          account:accounts!inner(id, code, name_ar, type, deleted_at),
          journal:journal_entries!inner(id, entry_number, entry_date, description, reference_type, status, branch_id, deleted_at)
        `
        )
        .eq('journal.company_id', companyId)
        .eq('journal.status', 'posted')
        .is('journal.deleted_at', null)
        .is('deleted_at', null)
        .eq('account.type', 'expense')
        .is('account.deleted_at', null)
        .neq('journal.reference_type', 'expense')
        .order('created_at', { ascending: false })
        .range(jFrom, jFrom + PAGE_SIZE - 1);

      if (branchId) {
        jQuery = jQuery.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data: jData, error: jError } = await jQuery;
      if (jError) break;
      const jBatch = (jData || []) as Record<string, unknown>[];

      for (const line of jBatch) {
        const acc = line.account as { id?: string; code?: string; name_ar?: string } | null;
        const je = line.journal as {
          id?: string;
          entry_number?: number | string | null;
          entry_date?: string;
          description?: string | null;
          branch_id?: string | null;
        } | null;
        if (!acc?.id || !je?.entry_date) continue;
        if (isCogsAccount(acc.code || '', acc.name_ar || '')) continue;

        const netAmount = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0);
        if (Math.abs(netAmount) < 0.001) continue;

        journalExpenses.push({
          id: `jel_${String(line.id)}`,
          category_id: acc.id,
          voucher_number: je.entry_number ? `JV-${String(je.entry_number)}` : null,
          description:
            (line.description as string | null) ||
            je.description ||
            acc.name_ar ||
            'مصروف تشغيلي',
          amount: netAmount,
          currency_code: 'SAR',
          exchange_rate: 1,
          expense_date: je.entry_date,
          status: 'posted',
          payment_method: 'cash',
          is_recurring: false,
          created_at: line.created_at,
          branch_id: je.branch_id ?? null,
          expense_categories: { name: acc.name_ar || 'مصروف تشغيلي' },
          is_journal_sourced: true,
        });
      }

      if (jBatch.length < PAGE_SIZE) break;
      jFrom += PAGE_SIZE;
    }

    const merged = [...allRows, ...journalExpenses].sort((a, b) =>
      String(b.expense_date ?? '').localeCompare(String(a.expense_date ?? ''))
    );

    return { data: merged, error: null };
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
