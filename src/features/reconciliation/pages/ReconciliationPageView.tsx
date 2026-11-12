import React from 'react';
import PageLoader from '../../../ui/base/PageLoader';
import ErrorDisplay from '../../../ui/base/ErrorDisplay';
import { CashCountBoard } from '../components/CashCountBoard';
import { CardTerminalCard } from '../components/CardTerminalCard';
import { FloatSettlementCard } from '../components/FloatSettlementCard';
import { EmployeeSalesBreakdownCard } from '../components/EmployeeSalesBreakdownCard';
import {
  PageHeader,
  ScopeBanner,
  SummaryStats,
  SalesCurrencyCard,
  CommitFooter,
  PageModals,
} from '../components/page';
import type { ReconciliationPageController } from './useReconciliationPageController';

/** لوحة الجرد + مطابقة الشبكة والتوريد */
const DailyEntryPanels: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  const { view, form } = page;
  return (
    <>
      <CashCountBoard
        countsByCurrency={form.values.cashCountsByCurrency}
        onCountsChange={form.setCashCountsByCurrency}
        manualTotal={form.values.manualCashTotal}
        onManualTotalChange={form.setManualCashTotal}
        countMode={form.values.countMode}
        onCountModeChange={form.setCountMode}
        activeCurrency={form.values.activeCurrency}
        onActiveCurrencyChange={form.setActiveCurrency}
        currencies={page.availableCurrencies}
        rates={form.values.rates}
        onRateChange={form.setRate}
        baseCurrency={view.currency}
        rows={view.cashRows}
        baseTotal={view.actualCashCounted}
        missingRateCurrencies={view.missingRateCurrencies}
        disabled={view.isLocked}
      />
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <CardTerminalCard
          expectedCard={view.expectedCard}
          actualCard={form.values.actualCard}
          isEntered={form.values.cardEntered}
          onActualCardChange={form.setActualCard}
          onUseExpected={() => {
            form.setActualCard(view.expectedCard);
          }}
          terminalRef={form.values.cardTerminalRef}
          onTerminalRefChange={form.setCardTerminalRef}
          currency={view.currency}
          disabled={view.isLocked}
        />

        <FloatSettlementCard
          actualCash={view.actualCashCounted}
          floatRetained={form.values.floatRetained}
          onFloatRetainedChange={form.setFloatRetained}
          cashToOwner={view.cashToOwner}
          netIsNegative={view.netIsNegative}
          currency={view.currency}
          disabled={view.isLocked}
        />
      </div>
    </>
  );
};

/** جسم اليومية بعد اكتمال التحميل */
const DailySections: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  if (!page.summary) return null;

  return (
    <div className="space-y-3">
      <ScopeBanner summary={page.summary} />
      <SummaryStats view={page.view} />
      <SalesCurrencyCard summary={page.summary} />
      <DailyEntryPanels page={page} />
      <EmployeeSalesBreakdownCard
        breakdown={page.summary.employee_breakdown}
        totalSales={page.summary.total_sales}
        currency={page.view.currency}
        defaultExpanded={false}
      />
      <CommitFooter page={page} />
    </div>
  );
};

/**
 * ReconciliationPageView
 * صفحة المطابقة اليومية وإقفال الصندوق — مقسّمة ومعيارية عالية الكثافة
 */
export const ReconciliationPageView: React.FC<{
  page: ReconciliationPageController;
}> = ({ page }) => {
  return (
    <div className="mx-auto w-full max-w-[1700px] space-y-3 p-3 sm:p-4">
      <PageHeader page={page} />

      {page.isLoading ? (
        <PageLoader variant="form" />
      ) : page.isError ? (
        <ErrorDisplay
          variant="full"
          error="تعذر استرجاع بيانات الصندوق لليوم المحدد، أعد المحاولة أو تحقق من الاتصال"
          onRetry={page.handleRetry}
        />
      ) : (
        <DailySections page={page} />
      )}

      <PageModals page={page} />
    </div>
  );
};

export default ReconciliationPageView;
