import React, { useState } from 'react';
import { Building2, LayoutList, FileSpreadsheet, ListFilter } from 'lucide-react';
import { useStatementController } from '../hooks/useStatementController';
import type { PartyType } from '../types';
import { StatementControls } from './statement/StatementControls';
import { StatementDocumentModals } from './statement/StatementDocumentModals';
import { StatementMovementsTable } from './statement/StatementMovementsTable';
import { StatementExcelView } from './statement/StatementExcelView';
import { StatementPrintSheet } from './statement/StatementPrintSheet';
import { StatementSelectedActionsBar } from './statement/StatementSelectedActionsBar';
import { StatementSummaryCards } from './statement/StatementSummaryCards';
import { StatementToolbar } from './statement/StatementToolbar';
import { RentTrackerView } from './statement/RentTrackerView';

interface StatementViewProps {
  partyType: PartyType;
  initialPartyId?: string | undefined;
  initialCurrency?: string | undefined;
}

const DISPLAY_MODE_STORAGE_KEY = 'erp_statement_display_mode';

const readSavedDisplayMode = (): 'standard' | 'excel' => {
  try {
    const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (saved === 'standard' || saved === 'excel') return saved;
  } catch {
    // ignore storage errors
  }
  return 'excel';
};

const StatementView: React.FC<StatementViewProps> = ({
  partyType,
  initialPartyId,
  initialCurrency,
}) => {
  const [statementDisplayMode, setStatementDisplayModeState] = useState<'standard' | 'excel'>(
    readSavedDisplayMode
  );
  const setStatementDisplayMode = (mode: 'standard' | 'excel') => {
    setStatementDisplayModeState(mode);
    try {
      localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };
  const {
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
    handleClearSelection,
    handleCloseInvoiceModal,
    handleCloseBondModal,
  } = useStatementController({ partyType, initialPartyId, initialCurrency });

  return (
    <div className="print-area space-y-4 font-sans">
      <StatementControls
        partyType={partyType}
        parties={parties}
        selectedPartyId={selectedPartyId}
        onSelectPartyId={handleSelectPartyId}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        statement={filteredMovements}
        companyNameAr={company.nameAr}
      />

      {selectedPartyId ? (
        isLoading ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-slate-500 md:p-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-xs font-bold sm:text-sm">جاري تدقيق واستخراج كشف الحساب من قاعدة البيانات...</p>
          </div>
        ) : (
          <>
            {isRentParty && (
              <div className="no-print flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/50 p-1 dark:border-slate-800 dark:bg-slate-900/30">
                <button
                  type="button"
                  onClick={() => setActiveTab('statement')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    activeTab === 'statement'
                      ? 'bg-white text-blue-700 shadow dark:bg-slate-800 dark:text-blue-400'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <LayoutList size={13} />
                  كشف الحساب الكامل
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rent')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    activeTab === 'rent'
                      ? 'bg-white text-blue-700 shadow dark:bg-slate-800 dark:text-blue-400'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Building2 size={13} />
                  متابعة الإيجار الشهري
                </button>
              </div>
            )}

            {isRentParty && activeTab === 'rent' ? (
              <RentTrackerView movements={movements} />
            ) : (
              <>
                <StatementPrintSheet
                  company={company}
                  partyType={partyType}
                  partyName={selectedParty?.name ?? ''}
                  partyPhone={selectedParty?.phone ?? undefined}
                  partyCode={selectedParty?.id ? selectedParty.id.slice(0, 8).toUpperCase() : undefined}
                  currency={selectedCurrency}
                  movements={isPrintingSelectedOnly ? selectedMovements : filteredMovements}
                  printSubtitle={
                    isPrintingSelectedOnly
                      ? `كشف حساب مالي (${selectedMovements.length} معاملات محددة)`
                      : undefined
                  }
                />

                <div className="no-print space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-800">
                    <div className="w-full">
                      <StatementToolbar
                        selectedCurrency={selectedCurrency}
                        setSelectedCurrency={setSelectedCurrency}
                        availableCurrencies={availableCurrencies}
                        currencyBalances={selectedParty?.balances_by_currency}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        settlementFilter={settlementFilter}
                        setSettlementFilter={setSettlementFilter}
                        settlementStats={settlementStats}
                      />
                    </div>

                    {/* طريقة العرض: جدول إكسل جريد (افتراضي) أو العرض الكلاسيكي */}
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
                      <button
                        type="button"
                        onClick={() => setStatementDisplayMode('excel')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          statementDisplayMode === 'excel'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        title="عرض كشف الحساب كجدول إكسل Grid متطور مع التلوين والتوسيع والإجماليات"
                      >
                        <FileSpreadsheet size={13} />
                        <span>جدول إكسل (Grid)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementDisplayMode('standard')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                          statementDisplayMode === 'standard'
                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        title="العرض الكلاسيكي لكشف الحساب"
                      >
                        <ListFilter size={13} />
                        <span>العرض الكلاسيكي</span>
                      </button>
                    </div>
                  </div>

                  {statementDisplayMode === 'excel' ? (
                    <StatementExcelView
                      filteredMovements={filteredMovements}
                      selectedRowIds={selectedRowIds}
                      expandedRowIds={expandedRowIds}
                      rowColors={rowColors}
                      activeColorPickerRowId={activeColorPickerRowId}
                      partyName={selectedParty?.name || ''}
                      isAllSelected={isAllSelected}
                      onToggleSelectAll={handleToggleSelectAll}
                      onToggleRowSelection={handleToggleRowSelection}
                      onToggleRowExpand={handleToggleRowExpand}
                      onOpenColorPicker={setActiveColorPickerRowId}
                      onApplyColorToSingleRow={handleApplyColorToSingleRow}
                      onPrintSingleTransaction={handlePrintSingleTransaction}
                      onOpenInvoiceModal={setActiveInvoiceId}
                      onOpenBondModal={handleOpenBondModal}
                    />
                  ) : (
                    <StatementMovementsTable
                      filteredMovements={filteredMovements}
                      selectedRowIds={selectedRowIds}
                      expandedRowIds={expandedRowIds}
                      rowColors={rowColors}
                      activeColorPickerRowId={activeColorPickerRowId}
                      isPrintingSelectedOnly={isPrintingSelectedOnly}
                      partyName={selectedParty?.name || ''}
                      isAllSelected={isAllSelected}
                      onToggleSelectAll={handleToggleSelectAll}
                      onToggleRowSelection={handleToggleRowSelection}
                      onToggleRowExpand={handleToggleRowExpand}
                      onOpenColorPicker={setActiveColorPickerRowId}
                      onApplyColorToSingleRow={handleApplyColorToSingleRow}
                      onPrintSingleTransaction={handlePrintSingleTransaction}
                      onOpenInvoiceModal={setActiveInvoiceId}
                      onOpenBondModal={handleOpenBondModal}
                    />
                  )}

                  <StatementSummaryCards
                    movements={filteredMovements}
                    partyType={partyType}
                    activeCurrency={selectedCurrency}
                  />
                </div>
              </>
            )}

            {(!isRentParty || activeTab === 'statement') && (
              <StatementSelectedActionsBar
                selectedMovements={selectedMovements}
                selectedParty={selectedParty}
                partyType={partyType}
                companyName={company.nameAr}
                onClearSelection={handleClearSelection}
                onApplyColor={handleApplyColorToSelected}
                onPrintSingleTransaction={handlePrintSingleTransaction}
                onPrintSelectedStatement={handlePrintSelectedStatement}
                onExportSelectedExcel={handleExportSelectedExcel}
              />
            )}
          </>
        )
      ) : (
        <div className="no-print rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900/20 sm:text-sm md:p-20">
          يرجى اختيار جهة لعرض كشف الحساب وتفاصيل المعاملات
        </div>
      )}

      <StatementDocumentModals
        activeInvoiceId={activeInvoiceId}
        onCloseInvoiceModal={handleCloseInvoiceModal}
        activeBond={activeBond}
        isBondModalOpen={isBondModalOpen}
        onCloseBondModal={handleCloseBondModal}
      />
    </div>
  );
};

export default StatementView;
