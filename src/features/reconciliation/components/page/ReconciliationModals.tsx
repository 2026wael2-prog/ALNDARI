import React from 'react';
import { QuickDrawerExpenseModal } from '../QuickDrawerExpenseModal';
import { ReconciliationPrintModal } from '../ReconciliationPrintModal';
import { ReconciliationHistoryModal } from '../ReconciliationHistoryModal';
import type { ReconciliationPageController } from '../../pages/useReconciliationPageController';

/** النوافذ: مصروف الدرج، إيصال الطباعة، وسجل الأيام السابقة */
export const PageModals: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
  <>
    <QuickDrawerExpenseModal
      isOpen={page.modals.isExpenseModalOpen}
      onClose={page.modals.closeExpenseModal}
      selectedDate={page.selectedDate}
      baseCurrency={page.view.currency}
      lastExpenseCurrency={page.summary?.last_petty_expense_currency ?? null}
    />

    {page.summary && (
      <ReconciliationPrintModal
        isOpen={page.modals.isPrintModalOpen}
        onClose={page.modals.closePrintModal}
        summary={page.summary}
        actualCash={page.view.actualCashCounted}
        actualCard={page.form.values.actualCard}
        floatRetained={page.form.values.floatRetained}
        cashToOwner={page.view.cashToOwner}
        shopName={page.shopName}
        cashBreakdown={page.view.cashRows}
      />
    )}

    <ReconciliationHistoryModal
      isOpen={page.modals.isHistoryModalOpen}
      onClose={page.modals.closeHistoryModal}
      onSelectDate={date => {
        page.onDateChange(date);
      }}
      historyList={page.historyList}
      isLoading={page.isHistoryLoading}
      currency={page.view.currency}
    />
  </>
);
