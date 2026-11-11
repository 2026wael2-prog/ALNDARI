/**
 * UltraMsg Service (WhatsApp Gateway Integration)
 *
 * Provides typed client methods for UltraMsg instances:
 * - Session status check and QR pairing
 * - Direct chat messages with priority (5 for debt/billing reminders) and reference tracking
 * - Document / Statement sending (PDF, Excel)
 * - Number verification via contacts check
 * - Instance restart / reconnect
 */

export interface UltraMsgCredentials {
  url?: string | undefined;
  token?: string | undefined;
}

export interface UltraMsgStatusResult {
  ok: boolean;
  status: 'authenticated' | 'standby' | 'qr' | 'loading' | 'disconnected' | 'unknown';
  substatus?: string | undefined;
  raw?: unknown;
  error?: string | undefined;
}

export interface UltraMsgMeResult {
  ok: boolean;
  id?: string | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  error?: string | undefined;
}

export interface UltraMsgSendChatOptions {
  to: string;
  body: string;
  priority?: number | undefined; // 0 = urgent/OTP, 5 = reminders/billing, 10 = queue/promotional
  referenceId?: string | undefined;
  credentials?: UltraMsgCredentials | undefined;
}

export interface UltraMsgSendResult {
  ok: boolean;
  sent: boolean;
  id?: string | undefined;
  message?: string | undefined;
  error?: string | undefined;
}

export interface UltraMsgCheckContactResult {
  ok: boolean;
  isWhatsApp: boolean;
  status?: string | undefined;
  error?: string | undefined;
}

export const DEFAULT_ULTRAMSG_URL = 'https://api.ultramsg.com/instance196299/';
export const DEFAULT_ULTRAMSG_TOKEN = 'mkojxebwykcncp10';
export const DEFAULT_ULTRAMSG_PHONE = '967771147694';

function resolveEndpoint(path: string, credentials?: UltraMsgCredentials | undefined): { url: string; token: string } {
  const rawUrl = credentials?.url && credentials.url.trim() !== '' ? credentials.url.trim() : DEFAULT_ULTRAMSG_URL;
  const token = credentials?.token && credentials.token.trim() !== '' ? credentials.token.trim() : DEFAULT_ULTRAMSG_TOKEN;
  const cleanUrl = rawUrl.replace(/\/+$/, '');
  const finalPath = path.replace(/^\/+/, '');
  return {
    url: `${cleanUrl}/${finalPath}`,
    token,
  };
}

export const ultraMsgService = {
  /**
   * Normalizes phone numbers to standard WhatsApp format (e.g. 967XXXXXXXXX).
   */
  formatToPhone(rawPhone: string): string {
    const digits = rawPhone.replace(/[^\d]/g, '');
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `967${digits.slice(1)}`;
    if (digits.length === 9) return `967${digits}`;
    return digits;
  },

  /**
   * Extracts instance ID (e.g. instance196299) from API URL.
   */
  extractInstanceId(url?: string | undefined): string {
    if (!url) return 'instance196299';
    const match = url.match(/instance\d+/i);
    return match ? match[0] : 'instance196299';
  },

  /**
   * Queries instance connection status (e.g. authenticated, standby, qr).
   */
  async getStatus(credentials?: UltraMsgCredentials | undefined): Promise<UltraMsgStatusResult> {
    try {
      const { url, token } = resolveEndpoint('instance/status', credentials);
      const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        status?: { accountStatus?: { status?: string; substatus?: string } };
        error?: string;
      } | null;

      if (!res.ok) {
        return {
          ok: false,
          status: 'disconnected',
          error: data?.error || `HTTP ${res.status}`,
        };
      }

      const accStatus = data?.status?.accountStatus?.status;
      const substatus = data?.status?.accountStatus?.substatus;

      let normalizedStatus: UltraMsgStatusResult['status'] = 'unknown';
      if (accStatus === 'authenticated') normalizedStatus = 'authenticated';
      else if (accStatus === 'standby') normalizedStatus = 'standby';
      else if (accStatus === 'qr') normalizedStatus = 'qr';
      else if (accStatus === 'loading') normalizedStatus = 'loading';
      else if (accStatus === 'disconnected') normalizedStatus = 'disconnected';

      return {
        ok: true,
        status: normalizedStatus,
        ...(substatus ? { substatus } : {}),
        raw: data,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'disconnected',
        error: (err as Error).message || 'Connection error',
      };
    }
  },

  /**
   * Returns information about the connected WhatsApp account (or error if not connected).
   */
  async getMe(credentials?: UltraMsgCredentials | undefined): Promise<UltraMsgMeResult> {
    try {
      const { url, token } = resolveEndpoint('instance/me', credentials);
      const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        id?: string;
        name?: string;
        phone?: string;
        error?: string;
      } | null;

      if (!res.ok || data?.error) {
        return {
          ok: false,
          error: data?.error || `HTTP ${res.status}`,
        };
      }

      return {
        ok: true,
        ...(data?.id ? { id: data.id } : {}),
        ...(data?.name ? { name: data.name } : {}),
        ...(data?.phone ? { phone: data.phone } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message,
      };
    }
  },

  /**
   * Returns live QR code image URL for scanning and pairing.
   */
  getQrImageUrl(credentials?: UltraMsgCredentials | undefined): string {
    const { url, token } = resolveEndpoint('instance/qr', credentials);
    return `${url}?token=${encodeURIComponent(token)}&t=${Date.now()}`;
  },

  /**
   * Restarts the WhatsApp instance session.
   */
  async restartInstance(credentials?: UltraMsgCredentials | undefined): Promise<{ ok: boolean; error?: string | undefined }> {
    try {
      const { url, token } = resolveEndpoint('instance/restart', credentials);
      const params = new URLSearchParams({ token });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || data?.error) {
        return { ok: false, error: data?.error || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  /**
   * Checks whether a phone number is registered on WhatsApp.
   */
  async checkContact(rawPhone: string, credentials?: UltraMsgCredentials | undefined): Promise<UltraMsgCheckContactResult> {
    const clean = this.formatToPhone(rawPhone);
    if (!clean) return { ok: false, isWhatsApp: false, error: 'رقم هاتف غير صالح' };

    try {
      const { url, token } = resolveEndpoint('contacts/check', credentials);
      const res = await fetch(`${url}?token=${encodeURIComponent(token)}&chatId=${encodeURIComponent(clean)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        status?: string;
        error?: string;
      } | null;

      if (!res.ok || data?.error) {
        return { ok: false, isWhatsApp: false, error: data?.error || `HTTP ${res.status}` };
      }

      return {
        ok: true,
        isWhatsApp: data?.status === 'valid',
        status: data?.status,
      };
    } catch (err) {
      return { ok: false, isWhatsApp: false, error: (err as Error).message };
    }
  },

  /**
   * Sends a direct text message via UltraMsg with priority and reference tracking.
   */
  async sendChatMessage(options: UltraMsgSendChatOptions): Promise<UltraMsgSendResult> {
    const cleanTo = this.formatToPhone(options.to);
    if (!cleanTo || cleanTo.length < 8) {
      return { ok: false, sent: false, error: 'رقم هاتف العميل غير صالح للإرسال' };
    }

    try {
      const { url, token } = resolveEndpoint('messages/chat', options.credentials);
      const params = new URLSearchParams({
        token,
        to: cleanTo,
        body: options.body,
        priority: String(options.priority ?? 5),
        referenceId: options.referenceId || '',
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = (await res.json().catch(() => null)) as {
        sent?: string | boolean;
        message?: string;
        id?: number | string;
        error?: string;
      } | null;

      const isSent = Boolean(res.ok && (data?.sent === 'true' || data?.sent === true));
      return {
        ok: res.ok,
        sent: isSent,
        ...(data?.id !== undefined ? { id: String(data.id) } : {}),
        ...(data?.message ? { message: data.message } : {}),
        ...(!isSent ? { error: data?.error || data?.message || `HTTP ${res.status}` } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        sent: false,
        error: (err as Error).message || 'خطأ في الاتصال ببوابة UltraMsg',
      };
    }
  },
};

