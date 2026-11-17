import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  ReceiptText,
  PackageOpen,
  Ellipsis,
  Users,
  Truck,
  Store,
  Wallet,
  DollarSign,
  Calculator,
  BarChart3,
  Settings,
  SlidersHorizontal,
  Link2,
  CalendarDays,
  CreditCard,
} from 'lucide-react';
import { ROUTES } from '../../../core/routes/paths';
import { useTranslation } from '../../../lib/hooks/useTranslation';
import { cn } from '../../../core/utils';
import BottomSheet from '../../base/BottomSheet';

interface MobileBottomNavProps {
  isMoreSheetOpen: boolean;
  onOpenMoreSheet: () => void;
  onCloseMoreSheet: () => void;
}

/**
 * Tactical mobile bottom navigation bar with primary ERP routes and an
 * organized "More" bottom sheet covering all core operational modules.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  isMoreSheetOpen,
  onOpenMoreSheet,
  onCloseMoreSheet,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: LayoutDashboard, label: t('overview') || 'الرئيسية', path: ROUTES.DASHBOARD.ROOT },
    { icon: ShoppingBag, label: t('invoices') || 'فواتير البيع', path: ROUTES.DASHBOARD.SALES },
    {
      icon: ShoppingCart,
      label: t('purchases') || 'فواتير الشراء',
      path: ROUTES.DASHBOARD.PURCHASES,
    },
    { icon: ReceiptText, label: t('receipts') || 'السندات', path: ROUTES.DASHBOARD.BONDS },
    { icon: PackageOpen, label: t('products') || 'المنتجات', path: ROUTES.DASHBOARD.INVENTORY },
  ];

  const moreItems = [
    { icon: Users, label: t('customers') || 'العملاء', path: ROUTES.DASHBOARD.CLIENTS },
    { icon: Truck, label: t('suppliers') || 'الموردين', path: ROUTES.DASHBOARD.SUPPLIERS },
    { icon: Store, label: t('pos') || 'نقطة البيع', path: ROUTES.DASHBOARD.POS },
    { icon: CreditCard, label: t('debts') || 'الديون', path: ROUTES.DASHBOARD.DEBTS },
    { icon: Wallet, label: t('expenses') || 'المصروفات', path: ROUTES.DASHBOARD.EXPENSES },
    { icon: DollarSign, label: t('accounting') || 'المحاسبة', path: ROUTES.DASHBOARD.ACCOUNTING },
    { icon: BarChart3, label: t('reports') || 'التقارير', path: ROUTES.DASHBOARD.REPORTS },
    {
      icon: Calculator,
      label: t('commission_dashboard') || 'العمولات',
      path: ROUTES.DASHBOARD.COMMISSIONS,
    },
    {
      icon: SlidersHorizontal,
      label: t('commission_config') || 'إعدادات العمولات',
      path: ROUTES.DASHBOARD.COMMISSIONS_CONFIG,
    },
    {
      icon: Link2,
      label: t('commission_assignments') || 'تعيين العمولات',
      path: ROUTES.DASHBOARD.COMMISSIONS_ASSIGNMENTS,
    },
    {
      icon: CalendarDays,
      label: t('commission_periods') || 'فترات العمولات',
      path: ROUTES.DASHBOARD.COMMISSIONS_PERIODS,
    },
    {
      icon: BarChart3,
      label: t('commission_reports') || 'تقارير العمولات',
      path: ROUTES.DASHBOARD.COMMISSIONS_REPORTS,
    },
    { icon: Settings, label: t('settings') || 'الإعدادات', path: ROUTES.DASHBOARD.SETTINGS },
  ];

  const handleNavigate = (path: string) => {
    React.startTransition(() => {
      navigate(path);
    });
  };

  return (
    <>
      <nav
        role="navigation"
        aria-label={t('mobile_navigation') || 'التنقل السفلي'}
        className="no-print bg-[var(--app-surface)]/95 fixed bottom-0 left-0 right-0 z-40 flex h-[calc(3.25rem_+_env(safe-area-inset-bottom))] items-center justify-around border-t border-[var(--app-border)] px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
      >
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              aria-label={item.label}
              className={cn(
                'flex h-full flex-1 flex-col items-center justify-center transition-all duration-300 active:scale-90',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--app-text-secondary)]'
              )}
            >
              <div
                className={cn(
                  'rounded-xl p-1.5 transition-all duration-500 max-md:p-1',
                  isActive
                    ? 'bg-[var(--accent)] text-white shadow-lg'
                    : 'hover:bg-[var(--app-surface-hover)]'
                )}
              >
                <item.icon size={18} strokeWidth={isActive ? 3 : 2} />
              </div>
              <span className="mt-0.5 truncate text-[10px] font-semibold leading-none tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={onOpenMoreSheet}
          aria-label={t('more') || 'المزيد'}
          className={cn(
            'flex h-full flex-1 flex-col items-center justify-center transition-all duration-300 active:scale-90',
            isMoreSheetOpen ? 'text-[var(--accent)]' : 'text-[var(--app-text-secondary)]'
          )}
        >
          <div
            className={cn(
              'rounded-xl p-1.5 transition-all duration-500 max-md:p-1',
              isMoreSheetOpen
                ? 'bg-[var(--accent)] text-white shadow-lg'
                : 'hover:bg-[var(--app-surface-hover)]'
            )}
          >
            <Ellipsis size={18} strokeWidth={2} />
          </div>
          <span className="mt-0.5 text-[10px] font-semibold leading-none tracking-tight">
            {t('more') || 'المزيد'}
          </span>
        </button>
      </nav>

      <BottomSheet
        isOpen={isMoreSheetOpen}
        onClose={onCloseMoreSheet}
        title={t('quick_actions') || 'إجراءات سريعة'}
      >
        <div className="grid grid-cols-3 gap-3 max-md:gap-2">
          {moreItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => {
                  handleNavigate(item.path);
                  onCloseMoreSheet();
                }}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl p-4 transition-all duration-200 active:scale-95 max-md:gap-1.5 max-md:p-2.5',
                  isActive
                    ? 'bg-[var(--accent)]/10 ring-[var(--accent)]/30 text-[var(--accent)] ring-2'
                    : 'bg-[var(--app-bg)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
                )}
              >
                <div
                  className={cn(
                    'rounded-xl p-3 transition-all max-md:p-2',
                    isActive ? 'bg-[var(--accent)] text-white' : 'bg-[var(--app-surface)]'
                  )}
                >
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
                <span className="text-center text-[10px] font-bold leading-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
};
