import React from 'react';
import { ShoppingCart, UserPlus, Receipt, FileText, ArrowRightLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../core/routes/paths';
import { cn } from '../../../core/utils';

interface QuickActionsProps {
  className?: string;
}

const QuickActions: React.FC<QuickActionsProps> = ({ className }) => {
  const navigate = useNavigate();

  const actions = [
    { label: 'فاتورة بيع', icon: ShoppingCart, path: ROUTES.DASHBOARD.SALES },
    { label: 'سند قبض', icon: FileText, path: ROUTES.DASHBOARD.BONDS },
    { label: 'إضافة عميل', icon: UserPlus, path: ROUTES.DASHBOARD.CLIENTS },
    { label: 'تسجيل مصروف', icon: Receipt, path: ROUTES.DASHBOARD.EXPENSES },
    { label: 'طلب مناقلة', icon: ArrowRightLeft, path: ROUTES.DASHBOARD.INVENTORY },
  ];

  return (
    <div
      className={cn(
        'bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl p-4 transition-colors',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[var(--app-text)]">إجراءات سريعة</h3>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {actions.map((action, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => action.path && navigate(action.path)}
            className="group flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors duration-150 hover:bg-[var(--app-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] transition-colors duration-150 group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]">
              <action.icon size={18} />
            </div>
            <span className="text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors duration-150 group-hover:text-[var(--app-text)]">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
