/**
 * مساحة عمل جلسة الجرد: الإحصاءات + مرشّحات التصنيف والحالة + جدول الأصناف.
 *
 * سبب وجود الملف: كانت هذه الشجرة (~65 سطراً من JSX المتداخل) داخل
 * `AuditSessionPage` مباشرة، فساهمت في تجاوز حدّ طول الدالة وفي خلط «جلب
 * البيانات» بـ«عرضها». الآن الصفحة تنسّق فقط وهذا المكوّن يعرض.
 */
import type { ComponentProps, ReactElement } from 'react';
import AuditStats from './AuditStats';
import AuditItemsTable, { type AuditItemTarget, type AuditStatusFilter } from './AuditItemsTable';
import { AuditCategoryFilterBar } from './AuditCategoryFilterBar';
import { AuditStatusFilterBar } from './AuditStatusFilterBar';

type StatsModel = ComponentProps<typeof AuditStats>['stats'];
type SessionModel = ComponentProps<typeof AuditStats>['session'];
type CategoriesModel = ComponentProps<typeof AuditCategoryFilterBar>['categories'];

interface SummaryProps {
  stats: StatsModel;
  session: SessionModel;
  categories: CategoriesModel;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  statusFilter: AuditStatusFilter;
  onSelectStatusFilter: (status: AuditStatusFilter) => void;
}

/** الإحصاءات ومرشّحات التصنيف/الحالة (كتلة عرض مستقلة). */
const AuditSessionSummary = ({
  stats,
  session,
  categories,
  selectedCategory,
  onSelectCategory,
  statusFilter,
  onSelectStatusFilter,
}: SummaryProps): ReactElement => (
  <>
    <AuditStats stats={stats} session={session} />
    <div className="space-y-2">
      <AuditCategoryFilterBar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
      />
      <AuditStatusFilterBar
        statusFilter={statusFilter}
        onSelectStatusFilter={onSelectStatusFilter}
        stats={stats}
      />
    </div>
  </>
);

export interface AuditSessionWorkspaceProps extends SummaryProps {
  items: ComponentProps<typeof AuditItemsTable>['items'];
  register: ComponentProps<typeof AuditItemsTable>['register'];
  debouncedFilter: string;
  isCompleted: boolean;
  onRemoveItem: (target: AuditItemTarget) => void;
  onSave: () => void;
  /** يُستدعى عند النقر داخل المساحة لإغلاق قائمة نتائج البحث. */
  onBackgroundClick: () => void;
}

export const AuditSessionWorkspace = ({
  items,
  register,
  debouncedFilter,
  isCompleted,
  onRemoveItem,
  onSave,
  onBackgroundClick,
  ...summary
}: AuditSessionWorkspaceProps): ReactElement => (
  <div
    className="custom-scrollbar flex-1 overflow-y-auto p-4 pb-16"
    onClick={onBackgroundClick}
    onKeyDown={event => {
      if (event.key === 'Escape') onBackgroundClick();
    }}
    role="presentation"
  >
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AuditSessionSummary {...summary} />
      <AuditItemsTable
        items={items}
        register={register}
        filter={debouncedFilter}
        category={summary.selectedCategory}
        statusFilter={summary.statusFilter}
        isCompleted={isCompleted}
        onRemoveItem={onRemoveItem}
        onSave={onSave}
      />
    </div>
  </div>
);

export default AuditSessionWorkspace;
