import React from 'react';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { InteractiveCarPartsLogo } from '../../common/InteractiveCarPartsLogo';

interface SidebarLogoProps {
  isCollapsed: boolean;
}

const SidebarLogo: React.FC<SidebarLogoProps> = ({ isCollapsed }) => {
  const { t } = useTranslation();
  return (
    <div
      data-sidebar-logo="true"
      className={`h-16 flex items-center bg-[var(--app-surface)] border-b border-[var(--app-border)] transition-colors duration-150 ${
        isCollapsed ? 'px-0 justify-center' : 'px-4 justify-start'
      }`}
    >
      <div className="flex items-center gap-3 text-[var(--app-text)] overflow-visible group">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/30 ring-2 ring-orange-400/30 group-hover:scale-105 transition-transform duration-200 shrink-0">
          <InteractiveCarPartsLogo size={26} />
        </div>

        {!isCollapsed && (
          <div className="flex flex-col text-start whitespace-nowrap">
            <h1 className="text-sm font-black leading-tight text-slate-900 dark:text-slate-100 tracking-tight">
              {t('app_title').split(' ')[0]}
            </h1>
            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase tracking-wider">
              {t('app_subtitle').split(' ').slice(2).join(' ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarLogo;
