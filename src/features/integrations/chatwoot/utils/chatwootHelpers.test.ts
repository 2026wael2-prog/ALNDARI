import { describe, expect, it } from 'vitest';
import {
  buildCustomerSummaryText,
  extractPhoneFromMessageData,
  getBalanceToneClass,
  getPartyTypeLabel,
  hasNonEmptyString,
  isTrustedMessageEvent,
} from './chatwootHelpers';

describe('chatwootHelpers', () => {
  it('validates non-empty strings strictly', () => {
    expect(hasNonEmptyString('777123456')).toBe(true);
    expect(hasNonEmptyString('')).toBe(false);
    expect(hasNonEmptyString(null)).toBe(false);
    expect(hasNonEmptyString(undefined)).toBe(false);
  });

  it('extracts valid phone numbers from Chatwoot appContext payloads and rejects invalid ones', () => {
    const jsonPayload = JSON.stringify({
      event: 'appContext',
      data: { contact: { phone_number: ' +967777123456 ' } },
    });
    expect(extractPhoneFromMessageData(jsonPayload)).toBe('+967777123456');

    expect(
      extractPhoneFromMessageData({
        event: 'otherEvent',
        data: { contact: { phone_number: '+967777123456' } },
      })
    ).toBeNull();

    expect(
      extractPhoneFromMessageData({
        event: 'appContext',
        data: { contact: { phone_number: '123' } },
      })
    ).toBeNull();

    expect(extractPhoneFromMessageData('{not-json')).toBeNull();
  });

  it('enforces origin trust checks on MessageEvent', () => {
    const sameOriginEvent = new MessageEvent('message', { origin: window.location.origin });
    expect(isTrustedMessageEvent(sameOriginEvent)).toBe(true);

    const untrustedEvent = new MessageEvent('message', { origin: 'https://evil.example.com' });
    expect(isTrustedMessageEvent(untrustedEvent)).toBe(false);

    const nullOriginEvent = new MessageEvent('message', { origin: 'null' });
    expect(isTrustedMessageEvent(nullOriginEvent)).toBe(false);
  });

  it('formats party type labels, balance tone classes, and WhatsApp summary text', () => {
    expect(getPartyTypeLabel('customer')).toBe('عميل');
    expect(getPartyTypeLabel('supplier')).toBe('مورد');
    expect(getPartyTypeLabel('both')).toBe('عميل ومورد');

    expect(getBalanceToneClass(150)).toContain('rose');
    expect(getBalanceToneClass(-50)).toContain('emerald');
    expect(getBalanceToneClass(0)).toContain('slate');

    const summary = buildCustomerSummaryText({
      party: {
        id: 'p1',
        company_id: 'comp-1',
        name: 'شركة النور',
        phone: '777000111',
        type: 'customer',
        tax_number: null,
        credit_limit: null,
      },
      balances: [{ currency_code: 'SAR', balance: 1250 }],
      recentInvoices: [],
      pendingPromises: [],
    });
    expect(summary).toContain('شركة النور');
    expect(summary).toContain('SAR');
  });
});
