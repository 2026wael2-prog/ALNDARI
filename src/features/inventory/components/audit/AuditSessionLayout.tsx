/**
 * هيكل عرض صفحة الجرد.
 *
 * سبب وجود الملف: كان بناء شجرة العرض داخل دالة `AuditSessionPage` نفسها،
 * فرفع تعقيدها الدوري (complexity 16) وطولها فوق حدود ESLint. هنا تُركيب
 * بسيط لأربع كتل، والصفحة تحضّر خصائصها فقط.
 */
import type { ComponentProps, ReactElement } from 'react';
import { AuditSessionHeader } from './AuditSessionHeader';
import { AuditSessionSearchDropdown } from './AuditSessionSearchDropdown';
import { AuditSessionModals } from './AuditSessionModals';
import { AuditSessionWorkspace } from './AuditSessionWorkspace';

export interface AuditSessionLayoutProps {
  header: ComponentProps<typeof AuditSessionHeader>;
  /** null عندما تكون الجلسة مكتملة (شريط البحث يختفي). */
  search: ComponentProps<typeof AuditSessionSearchDropdown> | null;
  workspace: ComponentProps<typeof AuditSessionWorkspace>;
  modals: ComponentProps<typeof AuditSessionModals>;
}

export const AuditSessionLayout = ({
  header,
  search,
  workspace,
  modals,
}: AuditSessionLayoutProps): ReactElement => (
  <div className="flex h-full flex-col bg-gray-50 dark:bg-slate-950">
    <AuditSessionHeader {...header} />
    {search === null ? null : <AuditSessionSearchDropdown {...search} />}
    <AuditSessionWorkspace {...workspace} />
    <AuditSessionModals {...modals} />
  </div>
);

export default AuditSessionLayout;
