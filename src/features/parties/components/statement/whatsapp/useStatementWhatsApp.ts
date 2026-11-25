import type React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { hasValidWhatsAppPhone } from '../../../../../core/utils/whatsapp';
import { useFeedbackStore } from '../../../../feedback/store';
import { debtAiService } from '../../../../debts/services/debtAiService';
import type { CompanyInfo, StatementEntry } from '../../../utils/statementExcelExporter';
import type { StatementMovement } from '../../../service';
import type { Party, PartyType } from '../../../types';
import {
  buildBankInfoLabel,
  buildDateRangeLabel,
  formatToPhone,
  hasTextValue,
  summarizeByCurrency,
  toAmount,
  type CurrencySummary,
} from './statementWhatsAppUtils';
import { useStatementMediaHandlers } from './useStatementMediaHandlers';
import { useStatementDirectSendHandlers } from './useStatementDirectSendHandlers';

export { formatToPhone, summarizeByCurrency, toAmount, type CurrencySummary };

export interface UseStatementWhatsAppParams {
  party: Party;
  partyType: PartyType;
  movements: StatementMovement[];
  startDate?: string | undefined;
  endDate?: string | undefined;
  company: CompanyInfo;
  companyNameAr: string;
}

export interface UseStatementWhatsAppResult {
  activeTab: 'pdf' | 'excel' | 'image' | 'text';
  setActiveTab: React.Dispatch<React.SetStateAction<'pdf' | 'excel' | 'image' | 'text'>>;
  phone: string;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  isValidPhone: boolean;
  isExportingExcel: boolean;
  isCapturingImage: boolean;
  isSendingDirect: boolean;
  copiedType: 'text' | 'image' | null;
  gridImageRef: React.RefObject<HTMLDivElement | null>;
  sarMovements: StatementMovement[];
  yerMovements: StatementMovement[];
  sarSummary: CurrencySummary | undefined;
  yerSummary: CurrencySummary | undefined;
  dateRangeText: string;
  bankInfoText: string | undefined;
  whatsappMessage: string;
  handleShareExcel: () => Promise<void>;
  handleDownloadExcel: () => Promise<void>;
  handleCopyGridImage: () => Promise<void>;
  handleDownloadGridImage: () => Promise<void>;
  handleSendDirectUltraMsg: () => Promise<void>;
  handleSendGridImageDirectUltraMsg: () => Promise<void>;
  handleCopyText: () => Promise<void>;
  handleOpenWhatsAppWeb: () => void;
  handleOpenWhatsAppApp: () => void;
}

export const useStatementWhatsApp = ({
  party,
  partyType,
  movements,
  startDate,
  endDate,
  company,
  companyNameAr,
}: UseStatementWhatsAppParams): UseStatementWhatsAppResult => {
  const { showToast } = useFeedbackStore();
  const [activeTab, setActiveTab] = useState<'pdf' | 'excel' | 'image' | 'text'>('pdf');
  const [phone, setPhone] = useState(party.phone ?? '');
  const [copiedType, setCopiedType] = useState<'text' | 'image' | null>(null);
  const gridImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasTextValue(party.phone)) setPhone(party.phone);
  }, [party.phone]);

  const currencySummaries = useMemo(() => summarizeByCurrency(movements), [movements]);
  const sarMovements = useMemo(
    () => movements.filter(m => (m.currency || 'SAR').trim().toUpperCase() === 'SAR'),
    [movements]
  );
  const yerMovements = useMemo(
    () => movements.filter(m => (m.currency || 'SAR').trim().toUpperCase() === 'YER'),
    [movements]
  );
  const sarSummary = useMemo(
    () => currencySummaries.find(c => c.currency === 'SAR'),
    [currencySummaries]
  );
  const yerSummary = useMemo(
    () => currencySummaries.find(c => c.currency === 'YER'),
    [currencySummaries]
  );

  const statementEntries: StatementEntry[] = useMemo(
    () =>
      movements.map(r => ({
        date: r.date,
        operation_type: r.operation_type ?? '',
        reference_no: r.ref,
        desc: r.desc,
        debit: toAmount(r.debit),
        credit: toAmount(r.credit),
        balance: toAmount(r.balance),
        payment_status: r.payment_status,
        currency: r.currency || 'SAR',
      })),
    [movements]
  );

  const dateRangeText = useMemo(
    () => buildDateRangeLabel(startDate, endDate),
    [startDate, endDate]
  );
  const bankInfoText = useMemo(() => buildBankInfoLabel(company), [company]);

  const whatsappMessage = useMemo(
    () =>
      debtAiService.generateWhatsAppStatementSummary({
        partyName: party.name,
        companyName: companyNameAr,
        dateRangeText,
        ...(hasTextValue(bankInfoText) ? { bankInfo: bankInfoText } : {}),
        currencies: currencySummaries.map(c => ({
          currency: c.currency,
          totalDebit: c.totalDebit,
          totalCredit: c.totalCredit,
          finalBalance: c.finalBalance,
        })),
        movements: movements.slice(-10).map(m => ({
          date: m.date,
          ref: m.ref,
          desc: m.desc,
          debit: m.debit,
          credit: m.credit,
          balance: m.balance,
          currency: m.currency,
        })),
      }),
    [party.name, companyNameAr, dateRangeText, bankInfoText, currencySummaries, movements]
  );

  const isValidPhone = hasValidWhatsAppPhone(phone);

  const mediaHandlers = useStatementMediaHandlers({
    company,
    partyName: party.name,
    partyType,
    phone,
    isValidPhone,
    startDate,
    endDate,
    statementEntries,
    whatsappMessage,
    gridImageRef,
    setCopiedType,
    showToast,
  });

  const directSendHandlers = useStatementDirectSendHandlers({
    party,
    companyNameAr,
    phone,
    isValidPhone,
    whatsappMessage,
    gridImageRef,
    setCopiedType,
    showToast,
  });

  return {
    activeTab,
    setActiveTab,
    phone,
    setPhone,
    isValidPhone,
    copiedType,
    gridImageRef,
    sarMovements,
    yerMovements,
    sarSummary,
    yerSummary,
    dateRangeText,
    bankInfoText,
    whatsappMessage,
    ...mediaHandlers,
    ...directSendHandlers,
  };
};
