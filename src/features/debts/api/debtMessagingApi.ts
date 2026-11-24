import { supabase } from '../../../lib/supabaseClient';
import type { Database } from '../../../core/database.types';
import type {
  DebtChannelConfig,
  DebtChannelConfigPatch,
  DebtMessageLogWithParty,
  DebtMessageTemplate,
  DebtMessageTemplateInsert,
  DebtMessageTemplateUpdate,
  DebtReminderQueueRow,
  PartyOpeningBalance,
  PartyOpeningBalanceInsert,
  ReminderRecord,
} from '../types';
import { isMissingRpcError } from './debtCoreApi';

/** إعدادات قنوات الإرسال الفارغة (افتراضي قبل أي ضبط) — بلا أي مفاتيح. */
export const EMPTY_CHANNEL_CONFIG: DebtChannelConfig = {
  whatsapp_enabled: false,
  whatsapp_api_url: '',
  whatsapp_phone: '',
  has_whatsapp_key: false,
  sms_enabled: false,
  sms_api_url: '',
  sms_sender_id: '',
  has_sms_key: false,
};

export const debtMessagingApi = {
  getTemplates: async (companyId: string, activeOnly = true): Promise<DebtMessageTemplate[]> => {
    let query = supabase.from('debt_message_templates').select('*').eq('company_id', companyId);
    if (activeOnly) query = query.eq('is_active', true);
    query = query.order('name', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  saveTemplate: async (payload: DebtMessageTemplateInsert): Promise<DebtMessageTemplate> => {
    const { data, error } = await supabase
      .from('debt_message_templates')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateTemplate: async (
    companyId: string,
    id: string,
    payload: DebtMessageTemplateUpdate
  ): Promise<DebtMessageTemplate> => {
    const { data, error } = await supabase
      .from('debt_message_templates')
      .update(payload)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  deleteTemplate: async (companyId: string, id: string): Promise<void> => {
    const { error } = await supabase
      .from('debt_message_templates')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  },

  getMessageLog: async (
    companyId: string,
    status?: string,
    limit = 200,
    branchId?: string | null
  ): Promise<DebtMessageLogWithParty[]> => {
    let query = supabase
      .from('debt_message_log')
      .select(branchId ? '*, parties!inner(name, phone, branch_id)' : '*, parties(name, phone)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    if (branchId) query = query.eq('parties.branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    const rows: unknown = data ?? [];
    return rows as DebtMessageLogWithParty[];
  },

  countByStatus: async (
    companyId: string,
    status: string,
    branchId?: string | null
  ): Promise<number> => {
    let query = supabase
      .from('debt_message_log')
      .select(branchId ? 'id, parties!inner(branch_id)' : 'id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', status);
    if (branchId) query = query.eq('parties.branch_id', branchId);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  },

  recordReminder: async (params: {
    companyId: string;
    partyId: string;
    messageText: string;
    channel?: string | undefined;
    templateId?: string | null | undefined;
    recipient?: string | null | undefined;
    relatedEntityType?: string | null | undefined;
    relatedEntityId?: string | null | undefined;
    idempotencyKey?: string | null | undefined;
  }): Promise<ReminderRecord> => {
    const { data, error } = await supabase.rpc('record_debt_reminder', {
      p_company_id: params.companyId,
      p_party_id: params.partyId,
      p_message_text: params.messageText,
      ...(params.channel ? { p_channel: params.channel } : {}),
      ...(params.templateId ? { p_template_id: params.templateId } : {}),
      ...(params.recipient ? { p_recipient: params.recipient } : {}),
      ...(params.relatedEntityType ? { p_related_entity_type: params.relatedEntityType } : {}),
      ...(params.relatedEntityId ? { p_related_entity_id: params.relatedEntityId } : {}),
      ...(params.idempotencyKey != null ? { p_idempotency_key: params.idempotencyKey } : {}),
    });
    if (error) throw error;
    if (data.length === 0) throw new Error('تعذر تسجيل التذكير');
    return data[0];
  },

  seedDefaultTemplates: async (companyId: string): Promise<number> => {
    const { data, error } = await supabase.rpc('seed_default_debt_templates', {
      p_company_id: companyId,
    });
    if (error) throw error;
    return data ?? 0;
  },

  getReminderQueue: async (
    companyId: string,
    status?: string,
    limit = 100
  ): Promise<DebtReminderQueueRow[]> => {
    const { data, error } = await supabase.rpc('get_debt_reminder_queue', {
      p_company_id: companyId,
      p_limit: limit,
      ...(status != null && status !== '' ? { p_status: status } : {}),
    });
    if (error) {
      if (isMissingRpcError(error)) return [];
      throw error;
    }
    return data ?? [];
  },

  getChannelConfig: async (companyId: string): Promise<DebtChannelConfig> => {
    const { data, error } = await supabase
      .from('messaging_config')
      .select(
        'whatsapp_enabled, whatsapp_api_url, whatsapp_phone, sms_enabled, sms_api_url, sms_sender_id, has_whatsapp_key, has_sms_key'
      )
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return EMPTY_CHANNEL_CONFIG;
    return {
      whatsapp_enabled: data.whatsapp_enabled ?? false,
      whatsapp_api_url: data.whatsapp_api_url ?? '',
      whatsapp_phone: data.whatsapp_phone ?? '',
      has_whatsapp_key: data.has_whatsapp_key ?? false,
      sms_enabled: data.sms_enabled ?? false,
      sms_api_url: data.sms_api_url ?? '',
      sms_sender_id: data.sms_sender_id ?? '',
      has_sms_key: data.has_sms_key ?? false,
    };
  },

  updateChannelConfig: async (companyId: string, patch: DebtChannelConfigPatch): Promise<void> => {
    type MessagingConfigUpdate = Database['public']['Tables']['messaging_config']['Update'];
    const updatePayload: MessagingConfigUpdate = {};
    if (patch.whatsapp_enabled !== undefined)
      updatePayload.whatsapp_enabled = patch.whatsapp_enabled;
    if (patch.whatsapp_api_url !== undefined)
      updatePayload.whatsapp_api_url = patch.whatsapp_api_url;
    if (patch.whatsapp_api_key) updatePayload.whatsapp_api_key = patch.whatsapp_api_key;
    if (patch.whatsapp_phone !== undefined) updatePayload.whatsapp_phone = patch.whatsapp_phone;
    if (patch.sms_enabled !== undefined) updatePayload.sms_enabled = patch.sms_enabled;
    if (patch.sms_api_url !== undefined) updatePayload.sms_api_url = patch.sms_api_url;
    if (patch.sms_api_key) updatePayload.sms_api_key = patch.sms_api_key;
    if (patch.sms_sender_id !== undefined) updatePayload.sms_sender_id = patch.sms_sender_id;

    const { data: updated, error } = await supabase
      .from('messaging_config')
      .update(updatePayload)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    if ((updated ?? []).length > 0) return;
    const { error: insertError } = await supabase
      .from('messaging_config')
      .insert({ company_id: companyId, ...updatePayload });
    if (insertError) throw insertError;
  },

  getOpeningBalances: async (
    companyId: string,
    partyId?: string,
    branchId?: string | null
  ): Promise<PartyOpeningBalance[]> => {
    let query = supabase
      .from('party_opening_balances')
      .select(branchId ? '*, parties!inner(branch_id)' : '*')
      .eq('company_id', companyId);
    if (partyId) query = query.eq('party_id', partyId);
    if (branchId) query = query.eq('parties.branch_id', branchId);
    const { data, error } = await query.order('entry_date', { ascending: false });
    if (error) throw error;
    return data as unknown as PartyOpeningBalance[];
  },

  upsertOpeningBalance: async (
    payload: PartyOpeningBalanceInsert
  ): Promise<PartyOpeningBalance> => {
    const { data, error } = await supabase
      .from('party_opening_balances')
      .upsert(payload, { onConflict: 'company_id,party_id,currency_code' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
