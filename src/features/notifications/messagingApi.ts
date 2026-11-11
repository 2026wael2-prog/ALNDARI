import { logger } from '../../core/utils/logger';
// ============================================
// Messaging API - Supabase Integration
// ============================================

import { supabase } from '../../lib/supabaseClient';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Database } from '../../core/database.types';

type MessagingConfigUpdate = Database['public']['Tables']['messaging_config']['Update'];
type MessagingConfigInsert = Database['public']['Tables']['messaging_config']['Insert'];

export interface MessagingConfig {
  id?: string;
  company_id: string;
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  whatsapp_enabled: boolean;
  whatsapp_api_url: string;
  whatsapp_api_key: string;
  whatsapp_phone: string;
  notify_on_sale: boolean;
  notify_on_purchase: boolean;
  notify_on_bond: boolean;
  notify_on_payment_bond?: boolean;
  notify_on_expense: boolean;
  notify_on_stock_transfer: boolean;
  notify_on_low_stock: boolean;
}

export interface NotificationLogEntry {
  id: string;
  company_id: string;
  channel: 'telegram' | 'whatsapp';
  event_type: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  error_message?: string;
  reference_id?: string;
  created_at: string;
}

export const DEFAULT_MESSAGING_CONFIG: Omit<MessagingConfig, 'company_id'> = {
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  whatsapp_enabled: false,
  whatsapp_api_url: '',
  whatsapp_api_key: '',
  whatsapp_phone: '',
  notify_on_sale: true,
  notify_on_purchase: true,
  notify_on_bond: true,
  notify_on_payment_bond: true,
  notify_on_expense: true,
  notify_on_stock_transfer: true,
  notify_on_low_stock: true,
};

// ── Secret handling ───────────────────────────────────────────────────────────
// Raw API keys (WhatsApp token / Telegram bot token) must NEVER live in React
// state or be written back over the stored value. On fetch they are replaced
// with this sentinel; on save a sentinel value is omitted from the payload.
export const MASKED_SECRET = '••••••••••';

export const SECRET_FIELDS = ['whatsapp_api_key', 'telegram_bot_token'] as const;

type MessagingConfigRow = MessagingConfig & Record<string, unknown>;

export const messagingApi = {
  /**
   * إعدادات القنوات — H-1 (هجرة 20260924000001): أعمدة المفاتيح
   * (`whatsapp_api_key`/`telegram_bot_token`/`sms_api_key`) ممنوعة القراءة
   * على `authenticated` على مستوى العمود، فلا تُطلب أصلاً. يُبني القناع من
   * علم الوجود المحسوب في الخادم (`has_*`) — المفتاح الخام لا يصل إلى المتصفح.
   */
  getConfig: async (companyId: string): Promise<MessagingConfig | null> => {
    const { data, error } = await supabase
      .from('messaging_config')
      .select(
        'id, company_id, telegram_enabled, telegram_chat_id, whatsapp_enabled, whatsapp_api_url, whatsapp_phone, notify_on_sale, notify_on_purchase, notify_on_expense, notify_on_stock_transfer, notify_on_low_stock, notify_on_payment_bond, has_whatsapp_key, has_telegram_token'
      )
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      logger.error('messagingApi', '[MessagingAPI] Error fetching config:', error);
    }
    if (!data) return null;
    const masked: MessagingConfigRow = { ...(data as unknown as MessagingConfig) };
    // 🔒 القناع مبني على علم الوجود — لا مفتاح خام يُنقل عبر الشبكة.
    masked.whatsapp_api_key = data.has_whatsapp_key ? MASKED_SECRET : '';
    masked.telegram_bot_token = data.has_telegram_token ? MASKED_SECRET : '';
    // توافق الحقل للسندات لتفادي uncontrolled input وخطأ 400
    const bondVal = (data as { notify_on_payment_bond?: boolean }).notify_on_payment_bond ?? true;
    masked.notify_on_bond = bondVal;
    masked.notify_on_payment_bond = bondVal;
    return masked;
  },

  /**
   * Save/update messaging config.
   * Secret fields carrying the MASKED_SECRET sentinel are OMITTED from the
   * update so the stored key is never overwritten with the mask.
   * Validates columns against real schema to prevent PostgREST 400 Bad Request.
   */
  saveConfig: async (config: MessagingConfig): Promise<{ error: PostgrestError | null }> => {
    // بناء حمولة نقية متوافقة تماماً مع نوع Update في قاعدة البيانات
    const cleanPayload: MessagingConfigUpdate = {
      updated_at: new Date().toISOString(),
      telegram_enabled: Boolean(config.telegram_enabled),
      telegram_chat_id: String(config.telegram_chat_id ?? '').trim(),
      whatsapp_enabled: Boolean(config.whatsapp_enabled),
      whatsapp_api_url: String(config.whatsapp_api_url ?? '').trim(),
      whatsapp_phone: String(config.whatsapp_phone ?? '').trim(),
      notify_on_sale: config.notify_on_sale ?? true,
      notify_on_purchase: config.notify_on_purchase ?? true,
      notify_on_payment_bond: config.notify_on_payment_bond ?? config.notify_on_bond ?? true,
      notify_on_expense: config.notify_on_expense ?? true,
      notify_on_stock_transfer: config.notify_on_stock_transfer ?? true,
      notify_on_low_stock: config.notify_on_low_stock ?? true,
    };

    // لا تُرسل المفاتيح السرية إلا إذا تم تعديلها وليست القناع
    if (config.whatsapp_api_key && config.whatsapp_api_key !== MASKED_SECRET) {
      cleanPayload.whatsapp_api_key = config.whatsapp_api_key.trim();
    }
    if (config.telegram_bot_token && config.telegram_bot_token !== MASKED_SECRET) {
      cleanPayload.telegram_bot_token = config.telegram_bot_token.trim();
    }

    // تحديث أولاً ثم إدراج لتفادي مشاكل onConflict 400 في PostgREST
    const { data: updated, error: updateError } = await supabase
      .from('messaging_config')
      .update(cleanPayload)
      .eq('company_id', config.company_id)
      .select('id');

    if (updateError) {
      logger.error('messagingApi', '[MessagingAPI] Error updating config:', updateError);
      return { error: updateError };
    }

    if (!updated || updated.length === 0) {
      const insertPayload: MessagingConfigInsert = {
        company_id: config.company_id,
        ...cleanPayload,
      };
      const { error: insertError } = await supabase
        .from('messaging_config')
        .insert(insertPayload);

      if (insertError) {
        logger.error('messagingApi', '[MessagingAPI] Error inserting config:', insertError);
        return { error: insertError };
      }
    }

    return { error: null };
  },

  /**
   * Send notification via Edge Function
   */
  sendNotification: async (
    companyId: string,
    eventType: string,
    message: string,
    referenceId?: string
  ): Promise<{
    success: boolean;
    results?: Array<{ channel?: string; success?: boolean; error?: string }>;
  }> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`,
          },
          body: JSON.stringify({
            company_id: companyId,
            event_type: eventType,
            message,
            reference_id: referenceId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        logger.error('messagingApi', '[MessagingAPI] Edge function error:', result);
        return { success: false };
      }

      return { success: true, results: result.results };
    } catch (error) {
      logger.error('messagingApi', '[MessagingAPI] Send notification error:', error);
      return { success: false };
    }
  },

  /**
   * Get notification log
   */
  getLog: async (companyId: string, limit = 50): Promise<NotificationLogEntry[]> => {
    const { data, error } = await supabase
      .from('notification_log')
      .select(
        'id, company_id, channel, event_type, message, status, error_message, reference_id, created_at'
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('messagingApi', '[MessagingAPI] Error fetching log:', error);
      return [];
    }
    return (data || []) as NotificationLogEntry[];
  },
};
