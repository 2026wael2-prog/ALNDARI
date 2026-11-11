import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  CreditCard,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  LucideIcon,
} from 'lucide-react';
import { formatCurrency, cn } from '../../../core/utils';

interface SmartAlert {
  type: 'warning' | 'danger' | 'info';
  icon: LucideIcon;
  title: string;
  description: string;
}

interface AISmartNotificationsProps {
  stats?:
    | {
        sales: number;
        expenses: number;
        debts: number;
      }
    | undefined;
  lowStockProducts?: unknown[] | undefined;
  alerts?: unknown[] | undefined;
}

const AISmartNotifications: React.FC<AISmartNotificationsProps> = ({
  stats,
  lowStockProducts,
}) => {
  const [smartAlerts, setSmartAlerts] = useState<SmartAlert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const localAlerts: SmartAlert[] = [];
    const sales = stats?.sales || 0;
    const expenses = stats?.expenses || 0;
    const debts = stats?.debts || 0;
    const lowStockCount = lowStockProducts?.length || 0;

    // Low stock alert
    if (lowStockCount > 0) {
      localAlerts.push({
        type: 'warning',
        icon: Package,
        title: `${lowStockCount} منتج منخفض المخزون`,
        description: 'يجب طلب بضاعة قبل النفاد، راجع تقرير المخزون للتفاصيل',
      });
    }

    // High debt alert
    if (debts > 50000) {
      localAlerts.push({
        type: 'danger',
        icon: CreditCard,
        title: `ديون العملاء: ${formatCurrency(debts)}`,
        description: 'ديون مرتفعة، يتطلب تفعيل خطة التحصيل ومتابعة المستحقات',
      });
    }

    // Loss alert
    const netProfit = sales - expenses;
    if (sales > 0 && netProfit < 0) {
      localAlerts.push({
        type: 'danger',
        icon: TrendingDown,
        title: `خسارة تشغيلية: ${formatCurrency(Math.abs(netProfit))}`,
        description: 'النفقات تتجاوز الإيرادات، يرجى تدقيق بنود المصروفات',
      });
    }

    // Low margin alert
    if (sales > 0) {
      const margin = ((sales - expenses) / sales) * 100;
      if (margin < 15 && margin > 0) {
        localAlerts.push({
          type: 'warning',
          icon: AlertTriangle,
          title: `هامش ربح منخفض: ${margin.toFixed(1)}%`,
          description: 'الهامش أقل من 15%، يرجى مراجعة استراتيجية التسعير',
        });
      }
    }

    // Positive performance
    if (netProfit > 0 && localAlerts.length === 0) {
      localAlerts.push({
        type: 'info',
        icon: CheckCircle2,
        title: 'مؤشرات الأداء إيجابية',
        description: `صافي ربح محقق بقيمة ${formatCurrency(netProfit)}، استمر بنفس الأداء المالي`,
      });
    }

    setSmartAlerts(localAlerts);
  }, [stats, lowStockProducts]);

  if (dismissed || smartAlerts.length === 0) return null;

  const current = smartAlerts[currentIndex];

  const typeStyles = {
    warning: {
      container: 'border-amber-500/20 bg-amber-500/5',
      icon: 'text-amber-500',
    },
    danger: {
      container: 'border-rose-500/20 bg-rose-500/5',
      icon: 'text-rose-500',
    },
    info: {
      container: 'border-emerald-500/20 bg-emerald-500/5',
      icon: 'text-emerald-500',
    },
  };

  const style = typeStyles[current.type];
  const IconComponent = current.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
        style.container
      )}
    >
      <div className={cn('flex shrink-0 items-center justify-center', style.icon)}>
        <IconComponent size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-[var(--app-text)]">{current.title}</p>
        <p className="truncate text-[11px] text-[var(--app-text-secondary)]">{current.description}</p>
      </div>
      {smartAlerts.length > 1 && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setCurrentIndex(i => (i > 0 ? i - 1 : smartAlerts.length - 1));
            }}
            className="rounded-md p-1 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
            title="السابق"
          >
            <ChevronRight size={14} />
          </button>
          <span className="font-mono text-[10px] font-medium text-[var(--app-text-secondary)]">
            {currentIndex + 1}/{smartAlerts.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setCurrentIndex(i => (i < smartAlerts.length - 1 ? i + 1 : 0));
            }}
            className="rounded-md p-1 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
            title="التالي"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
        }}
        className="shrink-0 rounded-md p-1 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
        title="إغلاق التنبيه"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default AISmartNotifications;
