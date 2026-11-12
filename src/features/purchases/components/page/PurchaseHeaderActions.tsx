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
    <div className="flex gap-3">
      {user?.role === 'admin' && (
        <button
          onClick={() => {
            setIsAuditOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
        >
          <ShieldCheck size={20} />
          <span className="hidden md:inline">فحص النظام</span>
        </button>
      )}
      <button
        onClick={() => {
          setIsPaymentModalOpen(true);
        }}
        className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg shadow-purple-500/20 active:scale-95"
      >
        <Wallet size={14} />
        سند صرف
      </button>
    </div>
  );
};

