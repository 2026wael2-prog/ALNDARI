import { journalsApi, type JournalQueryFilters } from '../api/journalsApi';
import type { UIJournalEntry, JournalEntryFormData, JournalStatus } from '../types/models';
import { PostTransactionUsecase } from '../../../core/usecases/accounting/PostTransactionUsecase';
import { parseError } from '../../../core/utils/errorUtils';

// Typed raw shapes from Supabase join query
interface RawJournalLine {
  debit_amount: number | null;
  credit_amount: number | null;
  account_id?: string;
  party_id?: string | null;
  description?: string | null;
  account?: { name_ar?: string; code?: string } | null;
  party?: { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null;
}

interface RawInvoiceParty {
  name?: string;
}

interface RawInvoice {
  party?: RawInvoiceParty | RawInvoiceParty[] | null;
}

interface RawJournal {
  id: string;
  company_id: string;
  entry_number: number;
  entry_date: string;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  journal_entry_lines?: RawJournalLine[] | null;
  invoice?: RawInvoice | RawInvoice[] | null;
  created_by_profile?: { full_name?: string } | null;
}

export const journalService = {
  /**
   * إنشاء قيد محاسبي جديد باستخدام المحرك المركزي
   */
  createJournal: async (
    formData: JournalEntryFormData,
    companyId: string,
    userId: string,
    branchId?: string | null
  ) => {
    // نفوض الأمر للـ Usecase الذي يستخدم الـ RPC
    return await PostTransactionUsecase.execute(formData, companyId, userId, branchId);
  },

  /**
   * تنسيق البيانات القادمة من الـ API لتناسب العرض
   */
  formatJournalsForUI: async (
    companyId: string,
    branchId?: string | null,
    pageParam = 0,
    filters?: JournalQueryFilters
  ): Promise<UIJournalEntry[]> => {
    const { data: rawData, error } = await journalsApi.fetchJournals(
      companyId,
      branchId,
      pageParam,
      filters
    );
    if (error) throw parseError(error);

    const journals = (rawData || []) as RawJournal[];

    return journals.map((j): UIJournalEntry => {
      const lines = j.journal_entry_lines || [];

      const formattedLines = lines.map(l => {
        const rawParty = Array.isArray(l.party) ? l.party[0] : l.party;
        return {
          debit_amount: l.debit_amount || 0,
          credit_amount: l.credit_amount || 0,
          description: l.description || '',
          ...(l.party_id ? { party_id: l.party_id } : {}),
          ...(rawParty?.name
            ? {
                party: {
                  ...(rawParty.id ? { id: rawParty.id } : {}),
                  name: rawParty.name,
                },
              }
            : {}),
          ...(l.account
            ? {
                account: {
                  name_ar: l.account.name_ar ?? '',
                  name: l.account.name_ar ?? '',
                  code: l.account.code ?? '',
                },
              }
            : {}),
        };
      });

      // Extract unique party names from journal entry lines first, fallback to invoice.party
      const linePartyNames = Array.from(
        new Set(
          formattedLines
            .map(l => l.party?.name?.trim())
            .filter((name): name is string => Boolean(name))
        )
      );

      let partyName: string | null = linePartyNames.length > 0 ? linePartyNames.join(' ، ') : null;
      if (!partyName) {
        const inv = j.invoice;
        if (inv && !Array.isArray(inv)) {
          if (inv.party && !Array.isArray(inv.party)) {
            partyName = inv.party.name || null;
          }
        }
      }

      return {
        id: j.id,
        company_id: j.company_id,
        entry_number: j.entry_number,
        entry_date: j.entry_date,
        description: j.description || '',
        reference_type: j.reference_type,
        reference_id: j.reference_id,
        status: (j.status || 'posted') as JournalStatus,
        created_at: j.created_at,
        created_by: j.created_by || '',
        journal_entry_lines: formattedLines,
        total_amount: Math.max(
          lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0),
          lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0)
        ),
        ...(j.created_by_profile?.full_name
          ? { created_by_profile: { full_name: j.created_by_profile.full_name } }
          : {}),
        ...(partyName ? { party_name: partyName } : {}),
      };
    });
  },
};
