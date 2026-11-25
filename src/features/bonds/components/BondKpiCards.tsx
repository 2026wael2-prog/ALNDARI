import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, Wallet, Activity } from 'lucide-react';
import { cn, formatCurrency } from '../../../core/utils';

interface BondKpiCardsProps {
    totals: {
        receiptCount: number;
        receiptAmount: number;
        paymentCount: number;
        paymentAmount: number;
        netAmount: number;
    };
    analytics: {
        avgAmount: number;
        count: number;
    };
}

const BondKpiCards: React.FC<BondKpiCardsProps> = ({ totals, analytics }) => {
    return (
        <div className="grid grid-cols-4 gap-1 sm:gap-4 lg:gap-6">
            <div className="group relative min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 p-1.5 text-white shadow-sm transition-transform duration-500 hover:scale-[1.02] sm:rounded-2xl sm:p-5 sm:shadow-xl sm:shadow-emerald-500/20 lg:p-6">
                <div className="absolute right-0 top-0 hidden transform p-4 opacity-20 transition-transform duration-500 group-hover:rotate-12 sm:block">
                    <ArrowDownCircle size={44} />
                </div>
                <p className="mb-0.5 truncate text-[10px] font-bold opacity-80 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">إجمالي القبض</p>
                <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight sm:text-xl lg:text-2xl">{formatCurrency(totals.receiptAmount)}</h2>
                <div className="mt-2 hidden items-center gap-2 text-[10px] font-bold sm:flex">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5">{totals.receiptCount} سند قبض</span>
                </div>
            </div>

            <div className="group relative min-w-0 overflow-hidden rounded-lg bg-gradient-to-br from-rose-600 to-pink-700 p-1.5 text-white shadow-sm transition-transform duration-500 hover:scale-[1.02] sm:rounded-2xl sm:p-5 sm:shadow-xl sm:shadow-rose-500/20 lg:p-6">
                <div className="absolute right-0 top-0 hidden transform p-4 opacity-20 transition-transform duration-500 group-hover:rotate-12 sm:block">
                    <ArrowUpCircle size={44} />
                </div>
                <p className="mb-0.5 truncate text-[10px] font-bold opacity-80 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">إجمالي الصرف</p>
                <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight sm:text-xl lg:text-2xl">{formatCurrency(totals.paymentAmount)}</h2>
                <div className="mt-2 hidden items-center gap-2 text-[10px] font-bold sm:flex">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5">{totals.paymentCount} سند صرف</span>
                </div>
            </div>

            <div className={cn(
                "group relative min-w-0 overflow-hidden rounded-lg p-1.5 shadow-sm transition-transform duration-500 hover:scale-[1.02] sm:rounded-2xl sm:p-5 sm:shadow-xl lg:p-6",
                totals.netAmount >= 0
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white sm:shadow-blue-500/20'
                    : 'bg-gradient-to-br from-orange-500 to-red-600 text-white sm:shadow-orange-500/20'
            )}>
                <div className="absolute right-0 top-0 hidden transform p-4 opacity-20 transition-transform duration-500 group-hover:scale-110 sm:block">
                    <Wallet size={44} />
                </div>
                <p className="mb-0.5 truncate text-[10px] font-bold opacity-80 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">صافي التدفق</p>
                <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight sm:text-xl lg:text-2xl">{formatCurrency(Math.abs(totals.netAmount))}</h2>
                <div className="mt-2 hidden items-center gap-2 sm:flex">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold">
                        {totals.netAmount >= 0 ? 'فائض نقدي' : 'عجز نقدي'}
                    </span>
                </div>
            </div>

            <div className="group relative min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-[var(--app-surface)] p-1.5 shadow-sm transition-transform duration-500 hover:scale-[1.02] dark:border-slate-800 sm:rounded-2xl sm:p-5 sm:shadow-lg lg:p-6">
                <div className="absolute bottom-0 right-0 hidden transform p-4 opacity-5 transition-transform duration-500 group-hover:-translate-y-2 sm:block">
                    <Activity size={56} className="text-amber-500" />
                </div>
                <p className="mb-0.5 truncate text-[10px] font-bold text-slate-400 sm:mb-2 sm:text-[10px] sm:uppercase sm:tracking-widest">متوسط السند</p>
                <h2 dir="ltr" className="truncate text-right font-mono text-[11px] font-black tracking-tight text-slate-900 dark:text-white sm:text-xl lg:text-2xl">{formatCurrency(analytics.avgAmount)}</h2>
                <p className="mt-2 hidden text-[10px] font-bold text-slate-400 sm:block">{analytics.count} سند</p>
            </div>
        </div>
    );
};

export default BondKpiCards;
