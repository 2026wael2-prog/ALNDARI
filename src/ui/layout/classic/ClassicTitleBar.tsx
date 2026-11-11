import React from 'react';
import { Car } from 'lucide-react';
import HeaderActions from '../header/HeaderActions';
import ClassicQuickSearch from './ClassicQuickSearch';

interface ClassicTitleBarProps {
  pageTitle: string;
}

/**
 * شريط عنوان النافذة الكلاسيكي: هوية المنشأة + عنوان الصفحة + بحث سريع + أدوات الحساب.
 */
const ClassicTitleBar: React.FC<ClassicTitleBarProps> = ({ pageTitle }) => (
  <div className="classic-titlebar flex h-11 items-center gap-3 px-2">
    <div className="flex shrink-0 items-center gap-2">
      <span className="classic-brand-mark">
        <Car size={16} strokeWidth={2.25} />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-black tracking-tight text-[var(--app-text)]">
          الجعفري ERP
        </span>
        <span className="text-[10px] font-bold text-[var(--app-text-secondary)]">{pageTitle}</span>
      </div>
    </div>

    <ClassicQuickSearch />

    <div className="ms-auto flex shrink-0 items-center gap-1">
      <HeaderActions />
    </div>
  </div>
);

export default ClassicTitleBar;
