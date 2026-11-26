import React, { useState } from 'react';
import { Building2, LayoutList } from 'lucide-react';
import { useStatementController } from '../hooks/useStatementController';
import { useStatementBatchDetails } from '../hooks/useStatementBatchDetails';
import type { PartyType } from '../types';
import FullscreenContainer from '../../../ui/base/FullscreenContainer';
import { cn } from '../../../core/utils';
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
const INLINE_DETAILS_STORAGE_KEY = 'erp_statement_inline_details_v1';

const readSavedDisplayMode = (): 'standard' | 'excel' => {
  try {
    const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (saved === 'standard' || saved === 'excel') return saved;
  } catch {
    // ignore storage errors
  }
  return 'excel';
};

const readSavedInlineDetails = (): boolean => {
  try {
    const saved = localStorage.getItem(INLINE_DETAILS_STORAGE_KEY);
    if (saved === 'false') return false;
  } catch {
    // ignore storage errors
  }
  return true;
};

const StatementView: React.FC<StatementViewProps> = ({
  partyType,
  initialPartyId,
  initialCurrency,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInlineDetails, setShowInlineDetailsState] = useState<boolean>(readSavedInlineDetails);
  const [statementDisplayMode, setStatementDisplayModeState] = useState<'standard' | 'excel'>(
    readSavedDisplayMode
  );
  const setShowInlineDetails = (next: boolean) => {
    setShowInlineDetailsState(next);
    try {
      localStorage.setItem(INLINE_DETAILS_STORAGE_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  };
  const setStatementDisplayMode = (mode: 'standard' | 'excel') => {
    setStatementDisplayModeState(mode);
    try {
      localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };

  const {
    partyScope,
    setPartyScope,
    effectivePartyType,
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
    chronologicalFilteredMovements,
    filteredMovements,
    chronologicalSelectedMovements,
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

  const { detailsMap: batchDetailsMap, isLoading: isBatchDetailsLoading } =
    useStatementBatchDetails(filteredMovements, Boolean(selectedPartyId) && showInlineDetails);

  return (
    <FullscreenContainer
      isMaximized={isFullscreen}
      onToggleMaximize={() => setIsFullscreen(false)}
      className="flex min-h-full flex-col"
    >
      <div
        data-clear-black-text="true"
        className={cn(
          'print-area flex w-full flex-1 flex-col gap-2.5 font-sans',
          isFullscreen && 'h-full overflow-y-auto bg-[var(--app-bg)] p-2 md:p-3'
        )}
      >
        <StatementControls
          partyType={partyType}
          partyScope={partyScope}
          onPartyScopeChange={setPartyScope}
          effectivePartyType={effectivePartyType}
          parties={parties}
          selectedPartyId={selectedPartyId}
          onSelectPartyId={handleSelectPartyId}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          statement={chronologicalFilteredMovements}
          companyNameAr={company.nameAr}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(prev => !prev)}
        />

        {selectedPartyId ? (
          isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500 md:p-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-xs font-bold sm:text-sm">
                جاري تدقيق واستخراج كشف الحساب من قاعدة البيانات...
              </p>
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
                  {/* الهيدر يظهر فقط في الطباعة وتصدير PDF/الملفات وواتساب (مخفي في الواجهة الأمامية) */}
                  <StatementPrintSheet
                    company={company}
                    partyType={effectivePartyType}
                    partyName={selectedParty?.name ?? ''}
                    partyPhone={selectedParty?.phone ?? undefined}
                    partyCode={
                      selectedParty?.id ? selectedParty.id.slice(0, 8).toUpperCase() : undefined
                    }
                    currency={selectedCurrency}
                    movements={
                      isPrintingSelectedOnly
                        ? chronologicalSelectedMovements
                        : chronologicalFilteredMovements
                    }
                    printSubtitle={
                      isPrintingSelectedOnly
                        ? `كشف حساب مالي (${selectedMovements.length} معاملات محددة)`
                        : undefined
                    }
                  />

                  <div className="no-print flex flex-1 flex-col gap-2.5">
                    <StatementToolbar
                      partyType={effectivePartyType}
                      selectedCurrency={selectedCurrency}
                      setSelectedCurrency={setSelectedCurrency}
                      availableCurrencies={availableCurrencies}
                      currencyBalances={selectedParty?.balances_by_currency}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      settlementFilter={settlementFilter}
                      setSettlementFilter={setSettlementFilter}
                      settlementStats={settlementStats}
                      displayMode={statementDisplayMode}
                      onDisplayModeChange={setStatementDisplayMode}
                    />

                    {statementDisplayMode === 'excel' ? (
                      <StatementExcelView
                        filteredMovements={filteredMovements}
                        selectedRowIds={selectedRowIds}
                        expandedRowIds={expandedRowIds}
                        rowColors={rowColors}
                        activeColorPickerRowId={activeColorPickerRowId}
                        partyName={selectedParty?.name || ''}
                        partyType={effectivePartyType}
                        isAllSelected={isAllSelected}
                        isNewestFirst
                        isFullscreen={isFullscreen}
                        showInlineDetails={showInlineDetails}
                        onToggleShowInlineDetails={() => setShowInlineDetails(!showInlineDetails)}
                        batchDetailsMap={batchDetailsMap}
                        isBatchDetailsLoading={isBatchDetailsLoading}
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
                        partyType={effectivePartyType}
                        isAllSelected={isAllSelected}
                        showInlineDetails={showInlineDetails}
                        batchDetailsMap={batchDetailsMap}
                        isBatchDetailsLoading={isBatchDetailsLoading}
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
                      partyType={effectivePartyType}
                      activeCurrency={selectedCurrency}
                      isNewestFirst
                    />
                  </div>
                </>
              )}

              {(!isRentParty || activeTab === 'statement') && (
                <StatementSelectedActionsBar
                  selectedMovements={selectedMovements}
                  selectedParty={selectedParty}
                  partyType={effectivePartyType}
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
          <div className="no-print flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900/20 sm:text-sm md:p-20">
            ابحث واختر عميلاً أو مورداً من الصندوق أعلاه لعرض كشف الحساب وتفاصيل المعاملات
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
    </FullscreenContainer>
  );
};

export default StatementView;
