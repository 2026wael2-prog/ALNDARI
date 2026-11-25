import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../auth/store';
import { bondsService } from '../../bonds/service';
import type { Bond } from '../../bonds/types';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings } from '../../settings/settingsStore';
import { useParties, useStatement } from '../hooks';
import type { StatementMovement } from '../service';
import type { PartyType } from '../types';

export type StatementSettlementFilter =
  | 'unsettled'
  | 'all'
  | 'fully_settled'
  | 'partially_settled'
  | 'credit'
  | 'cash';

interface UseStatementControllerParams {
  partyType: PartyType;
  initialPartyId?: string | undefined;
  initialCurrency?: string | undefined;
}

interface PersistedStatementState {
  partyId: string;
  currency: string;
  startDate: string;
  endDate: string;
}

const buildStatementStateKey = (companyId: string, partyType: PartyType) =>
  `erp_last_statement_state_${companyId}_${partyType}`;

const readPersistedStatementState = (key: string): PersistedStatementState | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedStatementState>;
    return {
      partyId: typeof parsed.partyId === 'string' ? parsed.partyId : '',
      currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : 'ALL',
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
      endDate: typeof parsed.endDate === 'string' ? parsed.endDate : '',
    };
  } catch {
    return null;
  }
};

const writePersistedStatementState = (key: string, state: PersistedStatementState) => {
  try {
    if (!state.partyId) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(state));
    }
  } catch {
    // ignore quota errors
  }
};

const applyColorToKeys = (
  colorMap: Map<string, string>,
  keys: Array<string | undefined | null>,
  color: string | null
) => {
  keys.forEach(key => {
    if (!key) return;
    if (color) {
      colorMap.set(key, color);
    } else {
      colorMap.delete(key);
    }
  });
};

const toggleIdInSet = (
  setter: Dispatch<SetStateAction<Set<string>>>,
  id: string,
  e?: MouseEvent
) => {
  e?.stopPropagation();
  setter(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
};

const persistRowColors = (storageKey: string | null, colorMap: Map<string, string>) => {
  if (!storageKey) return;
  try {
    if (colorMap.size === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(colorMap.entries())));
    }
  } catch (err) {
    console.error('Failed to save statement row colors to storage:', err);
  }
};

/** Controller hook managing statement state, filtering, row coloring, printing, and exports. */
export const useStatementController = ({
  partyType,
  initialPartyId,
  initialCurrency,
}: UseStatementControllerParams) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  const companyId =
    settingsCompany?.id || useAuthStore.getState().user?.company_id || 'default_co';
  const persistedStateKey = buildStatementStateKey(companyId, partyType);

  // Restore last opened customer statement from URL params OR localStorage so reload/app update never loses it
  const initialHydrated = useMemo(() => {
    const saved = readPersistedStatementState(persistedStateKey);
    const urlParty = searchParams.get('party') || '';
    const urlCurrency = searchParams.get('currency') || '';
    const urlFrom = searchParams.get('from') || '';
    const urlTo = searchParams.get('to') || '';
    return {
      partyId: initialPartyId || urlParty || saved?.partyId || '',
      currency:
        (initialCurrency && initialCurrency !== 'ALL' ? initialCurrency : '') ||
        urlCurrency ||
        saved?.currency ||
        'ALL',
      startDate: urlFrom || saved?.startDate || '',
      endDate: urlTo || saved?.endDate || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount hydration only
  }, []);

  const [selectedPartyId, setSelectedPartyId] = useState<string>(initialHydrated.partyId);
  const [activeTab, setActiveTab] = useState<'statement' | 'rent'>('statement');
  const [startDate, setStartDate] = useState(initialHydrated.startDate);
  const [endDate, setEndDate] = useState(initialHydrated.endDate);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialHydrated.currency);
  const [settlementFilter, setSettlementFilter] = useState<StatementSettlementFilter>('unsettled');
  const [searchQuery, setSearchQuery] = useState('');
  const prevInitialPartyRef = useRef<string | undefined>(initialPartyId);
  const prevInitialCurrencyRef = useRef<string | undefined>(initialCurrency);

  // Re-hydrate from localStorage if companyId resolves after mount and no party is selected yet
  useEffect(() => {
    if (selectedPartyId) return;
    const saved = readPersistedStatementState(persistedStateKey);
    if (saved?.partyId) {
      setSelectedPartyId(saved.partyId);
      if (saved.currency) setSelectedCurrency(saved.currency);
      if (saved.startDate) setStartDate(saved.startDate);
      if (saved.endDate) setEndDate(saved.endDate);
    }
  }, [persistedStateKey, selectedPartyId]);

  useEffect(() => {
    if (initialPartyId && initialPartyId !== prevInitialPartyRef.current) {
      prevInitialPartyRef.current = initialPartyId;
      setSelectedPartyId(initialPartyId);
    }
  }, [initialPartyId]);

  useEffect(() => {
    if (initialCurrency && initialCurrency !== prevInitialCurrencyRef.current) {
      prevInitialCurrencyRef.current = initialCurrency;
      setSelectedCurrency(initialCurrency);
    }
  }, [initialCurrency]);

  // Persist active statement selection to BOTH localStorage and URL search params
  useEffect(() => {
    writePersistedStatementState(persistedStateKey, {
      partyId: selectedPartyId,
      currency: selectedCurrency,
      startDate,
      endDate,
    });

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'statements');
        if (selectedPartyId) next.set('party', selectedPartyId);
        else next.delete('party');

        if (selectedCurrency && selectedCurrency !== 'ALL') next.set('currency', selectedCurrency);
        else next.delete('currency');

        if (startDate) next.set('from', startDate);
        else next.delete('from');

        if (endDate) next.set('to', endDate);
        else next.delete('to');

        return next.toString() === prev.toString() ? prev : next;
      },
      { replace: true }
    );
  }, [persistedStateKey, selectedPartyId, selectedCurrency, startDate, endDate, setSearchParams]);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [rowColors, setRowColors] = useState<Map<string, string>>(new Map());
  const [activeColorPickerRowId, setActiveColorPickerRowId] = useState<string | null>(null);
  const [isPrintingSelectedOnly, setIsPrintingSelectedOnly] = useState(false);

  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [activeBond, setActiveBond] = useState<Bond | null>(null);
  const [isBondModalOpen, setIsBondModalOpen] = useState(false);

  const { data: parties } = useParties(partyType);
  const { data: statement, isLoading } = useStatement(selectedPartyId, partyType, {
    startDate,
    endDate,
    currencyCode: selectedCurrency,
  });

  const storageKey = selectedPartyId
    ? `erp_statement_row_colors_${companyId}_${selectedPartyId}`
    : null;

  useEffect(() => {
    if (!storageKey) {
      setRowColors(new Map());
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        setRowColors(new Map(Object.entries(parsed)));
      } else {
        setRowColors(new Map());
      }
    } catch (err) {
      console.error('Failed to load statement row colors from storage:', err);
      setRowColors(new Map());
    }
  }, [storageKey]);

  useEffect(() => {
    if (!activeColorPickerRowId) return;
    const handleClickOutside = () => setActiveColorPickerRowId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeColorPickerRowId]);

  const selectedParty = parties?.find(p => p.id === selectedPartyId);
  const movements = useMemo(() => statement || [], [statement]);

  const isRentParty = useMemo(() => {
    const name = (selectedParty?.name ?? '').toLowerCase();
    return (
      name.includes('إيجار') ||
      name.includes('ايجار') ||
      movements.some(m => (m.desc ?? '').includes('استحقاق إيجار'))
    );
  }, [selectedParty, movements]);

  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    (selectedParty?.balances_by_currency ?? []).forEach(bc => {
      if (bc.currency) currencies.add(bc.currency.toUpperCase());
    });
    movements.forEach(m => {
      if (m.currency) currencies.add(m.currency.toUpperCase());
    });
    return Array.from(currencies).sort((a, b) => (a === 'SAR' ? -1 : b === 'SAR' ? 1 : a.localeCompare(b)));
  }, [movements, selectedParty?.balances_by_currency]);

  const settlementStats = useMemo(() => {
    let fullySettledCount = 0;
    let partiallySettledCount = 0;
    let creditCount = 0;
    let cashCount = 0;
    let unsettledCount = 0;

    movements.forEach(m => {
      const isInv = Boolean(
        m.type?.includes('invoice') ||
          m.type?.includes('sale') ||
          m.type?.includes('purchase') ||
          m.operation_type?.includes('فاتورة')
      );

      const isFullyPaid =
        m.payment_status === 'paid' ||
        m.payment_status === 'settled' ||
        (isInv && (Number(m.remaining_amount) || 0) <= 0.01 && (Number(m.paid_amount) || 0) > 0);

      const isPartiallyPaid =
        m.payment_status === 'partial' ||
        m.payment_status === 'partially_paid' ||
        (isInv && (Number(m.paid_amount) || 0) > 0.01 && (Number(m.remaining_amount) || 0) > 0.01);

      const isCredit =
        (m.payment_method && m.payment_method.toLowerCase() === 'credit') ||
        (!m.payment_method && isInv && (Number(m.remaining_amount) || 0) > 0) ||
        Boolean(m.desc?.includes('آجل') || m.operation_type?.includes('آجل'));

      const isCash =
        (m.payment_method && m.payment_method.toLowerCase() === 'cash') ||
        Boolean(m.desc?.includes('نقدي') || m.operation_type?.includes('نقدي'));

      if (isFullyPaid) fullySettledCount++;
      if (isPartiallyPaid) partiallySettledCount++;
      if (isCredit) creditCount++;
      if (isCash) cashCount++;
      if (!isInv || !isFullyPaid) unsettledCount++;
    });

    return {
      totalCount: movements.length,
      unsettledCount,
      fullySettledCount,
      partiallySettledCount,
      creditCount,
      cashCount,
    };
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return movements.filter(m => {
      // 1. Currency filter
      if (selectedCurrency !== 'ALL' && m.currency !== selectedCurrency) {
        return false;
      }

      // 2. Settlement / Status filter
      const isInv = Boolean(
        m.type?.includes('invoice') ||
          m.type?.includes('sale') ||
          m.type?.includes('purchase') ||
          m.operation_type?.includes('فاتورة')
      );

      const isFullyPaid =
        m.payment_status === 'paid' ||
        m.payment_status === 'settled' ||
        (isInv && (Number(m.remaining_amount) || 0) <= 0.01 && (Number(m.paid_amount) || 0) > 0);

      const isPartiallyPaid =
        m.payment_status === 'partial' ||
        m.payment_status === 'partially_paid' ||
        (isInv && (Number(m.paid_amount) || 0) > 0.01 && (Number(m.remaining_amount) || 0) > 0.01);

      const isCredit =
        (m.payment_method && m.payment_method.toLowerCase() === 'credit') ||
        (!m.payment_method && isInv && (Number(m.remaining_amount) || 0) > 0) ||
        Boolean(m.desc?.includes('آجل') || m.operation_type?.includes('آجل'));

      const isCash =
        (m.payment_method && m.payment_method.toLowerCase() === 'cash') ||
        Boolean(m.desc?.includes('نقدي') || m.operation_type?.includes('نقدي'));

      if (settlementFilter === 'unsettled') {
        // Hide fully paid invoices by default to focus on remaining transactions
        if (isInv && isFullyPaid) return false;
      } else if (settlementFilter === 'fully_settled') {
        if (!isFullyPaid) return false;
      } else if (settlementFilter === 'partially_settled') {
        if (!isPartiallyPaid) return false;
      } else if (settlementFilter === 'credit') {
        if (!isCredit) return false;
      } else if (settlementFilter === 'cash') {
        if (!isCash) return false;
      }

      // 3. Search query filter
      if (!query) return true;
      return Boolean(
        m.ref?.toLowerCase().includes(query) ||
          m.desc?.toLowerCase().includes(query) ||
          m.operation_type?.toLowerCase().includes(query)
      );
    });
  }, [movements, selectedCurrency, settlementFilter, searchQuery]);

  const selectedMovements = useMemo(
    () => filteredMovements.filter(m => selectedRowIds.has(m.id)),
    [filteredMovements, selectedRowIds]
  );

  const company = useMemo(
    () => ({
      nameAr:
        invoiceSettings?.company_name_ar || settingsCompany?.name_ar || 'منظومة الجعفري المحاسبية',
      nameEn: invoiceSettings?.company_name_en || settingsCompany?.name_en || 'Al-Jaafari ERP',
      address: invoiceSettings?.company_address || settingsCompany?.address || '',
      phone: invoiceSettings?.company_phone || settingsCompany?.phone || '',
      taxNumber: settingsCompany?.tax_number || '---',
      specialization: invoiceSettings?.company_specialization || '',
      headerText: invoiceSettings?.invoice_header_text || '',
    }),
    [invoiceSettings, settingsCompany]
  );

  const isAllSelected =
    filteredMovements.length > 0 && selectedRowIds.size === filteredMovements.length;

  const handleSelectPartyId = (id: string) => {
    setSelectedPartyId(id);
    setSelectedCurrency('ALL');
    setSelectedRowIds(new Set());
    setExpandedRowIds(new Set());
  };

  const handleToggleSelectAll = () => {
    if (selectedRowIds.size === filteredMovements.length && filteredMovements.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredMovements.map(m => m.id)));
    }
  };

  const handleToggleRowSelection = (id: string, e?: MouseEvent) =>
    toggleIdInSet(setSelectedRowIds, id, e);

  const handleToggleRowExpand = (id: string, e?: MouseEvent) =>
    toggleIdInSet(setExpandedRowIds, id, e);

  const handleApplyColorToSingleRow = (movement: StatementMovement, color: string | null) => {
    setRowColors(prev => {
      const next = new Map(prev);
      applyColorToKeys(next, [movement.id, movement.reference_id, movement.ref], color);
      persistRowColors(storageKey, next);
      return next;
    });
    setActiveColorPickerRowId(null);
  };

  const handleApplyColorToSelected = (color: string | null) => {
    setRowColors(prev => {
      const next = new Map(prev);
      selectedRowIds.forEach(id => {
        const mov = filteredMovements.find(m => m.id === id);
        applyColorToKeys(next, [id, mov?.reference_id, mov?.ref], color);
      });
      persistRowColors(storageKey, next);
      return next;
    });
  };

  const handleOpenBondModal = async (bondId: string, movement: StatementMovement) => {
    try {
      const bond = await bondsService.getBondById(bondId);
      if (bond) {
        setActiveBond(bond);
        setIsBondModalOpen(true);
        return;
      }
    } catch {
      // Fall back to constructing a read-only bond view from the statement row.
    }

    setActiveBond({
      id: bondId,
      payment_number: movement.ref,
      date: movement.date,
      description: movement.desc || '',
      amount: movement.debit || movement.credit,
      currency_code: movement.currency,
      type: movement.debit > 0 ? 'receipt' : 'payment',
      party_name: selectedParty?.name || '',
      account_name: '',
      status: 'posted',
    });
    setIsBondModalOpen(true);
  };

  const handlePrintSingleTransaction = (m: StatementMovement) => {
    if (!m.reference_id) return;
    const type = m.reference_type || m.type;
    if (type?.includes('invoice')) {
      setActiveInvoiceId(m.reference_id);
    } else if (
      type?.includes('bond') ||
      type?.includes('receipt') ||
      type?.includes('payment')
    ) {
      void handleOpenBondModal(m.reference_id, m);
    }
  };

  const handlePrintSelectedStatement = () => {
    setIsPrintingSelectedOnly(true);
    setTimeout(() => {
      window.print();
      setIsPrintingSelectedOnly(false);
    }, 150);
  };

  const handleExportSelectedExcel = async () => {
    if (!selectedParty || !statement) return;
    const { exportStatementToExcel } = await import('../utils/statementExcelExporter');
    const companyObj = {
      name_ar: company.nameAr,
      address: company.address,
      phone: company.phone,
      tax_number: company.taxNumber,
    };

    const entries = selectedMovements.map(r => ({
      date: r.date,
      operation_type: r.operation_type ?? '',
      reference_no: r.ref,
      desc: r.desc,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      balance: Number(r.balance) || 0,
      payment_status: r.payment_status,
      currency: r.currency,
    }));

    await exportStatementToExcel(companyObj, selectedParty.name, entries, {
      ...(selectedCurrency !== 'ALL' ? { currencyCode: selectedCurrency } : {}),
      partyType: partyType === 'supplier' ? 'supplier' : 'customer',
      dateFrom: startDate,
      dateTo: endDate,
    });
  };

  return {
    parties,
    selectedParty,
    selectedPartyId,
    handleSelectPartyId,
    activeTab,
    setActiveTab,
    isRentParty,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedCurrency,
    setSelectedCurrency,
    settlementFilter,
    setSettlementFilter,
    settlementStats,
    availableCurrencies,
    searchQuery,
    setSearchQuery,
    movements,
    filteredMovements,
    selectedMovements,
    isLoading,
    selectedRowIds,
    expandedRowIds,
    rowColors,
    activeColorPickerRowId,
    setActiveColorPickerRowId,
    isPrintingSelectedOnly,
    isAllSelected,
    activeInvoiceId,
    setActiveInvoiceId,
    activeBond,
    isBondModalOpen,
    company,
    handleToggleSelectAll,
    handleToggleRowSelection,
    handleToggleRowExpand,
    handleApplyColorToSingleRow,
    handleApplyColorToSelected,
    handleOpenBondModal,
    handlePrintSingleTransaction,
    handlePrintSelectedStatement,
    handleExportSelectedExcel,
    handleClearSelection: () => setSelectedRowIds(new Set()),
    handleCloseInvoiceModal: () => setActiveInvoiceId(null),
    handleCloseBondModal: () => {
      setIsBondModalOpen(false);
      setActiveBond(null);
    },
  };
};
