import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AccountingView } from '../types';
import { formatLocalDate, getLocalYearStart } from '../../../core/utils';

const VALID_VIEWS: ReadonlySet<AccountingView> = new Set([
  'overview',
  'journal',
  'treasury',
  'ledger',
  'income',
  'balance_sheet',
  'accounts',
  'assets',
  'vat_return',
]);

export const useAccountingView = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as AccountingView | null;
  const initialView: AccountingView =
    tabParam && VALID_VIEWS.has(tabParam) ? tabParam : 'overview';

  const [activeView, setActiveView] = useState<AccountingView>(initialView);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: getLocalYearStart(),
    to: formatLocalDate(),
  });

  useEffect(() => {
    if (tabParam && VALID_VIEWS.has(tabParam)) {
      setActiveView(tabParam);
    }
  }, [tabParam]);

  const openJournalModal = () => {
    setIsModalOpen(true);
  };
  const closeJournalModal = () => {
    setIsModalOpen(false);
  };

  return {
    activeView,
    setActiveView,
    isModalOpen,
    openJournalModal,
    closeJournalModal,
    dateRange,
    setDateRange,
  };
};
