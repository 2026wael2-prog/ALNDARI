import React, { useEffect, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, User, ShoppingBag, Package, Phone, ShieldCheck, ExternalLink, Layers, Eye } from 'lucide-react';
import { useEntity360Profile } from '../../hooks/useBiAnalytics';
import { formatCurrency, formatNumberDisplay } from '@/core/utils';

const InvoiceDetailsModal = lazy(() => import('../../../sales/components/details/InvoiceDetailsModal'));
const PurchaseDetailsModal = lazy(() => import('../../../purchases/components/PurchaseDetailsModal'));

export interface Entity360DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'customer' | 'supplier' | 'product' | null;
  entityId: string | null;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

const KPI_LABELS: Record<string, string> = {
  total_sales: 'إجمالي المبيعات',
  invoices_count: 'عدد الفواتير',
  returns_count: 'فواتير المرتجع',
  avg_invoice: 'متوسط الفاتورة',
  total_paid: 'إجمالي المسدد',
  total_purchases: 'إجمالي المشتريات',
  bills_count: 'فواتير التوريد',
  avg_bill: 'متوسط فاتورة التوريد',
  total_sold_quantity: 'الكمية المباعة',
  total_returned_quantity: 'الكمية المرتجعة',
  total_revenue: 'صافي الإيراد',
  gross_profit: 'إجمالي الربح',
};

const isCurrencyKpi = (key: string): boolean =>
  key.includes('amount') ||
  key.includes('sales') ||
  key.includes('purchases') ||
  key.includes('profit') ||
  key.includes('paid') ||
  key.includes('revenue') ||
  key.includes('avg');

export const Entity360Drawer: React.FC<Entity360DrawerProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  dateFrom,
  dateTo,
}) => {
  const navigate = useNavigate();
  const [previewTx, setPreviewTx] = useState<{ id: string; kind: 'sale' | 'purchase' } | null>(null);
  const { data: profileData, isLoading } = useEntity360Profile(entityType, entityId, dateFrom, dateTo);

  useEffect(() => {
    setPreviewTx(null);
  }, [entityId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewTx) {
          setPreviewTx(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, previewTx]);

  if (!isOpen || !entityType || !entityId) return null;

  const profile = profileData?.profile;
  const stock = profileData?.stock;
  const kpis = profileData?.kpis || {};
  const timeline = profileData?.timeline || [];
  const topItems = profileData?.top_items || [];
  const recentTransactions = profileData?.recent_transactions || [];

  const title =
    entityType === 'customer'
      ? profile?.name || 'الملف التحليلي للعميل'
      : entityType === 'supplier'
        ? profile?.name || 'الملف التحليلي للمورد'
        : profile?.name_ar || profile?.sku || 'الملف التحليلي للمنتج';

  const content = (
    <div
      dir="rtl"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex justify-end bg-slate-900/50 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              {entityType === 'customer' ? (
                <User size={20} />
              ) : entityType === 'supplier' ? (
                <ShoppingBag size={20} />
              ) : (
                <Package size={20} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  الملف التحليلي الشامل 360°
                </span>
                {profile?.status && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30">
                    {profile.status === 'active' ? 'نشط' : profile.status}
                  </span>
                )}
              </div>
              <h2 className="truncate text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-xs text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span>جاري تحميل الملف التحليلي...</span>
            </div>
          ) : (
            <>
              {/* Info Badges */}
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {profile?.phone && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="flex items-center gap-1.5 font-bold text-slate-400">
                      <Phone size={13} />
                      الهاتف
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{profile.phone}</span>
                  </div>
                )}
                {profile?.category && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="flex items-center gap-1.5 font-bold text-slate-400">
                      <ShieldCheck size={13} />
                      التصنيف
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{profile.category}</span>
                  </div>
                )}
                {profile?.balance !== undefined && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="font-bold text-slate-400">الرصيد الدفتري:</span>
                    <span
                      className={`font-mono font-bold ${
                        profile.balance > 0
                          ? 'text-rose-600'
                          : profile.balance < 0
                            ? 'text-emerald-600'
                            : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {formatCurrency(profile.balance, 'SAR')}
                    </span>
                  </div>
                )}
                {profile?.part_number && (
                  <div className="flex items-center justify-between rounded-xl border border-blue-200/70 bg-blue-50/50 px-3 py-2 dark:border-blue-900/40 dark:bg-blue-900/20">
                    <span className="font-bold text-blue-600 dark:text-blue-400">رقم القطعة (P/N):</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{profile.part_number}</span>
                  </div>
                )}
                {profile?.brand && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="font-bold text-slate-400">الشركة الصانعة:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{profile.brand}</span>
                  </div>
                )}
                {profile?.sku && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="font-bold text-slate-400">الرمز / SKU:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{profile.sku}</span>
                  </div>
                )}
                {profile?.sale_price !== undefined && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="font-bold text-slate-400">سعر البيع الافتراضي:</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(profile.sale_price, 'SAR')}
                    </span>
                  </div>
                )}
                {profile?.cost_price !== undefined && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="font-bold text-slate-400">سعر التكلفة:</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      {formatCurrency(profile.cost_price, 'SAR')}
                    </span>
                  </div>
                )}
                {stock && (
                  <div className="flex items-center justify-between rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-3 py-2 sm:col-span-2 dark:border-indigo-900/40 dark:bg-indigo-900/20">
                    <span className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                      <Layers size={13} />
                      إجمالي المخزون (كل الفروع):
                    </span>
                    <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">
                      {formatNumberDisplay(stock.total_quantity)} قطعة • {formatCurrency(stock.total_valuation, 'SAR')}
                    </span>
                  </div>
                )}
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {Object.entries(kpis).map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <span className="block text-[10px] font-bold text-slate-400">
                      {KPI_LABELS[key] || key}
                    </span>
                    <h4 className="mt-1 font-mono text-sm font-black text-slate-800 dark:text-slate-100">
                      {typeof val === 'number' && isCurrencyKpi(key)
                        ? formatCurrency(val, 'SAR')
                        : formatNumberDisplay(val)}
                    </h4>
                  </div>
                ))}
              </div>

              {/* Timeline Monthly Trend */}
              {timeline.length > 0 && (() => {
                const slice = timeline.slice(-8);
                const maxVal = Math.max(1, ...slice.map(x => Math.abs(x.revenue ?? x.purchases ?? x.quantity ?? 0)));
                return (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-800/50">
                    <h3 className="mb-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                      تطور التعامل الشهري (Timeline)
                    </h3>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {slice.map((t, idx) => {
                        const val = t.revenue ?? t.purchases ?? t.quantity ?? 0;
                        const pct = Math.max(10, Math.round((Math.abs(val) / maxVal) * 100));
                        return (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <span className="truncate max-w-full text-[10px] font-mono font-bold text-slate-500">
                              {val > 0 ? formatNumberDisplay(Math.round(val)) : 0}
                            </span>
                            <div className="flex h-20 w-full items-end rounded-lg bg-slate-100/80 p-1 dark:bg-slate-900/50">
                              <div
                                className="w-full rounded-md bg-blue-500 transition-all hover:bg-blue-600"
                                style={{ height: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {t.month}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Top 5 Related Items */}
              {topItems.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/70">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      أعلى الأصناف طلباً / شراءً
                    </h3>
                  </div>
                  <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2">الصنف</th>
                        <th className="px-3 py-2 text-center">الكمية</th>
                        <th className="px-3 py-2 text-left">القيمة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                            <div>{item.product_name}</div>
                            {(item.part_number || (item.brand && item.brand !== 'غير محدد')) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[10px] text-slate-400">
                                {item.part_number && (
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                    P/N: {item.part_number}
                                  </span>
                                )}
                                {item.brand && item.brand !== 'غير محدد' && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-sans font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {item.brand}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-500">
                            {formatNumberDisplay(item.total_quantity)}
                          </td>
                          <td className="px-3 py-2 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.total_amount, 'SAR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent Transactions List (Drill-Down) */}
              {recentTransactions.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/70">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      آخر المعاملات المسجلة (التتبع للمصدر)
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(entityType === 'supplier' ? '/purchases' : '/sales');
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <span>فتح الفواتير</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                  <table className="w-full border-collapse text-right text-xs [&_th]:border [&_th]:border-slate-200 dark:[&_th]:border-slate-700 [&_td]:border [&_td]:border-slate-200/80 dark:[&_td]:border-slate-800">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2">النوع</th>
                        <th className="px-3 py-2">رقم الفاتورة</th>
                        <th className="px-3 py-2 text-center">التاريخ</th>
                        <th className="px-3 py-2 text-left">المبلغ</th>
                        <th className="px-3 py-2 text-center">فتح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.map((tx, idx) => {
                        const isPurchaseTx = tx.type === 'purchase' || tx.type === 'purchase_return' || tx.type === 'return_purchase';
                        const openTx = () => setPreviewTx({ id: tx.id, kind: isPurchaseTx ? 'purchase' : 'sale' });
                        return (
                        <tr
                          key={idx}
                          onClick={openTx}
                          className="cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/60"
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                tx.type === 'sale'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : tx.type === 'purchase'
                                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                                    : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
                              }`}
                            >
                              {tx.type === 'sale' ? 'بيع' : tx.type === 'purchase' ? 'شراء' : 'مرتجع'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {tx.invoice_number || tx.id.slice(0, 8)}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-400">
                            {tx.issue_date}
                          </td>
                          <td className="px-3 py-2 text-left font-mono font-bold text-slate-800 dark:text-slate-100">
                            {formatCurrency(tx.total_amount, 'SAR')}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openTx();
                              }}
                              title="فتح تفاصيل الفاتورة"
                              className="inline-flex items-center justify-center rounded-lg p-1 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
                            >
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {previewTx && (
        <div onClick={e => e.stopPropagation()} className="relative z-[120]">
          <Suspense fallback={null}>
            {previewTx.kind === 'purchase' ? (
              <PurchaseDetailsModal
                invoiceId={previewTx.id}
                onClose={() => setPreviewTx(null)}
              />
            ) : (
              <InvoiceDetailsModal
                invoiceId={previewTx.id}
                onClose={() => setPreviewTx(null)}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
