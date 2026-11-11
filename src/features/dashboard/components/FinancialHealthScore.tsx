import React, { useState, useEffect, useRef } from 'react';
import { Heart, TrendingUp, Shield, Zap, Activity } from 'lucide-react';
import { cn } from '../../../core/utils';

interface FinancialHealthProps {
    stats?: {
        sales: number | string;
        purchases?: number | string;
        expenses: number | string;
        debts: number | string;
    };
    cashFlow?: {
        inflow: number;
        outflow: number;
        net: number;
    };
    targets?: {
        salesProgress?: number;
        collectionRate?: number;
    };
    className?: string;
}

const useCountUp = (end: number, duration = 400) => {
    const [count, setCount] = useState(0);
    const prevEnd = useRef(0);
    useEffect(() => {
        if (end === prevEnd.current) return;
        prevEnd.current = end;
        const startTime = Date.now();
        let animationFrameId: number;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(end * eased));
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };
        
        animationFrameId = requestAnimationFrame(animate);
        return () => { cancelAnimationFrame(animationFrameId); };
    }, [end, duration]);
    return count;
};

const FinancialHealthScore: React.FC<FinancialHealthProps> = ({
    stats, cashFlow, targets, className
}) => {
    const cleanNumber = (v: number | string | undefined) => {
        if (v === undefined || v === null) return 0;
        if (typeof v === 'number') return v;
        const clean = String(v).replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(clean);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const sales = cleanNumber(stats?.sales);
    const expenses = cleanNumber(stats?.expenses);
    const debts = cleanNumber(stats?.debts);

    const profitMargin = sales > 0 ? Math.max(-100, Math.min(100, ((sales - expenses) / sales) * 100)) : 0;
    const profitScore = Math.max(0, Math.min(30, (profitMargin > 0 ? profitMargin * 0.3 : 0)));
    const collectionScore = Math.min(25, (targets?.collectionRate || 0) * 0.25);

    // Cash Health based on net cash flow (inflow vs outflow)
    const totalFlow = (cashFlow?.inflow || 0) + (cashFlow?.outflow || 0);
    const cashHealthRaw = totalFlow > 0 ? ((cashFlow?.inflow || 0) / totalFlow) * 100 : 0;
    const cashScore = Math.min(25, cashHealthRaw * 0.25);

    const debtRatio = sales > 0 ? Math.max(0, 100 - (debts / sales) * 100) : 0;
    const debtScore = Math.min(20, debtRatio * 0.2);

    const totalComponentsScore = profitScore + collectionScore + cashScore + debtScore;
    let healthScore = Math.min(100, Math.round(totalComponentsScore));
    
    // Strict zero-state: If there are no sales and no expenses, or if all component scores are zero
    if ((sales === 0 && expenses === 0 && totalFlow === 0) || totalComponentsScore === 0) {
        healthScore = 0;
    }

    const animatedScore = useCountUp(healthScore, 400);

    const getScoreColor = () => {
        if (healthScore === 0) return { main: '#94a3b8', label: 'نشاط جديد' };
        if (healthScore >= 75) return { main: '#10b981', label: 'ممتاز' };
        if (healthScore >= 50) return { main: '#3b82f6', label: 'جيد' };
        if (healthScore >= 25) return { main: '#f59e0b', label: 'متوسط' };
        return { main: '#ef4444', label: 'ضعيف' };
    };

    const scoreColor = getScoreColor();
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

    const factors = [
        { label: 'الربح', score: profitScore, max: 30, icon: TrendingUp, color: 'text-emerald-500' },
        { label: 'التحصيل', score: collectionScore, max: 25, icon: Shield, color: 'text-blue-500' },
        { label: 'السيولة', score: cashScore, max: 25, icon: Zap, color: 'text-violet-500' },
        { label: 'الديون', score: debtScore, max: 20, icon: Activity, color: 'text-amber-500' },
    ];

    return (
        <div className={cn(
            "relative bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl p-4 transition-colors",
            className
        )}>
            <div className="flex items-center gap-4 max-md:gap-3">
                {/* Compact SVG Gauge */}
                <div className="relative flex-shrink-0">
                    <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90 w-24 h-24 max-md:w-20 max-md:h-20">
                        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-[var(--app-border)]" strokeWidth="8" />
                        <circle cx="60" cy="60" r={radius} fill="none"
                            stroke={scoreColor.main} strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                            style={{
                                transition: 'stroke-dashoffset 0.4s ease-out',
                            }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Heart size={12} style={{ color: scoreColor.main }} />
                        <span className="text-2xl max-md:text-lg font-bold font-mono tracking-tight text-[var(--app-text)]">
                            {animatedScore}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: scoreColor.main }}>
                            {scoreColor.label}
                        </span>
                    </div>
                </div>

                {/* Factor Breakdown */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-3">
                        <Heart size={14} className="text-rose-500" />
                        <h3 className="text-xs font-bold text-[var(--app-text)]">صحة النشاط المالي</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {factors.map((f) => (
                            <div key={f.label} className="bg-[var(--app-surface-hover)] border border-[var(--app-border)] rounded-lg p-2 transition-colors">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <f.icon size={11} className={f.color} />
                                        <span className="text-[10px] font-medium text-[var(--app-text-secondary)]">{f.label}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-[var(--app-text)] font-mono">{Math.round(f.score)}<span className="text-[var(--app-text-secondary)]">/{f.max}</span></span>
                                </div>
                                <div className="h-1 bg-[var(--app-border)] rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${(f.score / f.max) * 100}%`, background: scoreColor.main }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialHealthScore;
