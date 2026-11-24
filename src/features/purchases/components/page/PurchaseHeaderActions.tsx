import React from 'react';
import { ShieldCheck, Wallet } from 'lucide-react';
import type { AuthUser } from '../../../auth/types';

interface HeaderActionsProps {
  user: AuthUser | null;
  setIsPaymentModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAuditOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const PurchaseHeaderActions: React.FC<HeaderActionsProps> = ({
  user,
  setIsPaymentModalOpen,
  setIsAuditOpen,
}) => {
  return (
    <div className="flex items-center gap-1.5 md:gap-2">
      {user?.role === 'admin' && (
        <button
          onClick={() => {
            setIsAuditOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 md:px-3 md:py-1.5"
          title="فحص النظام"
        >
          <ShieldCheck size={15} />
          <span className="hidden md:inline">فحص النظام</span>
        </button>
      )}
      <button
        onClick={() => {
          setIsPaymentModalOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm shadow-purple-500/20 active:scale-95 md:px-3 md:py-1.5"
      >
        <Wallet size={14} />
        <span>سند صرف</span>
      </button>
    </div>
  );
};

