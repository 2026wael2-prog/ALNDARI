import React, { useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import HeaderActions from './header/HeaderActions';
import RealtimeStatusIndicator from '../common/RealtimeStatusIndicator';
import { InteractiveCarPartsLogo } from '../common/InteractiveCarPartsLogo';
import { MENU_ITEMS } from '../../core/constants';

/**
 * ⚡ Lazy: شريط الذكر وأوقات الصلاة عنصر ديكوري غير حرج. كان استيراده الثابت
 * يسحب وحدة dhikr كاملة (أوقات الصلاة بالجغرافيا، صوت الأذان، framer-motion)
 * إلى حزمة الدخول. يُحمَّل الآن عند الطلب بعد الإقلاع.
 */
const DhikrTicker = lazy(() => import('../../features/dhikr/DhikrTicker'));
import { useTranslation } from '../../lib/hooks/useTranslation';
import { useSearchStore } from '../../core/store/searchStore';

class SafeDhikrBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Graceful fallback: hide ticker if an error occurs without breaking header
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, dir } = useTranslation();

  const pageSearchValue = useSearchStore(s => s.pageSearchValue);
  const pageSearchPlaceholder = useSearchStore(s => s.pageSearchPlaceholder);
  const onPageSearchChange = useSearchStore(s => s.onPageSearchChange);
  const isPageSearchActive = !!onPageSearchChange;

  const [globalSearchVal, setGlobalSearchVal] = useState('');

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearchVal.trim()) {
      navigate(`/inventory?search=${encodeURIComponent(globalSearchVal.trim())}`);
    }
  };

  const currentRoute = MENU_ITEMS.find(item =>
    item.path === '/'
      ? location.pathname === item.path
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );
  const title = currentRoute ? t(currentRoute.labelKey) : t('overview');

  return (
    <div className="no-print sticky top-0 z-50 flex-shrink-0">
      <header
        data-main-header="true"
        className="flex h-11 items-center justify-between border-b border-slate-200/90 bg-[var(--app-surface)] px-3 shadow-xs dark:border-slate-800 md:px-4"
      >
        {/* Left side: Logo/Title (Mobile) / Page Title (Desktop) */}
        <div className="flex flex-1 items-center gap-3 md:flex-none">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className="-ms-2 p-2.5 text-[var(--app-text-secondary)] md:hidden"
            aria-label={t('menu') || 'فتح القائمة'}
          >
            <Menu size={24} />
          </button>
          <div
            onClick={() => {
              React.startTransition(() => {
                navigate('/');
              });
            }}
            className="cursor-pointer rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 p-1 text-white shadow-md shadow-orange-600/25 ring-1 ring-white/30 transition-all duration-300 active:scale-95 md:hidden"
            aria-label="الرئيسية"
          >
            <InteractiveCarPartsLogo size={20} interactive={false} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-extrabold leading-tight text-[var(--app-text)] md:text-base">
              {title}
            </h1>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-secondary)] md:hidden">
              {t('app_title')}
            </span>
          </div>
        </div>

        {/* Center: Search (Desktop) */}
        <div className="hidden flex-1 justify-center px-4 md:flex">
          <div className="group relative w-full max-w-xl">
            {isPageSearchActive ? (
              <div className="animate-in zoom-in-95 relative duration-300">
                <input
                  type="text"
                  placeholder={pageSearchPlaceholder}
                  value={pageSearchValue}
                  onChange={e => {
                    onPageSearchChange(e.target.value);
                  }}
                  autoFocus
                  className="w-full rounded-xl border border-blue-500/30 bg-blue-50/50 py-1.5 pe-10 ps-9 text-xs font-bold text-[var(--app-text)] shadow-sm shadow-blue-500/5 ring-1 ring-blue-500/10 transition-all placeholder:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:bg-blue-900/20 dark:placeholder:text-blue-300"
                />
                <Search
                  className={`absolute top-2 text-blue-500 transition-colors ${dir === 'rtl' ? 'right-3' : 'left-3'}`}
                  size={15}
                />
                {pageSearchValue && (
                  <button
                    onClick={() => {
                      onPageSearchChange('');
                    }}
                    className={`absolute top-2 text-blue-400 transition-colors hover:text-rose-500 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ) : (
              <form role="search" onSubmit={handleGlobalSearchSubmit} className="relative w-full">
                <input
                  type="text"
                  placeholder={t('global_search_placeholder')}
                  value={globalSearchVal}
                  onChange={e => {
                    setGlobalSearchVal(e.target.value);
                  }}
                  autoComplete="off"
                  aria-describedby="global-search-desc"
                  aria-label={t('global_search_placeholder')}
                  className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pe-10 ps-9 text-xs font-bold text-[var(--app-text)] transition-all placeholder:text-[var(--app-text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <span id="global-search-desc" className="sr-only">
                  {t('global_search_desc') || 'ابحث عن منتج أو فاتورة أو عميل في النظام'}
                </span>
                <Search
                  className={`absolute top-2 text-[var(--app-text-secondary)] transition-colors group-focus-within:text-blue-500 ${dir === 'rtl' ? 'right-3' : 'left-3'}`}
                  size={15}
                />
                {globalSearchVal && (
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalSearchVal('');
                    }}
                    className={`absolute top-2 text-[var(--app-text-secondary)] transition-colors hover:text-rose-500 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Right side: Global Actions (Profile, Theme, etc) */}
        <div className="flex items-center gap-2">
          <RealtimeStatusIndicator />
          <HeaderActions />
        </div>
      </header>

      {/* Mobile Page Search — يظهر فقط عندما تسجّل الصفحة حقل بحث في useSearchStore */}
      {isPageSearchActive && (
        <div className="border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 shadow-sm md:hidden">
          <div className="animate-in slide-in-from-top-2 relative duration-300">
            <input
              type="text"
              inputMode="search"
              placeholder={pageSearchPlaceholder}
              value={pageSearchValue}
              onChange={e => {
                onPageSearchChange(e.target.value);
              }}
              aria-label={pageSearchPlaceholder}
              className="w-full rounded-lg border border-blue-500/30 bg-blue-50/50 py-1.5 pe-9 ps-9 text-sm font-bold text-[var(--app-text)] placeholder:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:bg-blue-900/20 dark:placeholder:text-blue-300"
            />
            <Search
              className={`absolute top-2 text-blue-500 ${dir === 'rtl' ? 'right-3' : 'left-3'}`}
              size={15}
            />
            {pageSearchValue && (
              <button
                onClick={() => {
                  onPageSearchChange('');
                }}
                aria-label="مسح البحث"
                className={`absolute top-1.5 p-0.5 text-blue-400 transition-colors hover:text-rose-500 ${dir === 'rtl' ? 'left-2' : 'right-2'}`}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Non-intrusive Dhikr & Prayer ticker */}
      <SafeDhikrBoundary>
        <Suspense fallback={null}>
          <DhikrTicker />
        </Suspense>
      </SafeDhikrBoundary>
    </div>
  );
};

export default React.memo(Header);
