import React from 'react';
import {
  Scale,
  Calendar,
  Lock,
  Unlock,
  AlertTriangle,
  Coffee,
  Printer,
  History,
} from 'lucide-react';
import Button from '../../../../ui/base/Button';
import { WhatsAppShareButton } from '../WhatsAppShareButton';
import type { DailyDrawerSummary } from '../../types';
import type { ReconciliationPageController } from '../../pages/useReconciliationPageController';

/** هوية الصفحة: العنوان وحالة اليومية */
export const HeaderBrand: React.FC<{
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
export const HeaderQuickActions: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
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
export const HeaderTools: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
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
export const PageHeader: React.FC<{ page: ReconciliationPageController }> = ({ page }) => (
  <div className="flex flex-col gap-3 border-b border-[var(--app-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
    <HeaderBrand
      isAlreadyClosed={page.view.isAlreadyClosed}
      branchName={page.branchName}
    />
    <HeaderTools page={page} />
  </div>
);

/** تنبيه نطاق المنشأة: جرد درج واحد لفروع متعددة */
export const ScopeBanner: React.FC<{ summary: DailyDrawerSummary | undefined }> = ({ summary }) => {
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
