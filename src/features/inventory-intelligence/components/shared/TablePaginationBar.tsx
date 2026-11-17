import React from 'react';

export const TablePaginationBar: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}> = ({ page, pageSize, total, onPageChange }) => {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] py-2 ps-3 pe-16 text-xs">
      <span className="text-[var(--app-text-secondary)]">
        عرض <strong className="font-mono text-[var(--app-text)]">{start}–{end}</strong> من أصل{' '}
        <strong className="font-mono text-[var(--app-text)]">{total}</strong> سجل
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => {
              onPageChange(safePage - 1);
            }}
            className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 font-bold text-[var(--app-text)] disabled:opacity-40"
          >
            السابق
          </button>
          <span dir="ltr" className="px-2 font-mono font-bold text-[var(--app-text)]">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => {
              onPageChange(safePage + 1);
            }}
            className="rounded border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 font-bold text-[var(--app-text)] disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
};
