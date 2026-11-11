import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Scale,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  Printer,
  History,
  Coins,
  Banknote,
  Calculator,
  Briefcase,
} from 'lucide-react';
import { cn, formatCurrency } from '../../../core/utils';
import Button from '../../../ui/base/Button';
import Card from '../../../ui/base/Card';
import PageLoader from '../../../ui/base/PageLoader';
import ErrorDisplay from '../../../ui/base/ErrorDisplay';
import StatCard from '../../../ui/common/StatCard';
import { CashCountBoard } from '../components/CashCountBoard';
import { CardTerminalCard } from '../components/CardTerminalCard';
import { FloatSettlementCard } from '../components/FloatSettlementCard';
import { EmployeeSalesBreakdownCard } from '../components/EmployeeSalesBreakdownCard';
import { QuickDrawerExpenseModal } from '../components/QuickDrawerExpenseModal';
import { ReconciliationPrintModal } from '../components/ReconciliationPrintModal';
import { ReconciliationHistoryModal } from '../components/ReconciliationHistoryModal';
import { WhatsAppShareButton } from '../components/WhatsAppShareButton';
import type { DailyDrawerSummary } from '../types';
import type { ReconciliationPageController } from './useReconciliationPageController';

/** هوية الصفحة: العنوان وحالة اليومية */
const HeaderBrand: React.FC<{
  isAlreadyClosed: boolean;
  branchName: string | null | undefined;
}> = ({ isAlreadyClosed, branchName }) => (
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-emerald-600 shadow-sm dark:text-emerald-400">
      <Scale className="h-6 w-6" />
    </div>
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-black text-[var(--app-text)] sm:text-xl">
          المطابقة اليومية وإقفال الصندوق
        </h1>
        {isAlreadyClosed ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Lock className="h-3 w-3" />
            مقفلة ومعتمدة
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
            <Unlock className="h-3 w-3" />
            يومية نشطة
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--app-text-secondary)]">
        جرد الدرج بالعملات، مطابقة ماكينة الشبكة، وتوريد الصافي للخزينة
        {branchName !== null && branchName !== undefined ? ` • ${branchName}` : ''}
      </p>
    </div>
  </div>
);

/** التاريخ وأزرار العمل السريع (مصروف الدرج والسجل) */
const HeaderQuickActions: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
  <>
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1.5">
      <Calendar className="h-4 w-4 text-[var(--app-text-secondary)]" />
      <input
        type="date"
        aria-label="تاريخ اليومية"
        value={page.selectedDate}
        onChange={event => {
          page.onDateChange(event.target.value);
        }}
        className="bg-transparent text-xs font-bold text-[var(--app-text)] focus:outline-none"
      />
    </div>

    <Button
      type="button"
      variant="secondary"
      onClick={page.modals.openExpenseModal}
      className="gap-1.5 text-xs font-bold"
    >
      <Coffee className="h-4 w-4 text-amber-500" />
      <span>مصروف درج</span>
    </Button>

    <Button
      type="button"
      variant="secondary"
      onClick={page.modals.openHistoryModal}
      className="gap-1.5 text-xs font-bold"
    >
      <History className="h-4 w-4" />
      <span>السجل</span>
    </Button>
  </>
);

/** أدوات الترويسة: التاريخ والعمل السريع والطباعة والمشاركة */
const HeaderTools: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
  <div className="flex flex-wrap items-center gap-2">
    <HeaderQuickActions page={page} />

    {page.summary && (
      <>
        <Button
          type="button"
          variant="secondary"
          onClick={page.modals.openPrintModal}
          className="gap-1.5 text-xs font-bold"
        >
          <Printer className="h-4 w-4" />
          <span>طباعة</span>
        </Button>
        <WhatsAppShareButton
          summary={page.summary}
          actualCash={page.view.actualCashCounted}
          actualCard={page.form.values.actualCard}
          floatRetained={page.form.values.floatRetained}
          cashToOwner={page.view.cashToOwner}
          shopName={page.shopName}
          cashBreakdown={page.view.cashRows}
        />
      </>
    )}
  </div>
);

/** ترويسة الصفحة: الحالة، التاريخ، والأدوات المساندة */
const PageHeader: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
  <div className="flex flex-col gap-3 border-b border-[var(--app-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
    <HeaderBrand
      isAlreadyClosed={page.view.isAlreadyClosed}
      branchName={page.branchName}
    />
    <HeaderTools page={page} />
  </div>
);

/** تنبيه نطاق المنشأة: جرد درج واحد لفروع متعددة */
const ScopeBanner: React.FC<{ summary: DailyDrawerSummary | undefined }> = ({ summary }) => {
  const isCompanyScope = summary?.scope_is_company ?? false;
  const branchCount = summary?.company_branch_count ?? 0;
  if (!isCompanyScope || branchCount <= 1) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-800 dark:text-blue-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div>
        <p className="font-bold">
          هذه المطابقة تجمع حركات {branchCount} فروع في درج واحد (نطاق المنشأة كاملة)
        </p>
        <p className="mt-0.5">
          لم يُحدد فرع، لذا دخلت كاشيريات جميع الفروع في نفس الرصيد المتوقع. اختر الفرع من منتقي
          الفروع لمطابقة درج فرع واحد.
        </p>
      </div>
    </div>
  );
};

/** أنماط حالة الفارق في بطاقات الأرقام — خرائط بدل سلاسل الشروط */
type VarianceStatus = 'balanced' | 'surplus' | 'shortage';

interface VarianceStatStyle {
  title: string;
  colorClass: string;
  iconBgClass: string;
  icon: LucideIcon;
}

const VARIANCE_STAT_STYLE: Record<VarianceStatus, VarianceStatStyle> = {
  balanced: {
    title: 'لا يوجد فارق',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    iconBgClass: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  surplus: {
    title: 'فائض بالدرج',
    colorClass: 'text-amber-600 dark:text-amber-400',
    iconBgClass: 'bg-amber-500',
    icon: AlertTriangle,
  },
  shortage: {
    title: 'عجز بالدرج',
    colorClass: 'text-red-600 dark:text-red-400',
    iconBgClass: 'bg-red-500',
    icon: AlertTriangle,
  },
};

/** عنوان حالة الدرج — دالة صريحة بدل استدعاء دالة من خريطة بمفتاح ديناميكي */
const resolveVarianceHeadline = (
  status: VarianceStatus,
  variance: number,
  currency: string
): string => {
  if (status === 'balanced') return 'الدرج مطابق تماماً';
  if (status === 'surplus') return `فائض ${formatCurrency(variance, currency)}`;
  return `عجز ${formatCurrency(variance, currency)}`;
};

/** حدّ إطار شريط الاعتماد حسب حالة الفارق */
const resolveCommitBorder = (status: VarianceStatus): string => {
  if (status === 'balanced') return 'border-emerald-500/40';
  if (status === 'surplus') return 'border-amber-500/40';
  return 'border-red-500/40';
};

/** تلوين أيقونة حالة الفارق */
const resolveCommitIconTone = (status: VarianceStatus): string => {
  if (status === 'balanced') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'surplus') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-red-500/15 text-red-600 dark:text-red-400';
};

/** شريط الأرقام الأربعة الحاسمة — بديل شبكة الخمس بطاقات المتشابهة */
const SummaryStats: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => {
  const { cashVarianceInfo } = view;
  const varianceStyle = VARIANCE_STAT_STYLE[cashVarianceInfo.status];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCard
        variant="compact"
        title="المتوقع بالدرج"
        value={formatCurrency(view.expectedCash, view.currency)}
        subtext={`حد التسامح ±${formatCurrency(view.tolerance, view.currency)}`}
        icon={Banknote}
        colorClass="text-blue-600 dark:text-blue-400"
        iconBgClass="bg-blue-500"
      />
      <StatCard
        variant="compact"
        title="الكاش الفعلي المعدود"
        value={formatCurrency(view.actualCashCounted, view.currency)}
        subtext={view.hasForeignCurrencyCounts ? 'مجموع عدة عملات محوّل للأساس' : 'جرد بعملة الأساس'}
        icon={Calculator}
        colorClass="text-emerald-600 dark:text-emerald-400"
        iconBgClass="bg-emerald-500"
      />
      <StatCard
        variant="compact"
        title={varianceStyle.title}
        value={formatCurrency(cashVarianceInfo.variance, view.currency)}
        subtext={
          cashVarianceInfo.isWithinTolerance ? 'داخل حد التسامح' : 'خارج حد التسامح — يتطلب مبرراً'
        }
        icon={varianceStyle.icon}
        colorClass={varianceStyle.colorClass}
        iconBgClass={varianceStyle.iconBgClass}
      />
      <StatCard
        variant="compact"
        title="الصافي للمالك"
        value={formatCurrency(view.cashToOwner, view.currency)}
        subtext={view.netIsNegative ? 'سالب — صحّح الفكة قبل الاعتماد' : 'بعد استبقاء فكة الغد'}
        icon={Briefcase}
        colorClass={
          view.netIsNegative ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'
        }
        iconBgClass={view.netIsNegative ? 'bg-red-500' : 'bg-indigo-500'}
      />
    </div>
  );
};

/** تفصيل مبيعات اليوم حسب عملة الفاتورة (شفافية المبالغ الخام قبل التحويل) */
const SalesCurrencyCard: React.FC<{ summary: DailyDrawerSummary }> = ({ summary }) => {
  const rows = summary.sales_by_currency ?? [];
  const otherSales = summary.other_sales ?? 0;
  if (rows.length <= 1 && otherSales === 0) return null;

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Coins className="h-4 w-4 text-blue-500" />
        <h3 className="text-xs font-bold text-[var(--app-text)]">مبيعات اليوم حسب عملة الفاتورة</h3>
        <span className="text-[11px] text-[var(--app-text-secondary)]">
          (المجاميع محوّلة إلى عملة الأساس بسعر الفاتورة)
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(row => (
          <div
            key={row.currency_code}
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-[11px]"
          >
            <span className="font-black text-[var(--app-text)]">{row.currency_code}</span>
            <span className="mx-1 text-[var(--app-text-secondary)]">•</span>
            <span className="text-[var(--app-text-secondary)]">
              {formatCurrency(row.raw_total, row.currency_code)} ({row.invoice_count} فاتورة) ≈{' '}
              <strong className="text-[var(--app-text)]">
                {formatCurrency(row.base_total, summary.base_currency ?? row.currency_code)}
              </strong>
            </span>
          </div>
        ))}
        {otherSales > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
            طرق دفع غير مصنّفة:{' '}
            {formatCurrency(otherSales, summary.base_currency ?? summary.currency ?? 'SAR')}
          </div>
        )}
      </div>
    </Card>
  );
};

/** تنبيهات الحالة داخل شريط الاعتماد */
const CommitAlerts: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => (
  <>
    {view.netIsNegative && (
      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        الصافي سالب: الفكة المستبقاة أكبر من الكاش المعدود
      </p>
    )}
    {view.missingRateCurrencies.length > 0 && (
      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        لا سعر صرف لـ {view.missingRateCurrencies.join('، ')}
      </p>
    )}
  </>
);

/** كتلة حالة الدرج داخل شريط الاعتماد */
const CommitStatus: React.FC<{ view: ReconciliationPageController['view'] }> = ({ view }) => {
  const { cashVarianceInfo } = view;
  const status = cashVarianceInfo.status;

  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          resolveCommitIconTone(status)
        )}
      >
        {status === 'balanced' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
      </div>
      <div>
        <h4 className="text-sm font-bold text-[var(--app-text)]">
          {resolveVarianceHeadline(status, cashVarianceInfo.variance, view.currency)}
        </h4>
        <p className="text-xs text-[var(--app-text-secondary)]">
          المتوقع{' '}
          <strong className="text-[var(--app-text)]">
            {formatCurrency(view.expectedCash, view.currency)}
          </strong>
          {' · '}الفعلي{' '}
          <strong className="text-[var(--app-text)]">
            {formatCurrency(view.actualCashCounted, view.currency)}
          </strong>
          {' · '}الصافي{' '}
          <strong
            className={cn(
              view.netIsNegative
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {formatCurrency(view.cashToOwner, view.currency)}
          </strong>
        </p>
        <CommitAlerts view={view} />
      </div>
    </div>
  );
};

/** زر الاعتماد أو شارة اليومية المقفلة */
const CommitAction: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  const { view } = page;

  if (!view.isAlreadyClosed) {
    return (
      <Button
        type="button"
        variant="success"
        onClick={page.handleCommit}
        isLoading={page.isCommitting}
        disabled={view.isLocked}
        className="h-10 gap-1.5 px-5 text-xs font-bold"
      >
        اعتماد وإقفال يومية المحل
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
        ✓ تم إقفال هذا اليوم
      </span>
      {view.isOwner && (
        <Button
          type="button"
          variant="secondary"
          onClick={page.handleCommit}
          disabled={page.isCommitting}
          className="text-xs font-bold"
        >
          {page.isCommitting ? 'جاري التحديث...' : 'تحديث الاعتماد (المالك)'}
        </Button>
      )}
    </div>
  );
};

/** حقل ملاحظات اليومية */
const NotesField: React.FC<{ notes: string; isLocked: boolean; onChange: (value: string) => void }> =
  ({ notes, isLocked, onChange }) => (
    <div>
      <label
        htmlFor="reconciliation-notes"
        className="mb-1 block text-xs font-semibold text-[var(--app-text-secondary)]"
      >
        ملاحظات اليومية (اختياري):
      </label>
      <input
        id="reconciliation-notes"
        type="text"
        disabled={isLocked}
        value={notes}
        onChange={event => {
          onChange(event.target.value);
        }}
        placeholder="ملاحظة تُحفظ مع اليومية"
        className="h-9 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
      />
    </div>
  );

/** حقل مبرر الفارق — يظهر فقط خارج حد التسامح */
const VarianceReasonField: React.FC<{
  isLocked: boolean;
  value: string;
  onChange: (value: string) => void;
}> = ({ isLocked, value, onChange }) => (
  <div>
    <label
      htmlFor="reconciliation-variance-reason"
      className="mb-1 block text-xs font-bold text-[var(--app-text)]"
    >
      مبرر الفارق (إلزامي خارج حد التسامح):
    </label>
    <input
      id="reconciliation-variance-reason"
      type="text"
      disabled={isLocked}
      value={value}
      onChange={event => {
        onChange(event.target.value);
      }}
      placeholder="مثال: فرق فكة زبون أو فاتورة لم تُسجَّل"
      className="h-9 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-xs text-[var(--app-text)] focus:border-red-500 focus:outline-none"
    />
  </div>
);

/** حقول المبرر والملاحظات — تظهر فقط قبل الإقفال */
const VarianceFields: React.FC<{
  needsReason: boolean;
  isLocked: boolean;
  varianceReason: string;
  onVarianceReasonChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}> = ({ needsReason, isLocked, varianceReason, onVarianceReasonChange, notes, onNotesChange }) => (
  <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-[var(--app-border)] pt-2.5 sm:grid-cols-2">
    {needsReason && (
      <VarianceReasonField
        isLocked={isLocked}
        value={varianceReason}
        onChange={onVarianceReasonChange}
      />
    )}
    <NotesField notes={notes} isLocked={isLocked} onChange={onNotesChange} />
  </div>
);

/** شريط الاعتماد النهائي — ثابت أسفل الشاشة، لا مدفون في منتصف الصفحة */
const CommitFooter: React.FC<{ page: ReconciliationPageController }> = ({ page }) => {
  const { view, form } = page;
  const { cashVarianceInfo } = view;
  const needsReason =
    !cashVarianceInfo.isWithinTolerance ||
    (view.cardVariance !== null && Math.abs(view.cardVariance) > view.tolerance);

  return (
    <div className="sticky bottom-2 z-20">
      <Card className={cn('border p-3 shadow-md', resolveCommitBorder(cashVarianceInfo.status))}>
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <CommitStatus view={view} />
          <CommitAction page={page} />
        </div>

        {!view.isAlreadyClosed && (
          <VarianceFields
            needsReason={needsReason}
            isLocked={view.isLocked}
            varianceReason={form.values.varianceReason}
            onVarianceReasonChange={form.setVarianceReason}
            notes={form.values.notes}
            onNotesChange={form.setNotes}
          />
        )}
      </Card>
    </div>
  );
};

/** النوافذ: مصروف الدرج، إيصال الطباعة، وسجل الأيام السابقة */
const PageModals: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
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
    <>
      <SummaryStats view={page.view} />
      <DailyEntryPanels page={page} />
      <SalesCurrencyCard summary={page.summary} />

      <EmployeeSalesBreakdownCard
        breakdown={page.summary.employee_breakdown}
        totalSales={page.summary.total_sales}
        currency={page.view.currency}
        defaultExpanded={false}
      />

      <CommitFooter page={page} />
    </>
  );
};

/**
 * صفحة المطابقة اليومية — إعادة بناء كاملة بهيكل تسلسل العمل:
 * ترويسة → نطاق → أرقام حاسمة → جرد متعدد العملات → شبكة → توريد → تفاصيل → اعتماد ثابت.
 */
export const ReconciliationPageView: React.FC<{ page: ReconciliationPageController }> = ({
  page,
}) => (
  <div className="mx-auto w-full max-w-[1700px] space-y-3 p-3 sm:p-4">
    <PageHeader page={page} />
    <ScopeBanner summary={page.summary} />

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



