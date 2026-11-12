import React from 'react';
import { cn } from '../../../../core/utils';

export const getStatusLabel = (status: string) => {
  if (status === 'paid')
    return {
      label: 'مدفوع',
      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    };
  if (status === 'posted')
    return {
      label: 'مرحّل',
      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    };
  if (status === 'partially_paid')
    return {
      label: 'مدفوع جزئياً',
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
  if (status === 'pending')
    return {
      label: 'قيد الانتظار',
      cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    };
  if (status === 'cancelled')
    return {
      label: 'ملغاة',
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    };
  if (status === 'confirmed')
    return {
      label: 'مؤكد',
      cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    };
  return { label: 'مسودة', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400' };
};

export const InvoiceStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { label, cls } = getStatusLabel(status);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold', cls)}>
      {label}
    </span>
  );
};

