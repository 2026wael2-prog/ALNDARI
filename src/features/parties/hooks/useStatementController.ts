import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { useAuthStore } from '../../auth/store';
import { bondsService } from '../../bonds/service';
import type { Bond } from '../../bonds/types';
import { useCompany } from '../../settings/hooks';
import { useInvoiceSettings } from '../../settings/settingsStore';
import { useParties, useStatement } from '../hooks';
import type { StatementMovement } from '../service';
import type { PartyType } from '../types';

interface UseStatementControllerParams {
  partyType: PartyType;
  initialPartyId?: string | undefined;
}

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
}: UseStatementControllerParams) => {
  const [selectedPartyId, setSelectedPartyId] = useState<string>(initialPartyId || '');
  const [activeTab, setActiveTab] = useState<'statement' | 'rent'>('statement');

  useEffect(() => {
    if (initialPartyId) {
      setSelectedPartyId(initialPartyId);
    }
  }, [initialPartyId]);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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

  const { data: settingsCompany } = useCompany();
  const invoiceSettings = useInvoiceSettings();

  const companyId =
    settingsCompany?.id || useAuthStore.getState().user?.company_id || 'default_co';
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
    movements.forEach(m => {
      if (m.currency) currencies.add(m.currency);
    });
    return Array.from(currencies);
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return movements.filter(m => {
      if (selectedCurrency !== 'ALL' && m.currency !== selectedCurrency) {
        return false;
      }
      if (!query) return true;
      return Boolean(
        m.ref?.toLowerCase().includes(query) ||
          m.desc?.toLowerCase().includes(query) ||
          m.operation_type?.toLowerCase().includes(query)
      );
    });
  }, [movements, selectedCurrency, searchQuery]);

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
