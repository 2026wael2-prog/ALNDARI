import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { chatwootWidgetApi, type ChatwootPartySummary } from '../api/chatwootWidgetApi';
import { useAuthStore } from '@/features/auth/store';
import { formatLocalDate } from '@/core/utils/dateUtils';
import {
  buildCustomerSummaryText,
  extractInitialPhoneFromLocation,
  extractPhoneFromMessageData,
  hasNonEmptyString,
  isTrustedMessageEvent,
  type PromiseFormState,
  type RecentPartyItem,
} from '../utils/chatwootHelpers';

export interface ChatwootWidgetController {
  isStandalone: boolean;
  phoneQuery: string;
  setPhoneQuery: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  data: ChatwootPartySummary | null;
  notFound: boolean;
  copiedSummary: boolean;
  copiedWidgetUrl: boolean;
  recentParties: RecentPartyItem[];
  showPromiseForm: boolean;
  setShowPromiseForm: React.Dispatch<React.SetStateAction<boolean>>;
  promiseForm: PromiseFormState;
  setPromiseAmount: React.Dispatch<React.SetStateAction<string>>;
  setPromiseCurrency: React.Dispatch<React.SetStateAction<string>>;
  setPromiseDate: React.Dispatch<React.SetStateAction<string>>;
  setPromiseNotes: React.Dispatch<React.SetStateAction<string>>;
  promiseFeedback: string | null;
  fetchCustomer: (query: string) => Promise<void>;
  handleCopySummary: () => void;
  handleOpenWhatsAppWeb: () => void;
  handleCopyWidgetUrl: () => void;
  handleAddPromise: (e: React.SyntheticEvent) => Promise<void>;
}

export function useChatwootWidgetController(): ChatwootWidgetController {
  const companyId = useAuthStore(s => s.user?.company_id ?? '');
  const location = useLocation();
  const isStandalone = location.pathname.includes('chatwoot-widget');

  const [phoneQuery, setPhoneQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<ChatwootPartySummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedWidgetUrl, setCopiedWidgetUrl] = useState(false);
  const [recentParties, setRecentParties] = useState<RecentPartyItem[]>([]);

  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseCurrency, setPromiseCurrency] = useState('YER');
  const [promiseDate, setPromiseDate] = useState(() => formatLocalDate());
  const [promiseNotes, setPromiseNotes] = useState('');
  const [isSubmittingPromise, setIsSubmittingPromise] = useState(false);
  const [promiseFeedback, setPromiseFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (companyId.length === 0) {
      setRecentParties([]);
      return;
    }
    void chatwootWidgetApi.getRecentParties(companyId).then(setRecentParties);
  }, [companyId]);

  const fetchCustomer = useCallback(
    async (query: string): Promise<void> => {
      const trimmed = query.trim();
      if (trimmed.length < 2 || companyId.length === 0) return;
      setIsLoading(true);
      setNotFound(false);
      try {
        const result = await chatwootWidgetApi.findParty(trimmed, companyId);
        if (result) {
          setData(result);
          setPromiseCurrency(result.balances[0]?.currency_code ?? 'YER');
        } else {
          setData(null);
          setNotFound(true);
        }
      } catch {
        setData(null);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    const initialPhone = extractInitialPhoneFromLocation();
    if (initialPhone !== null) {
      setPhoneQuery(initialPhone);
      void fetchCustomer(initialPhone);
    }
  }, [fetchCustomer]);

  useEffect(() => {
    const handleChatwootMessage = (event: MessageEvent): void => {
      if (!isTrustedMessageEvent(event)) return;
      const cleanPhone = extractPhoneFromMessageData(event.data);
      if (cleanPhone !== null) {
        setPhoneQuery(cleanPhone);
        void fetchCustomer(cleanPhone);
      }
    };

    window.addEventListener('message', handleChatwootMessage);
    return () => {
      window.removeEventListener('message', handleChatwootMessage);
    };
  }, [fetchCustomer]);

  const getSummaryText = useCallback(
    (): string => (data ? buildCustomerSummaryText(data) : ''),
    [data]
  );

  const handleCopySummary = (): void => {
    if (!data) return;
    void navigator.clipboard.writeText(getSummaryText());
    setCopiedSummary(true);
    setTimeout(() => {
      setCopiedSummary(false);
    }, 2000);
  };

  const handleOpenWhatsAppWeb = (): void => {
    if (hasNonEmptyString(data?.party.phone)) {
      const cleanDigits = data.party.phone.replace(/[^0-9]/g, '');
      const text = encodeURIComponent(getSummaryText());
      window.open(
        `https://web.whatsapp.com/send?phone=${cleanDigits}&text=${text}`,
        '_blank',
        'noopener,noreferrer'
      );
    } else {
      window.open('https://web.whatsapp.com', '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyWidgetUrl = (): void => {
    const widgetUrl = `${window.location.origin}/#/chatwoot-widget`;
    void navigator.clipboard.writeText(widgetUrl);
    setCopiedWidgetUrl(true);
    setTimeout(() => {
      setCopiedWidgetUrl(false);
    }, 2000);
  };

  const handleAddPromise = async (e: React.SyntheticEvent): Promise<void> => {
    e.preventDefault();
    if (!data || promiseAmount.length === 0 || Number(promiseAmount) <= 0) return;

    setIsSubmittingPromise(true);
    setPromiseFeedback(null);
    try {
      const notesTrimmed = promiseNotes.trim();
      const res = await chatwootWidgetApi.recordPaymentPromise({
        companyId: data.party.company_id,
        partyId: data.party.id,
        amount: Number(promiseAmount),
        currencyCode: promiseCurrency,
        promiseDate,
        notes: notesTrimmed.length > 0 ? notesTrimmed : undefined,
      });

      if (res.success) {
        setPromiseFeedback('تم تسجيل وعد السداد بنجاح ✅');
        setShowPromiseForm(false);
        setPromiseAmount('');
        setPromiseNotes('');
        const targetQuery = hasNonEmptyString(data.party.phone) ? data.party.phone : phoneQuery;
        void fetchCustomer(targetQuery);
      } else {
        setPromiseFeedback(`فشل التسجيل: ${res.error ?? 'خطأ'}`);
      }
    } finally {
      setIsSubmittingPromise(false);
    }
  };

  return {
    isStandalone,
    phoneQuery,
    setPhoneQuery,
    isLoading,
    data,
    notFound,
    copiedSummary,
    copiedWidgetUrl,
    recentParties,
    showPromiseForm,
    setShowPromiseForm,
    promiseForm: {
      amount: promiseAmount,
      currency: promiseCurrency,
      date: promiseDate,
      notes: promiseNotes,
      isSubmitting: isSubmittingPromise,
    },
    setPromiseAmount,
    setPromiseCurrency,
    setPromiseDate,
    setPromiseNotes,
    promiseFeedback,
    fetchCustomer,
    handleCopySummary,
    handleOpenWhatsAppWeb,
    handleCopyWidgetUrl,
    handleAddPromise,
  };
}
