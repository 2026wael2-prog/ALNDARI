import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ROUTES } from '../../../core/routes/paths';
import { useTranslation } from '../../../lib/hooks/useTranslation';

/** بحث سريع في شريط العنوان — يوجّه إلى شاشة المخزون كما في الترويسة الحديثة. */
const ClassicQuickSearch: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const query = searchValue.trim();
    if (query.length === 0) return;
    void navigate(`${ROUTES.DASHBOARD.INVENTORY}?search=${encodeURIComponent(query)}`);
  };

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="relative mx-auto hidden w-full max-w-sm items-center md:flex"
    >
      <label htmlFor="classic-global-search" className="sr-only">
        {t('global_search_placeholder')}
      </label>
      <Search
        size={13}
        className="pointer-events-none absolute start-2 text-[var(--app-text-secondary)]"
      />
      <input
        id="classic-global-search"
        type="search"
        value={searchValue}
        onChange={event => {
          setSearchValue(event.target.value);
        }}
        autoComplete="off"
        placeholder={t('global_search_placeholder')}
        className="h-7 w-full rounded-sm border border-[var(--app-border)] bg-[var(--app-bg)] pe-2 ps-7 text-[11px] font-semibold text-[var(--app-text)] placeholder:text-[var(--app-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
    </form>
  );
};

export default ClassicQuickSearch;
