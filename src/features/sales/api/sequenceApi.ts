import { supabase } from '@/lib/supabaseClient';
import { parseError } from '@/core/utils/errorUtils';
import { logger } from '@/core/utils/logger';
import { optArg } from '@/core/utils/rpcArgs';

export const sequenceApi = {
  getNextInvoiceNumber: async (companyId: string) => {
    const { data, error } = await supabase.rpc('get_next_invoice_number', {
      p_company_id: companyId,
      p_type: 'INV',
    });

    if (error) return { data: null, error };
    return { data: data as string | null, error: null };
  },

  getNextSequence: async (companyId: string, type: string) => {
    const { data, error } = await supabase.rpc('get_next_sequence', {
      p_company_id: companyId,
      p_sequence_name: type,
    });
    if (error) {
      logger.error('Sales', 'Error fetching next sequence', error);
      return { data: null, error: parseError(error) };
    }
    return { data, error: null };
  },

  /**
   * [AUDIT-FIX] الرقم المعروض/المطبوع قبل الاعتماد.
   * يستخدم دالة generate_invoice_number الخادمية (إن وُجدت) لتوليد رقم بصيغة
   * INV-YYYYMMDD-NNNN مطابقة لما يعتمده الخادم، بدلاً من get_next_sequence('sale')
   * التي لا تملك فرع 'sale' فترجع '1' دائماً.
   */
  getNextGeneratedNumber: async (
    companyId: string,
    type: 'sale' | 'purchase' = 'sale',
    branchId?: string | null
  ) => {
    const { data, error } = await supabase.rpc('generate_invoice_number', {
      p_company_id: companyId,
      p_type: type,
      ...optArg('p_branch_id', branchId),
    });
    if (error) {
      logger.warn('Sales', 'generate_invoice_number unavailable — falling back to sequence', error);
      return { data: null, error: parseError(error) };
    }
    return { data: data as string | null, error: null };
  },
};
