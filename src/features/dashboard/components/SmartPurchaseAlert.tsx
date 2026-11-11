import React, { useState } from 'react';
import { ShoppingCart, Loader2, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { aiService } from '../../ai/service';

interface Props {
  lowStockItems: Array<{
    id?: string;
    name: string;
    quantity: number;
    min_quantity: number;
    avgMonthlyUsage?: number;
  }>;
}

const SmartPurchaseAlert: React.FC<Props> = ({ lowStockItems }) => {
  const [result, setResult] = useState<{
    items: Array<{ name: string; suggestedQty: number; priority: string }>;
    summary: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const generate = async () => {
    if (lowStockItems.length === 0) return;
    setIsLoading(true);
    try {
      const data = await aiService.generateSmartPurchaseOrders(lowStockItems);
      setResult(data);
      setIsExpanded(true);
    } catch {
      /* ignore */
    }
    setIsLoading(false);
  };

  if (lowStockItems.length === 0) return null;

  const priorityColors: Record<string, string> = {
    عاجل: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
    متوسط: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    منخفض: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  };

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
            <ShoppingCart size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[var(--app-text)]">اقتراح أوامر الشراء</h3>
            <p className="text-[10px] text-[var(--app-text-secondary)]">
              {lowStockItems.length} منتج منخفض المخزون
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'تحليل النواقص'}
          </button>
          {result && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(!isExpanded);
              }}
              className="rounded-md p-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {result && isExpanded && (
        <div className="mt-3 space-y-2 border-t border-[var(--app-border)] pt-3">
          <p className="text-xs text-[var(--app-text)]">{result.summary}</p>
          <div className="space-y-1.5">
            {result.items?.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg bg-[var(--app-surface-hover)] p-2 text-xs"
              >
                <Package size={12} className="shrink-0 text-[var(--app-text-secondary)]" />
                <span className="flex-1 font-medium text-[var(--app-text)]">{item.name}</span>
                <span className="font-mono font-bold text-[var(--app-text)]">
                  {item.suggestedQty} وحدة
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${priorityColors[item.priority] || priorityColors['منخفض']}`}
                >
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartPurchaseAlert;
