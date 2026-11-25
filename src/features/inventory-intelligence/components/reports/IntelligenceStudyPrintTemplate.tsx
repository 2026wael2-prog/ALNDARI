import React from 'react';
import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import type { IntelligenceEngineOutput } from '../../types';

interface Props {
  output: IntelligenceEngineOutput;
  companyName?: string;
}

export const IntelligenceStudyPrintTemplate = React.forwardRef<HTMLDivElement, Props>(
  ({ output, companyName = 'منظومة النظاري لقطع الغيار' }, ref) => {
    const k = output.overviewKpis;
    const topPurchases = output.purchaseRecommendations.slice(0, 20);
    const topTransfers = output.transferRecommendations.slice(0, 15);
    const topDead = output.deadExcessRecommendations.slice(0, 15);

    return (
      <div
        ref={ref}
        dir="rtl"
        className="mx-auto w-full max-w-[794px] bg-white p-2.5 text-slate-900 print:w-[794px] print:p-6 sm:p-6"
        style={{ fontFamily: 'Tahoma, Arial, sans-serif' }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 sm:text-lg">{companyName}</h1>
            <p className="text-[11px] font-bold text-blue-700 sm:text-xs">
              الدراسة التنفيذية الشاملة لذكاء المخزون والمشتريات والفروع
            </p>
          </div>
          <div className="text-left text-[11px] text-slate-600 sm:text-xs">
            <div>تاريخ التقرير: {new Date(output.generatedAt).toLocaleDateString('ar-YE')}</div>
            <div>النموذج الفائز: {output.championModel}</div>
          </div>
        </div>

        {/* KPIs Summary */}
        <div className="mb-4 grid grid-cols-2 gap-1.5 text-[11px] print:grid-cols-4 sm:mb-5 sm:grid-cols-4 sm:gap-2 sm:text-xs">
          <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
            <div className="text-slate-500">الأصناف المحللة</div>
            <div className="mt-1 font-mono text-sm font-bold">{formatNumberDisplay(k.totalAnalyzedProducts)}</div>
          </div>
          <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
            <div className="text-slate-500">توصيات الشراء الصافية</div>
            <div className="mt-1 font-mono text-sm font-bold text-blue-700">
              {formatNumberDisplay(k.productsRequiringPurchase)} ({formatCurrency(k.estimatedRecommendedPurchaseValue)})
            </div>
          </div>
          <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
            <div className="text-slate-500">وفورات التحويل الداخلي</div>
            <div className="mt-1 font-mono text-sm font-bold text-emerald-700">
              {formatNumberDisplay(k.pendingTransferCount)} ({formatCurrency(k.estimatedTransferCapitalSaved)})
            </div>
          </div>
          <div className="rounded border border-slate-300 bg-slate-50 p-2.5">
            <div className="text-slate-500">المخزون الراكد والفائض</div>
            <div className="mt-1 font-mono text-sm font-bold text-amber-700">
              {formatNumberDisplay(k.deadStockCount)} ({formatCurrency(k.totalExcessInventoryValue)})
            </div>
          </div>
        </div>

        {/* Top Purchases */}
        <div className="mb-5 overflow-x-auto print:overflow-visible" data-pdf-break>
          <h2 className="mb-2 border-r-4 border-blue-700 pr-2 text-xs font-bold text-slate-800">
            1. أولويات الشراء الصافية (أهم {topPurchases.length} صنف)
          </h2>
          <table className="w-full min-w-[520px] border-collapse border border-slate-300 text-xs print:min-w-0 sm:min-w-0">
            <thead className="bg-slate-100 font-bold">
              <tr>
                <th className="border border-slate-300 p-1.5 text-right">الصنف</th>
                <th className="border border-slate-300 p-1.5 text-center">المتاح</th>
                <th className="border border-slate-300 p-1.5 text-center">توقع 30ي</th>
                <th className="border border-slate-300 p-1.5 text-center">الموصى به</th>
                <th className="border border-slate-300 p-1.5 text-right">المورد المرشح</th>
                <th className="border border-slate-300 p-1.5 text-left">التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {topPurchases.map(r => (
                <tr key={r.id}>
                  <td className="border border-slate-300 p-1.5 font-bold">{r.productName}</td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono">{r.availableStock}</td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono">
                    {r.forecastDemand30d.toFixed(1)}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono font-bold text-blue-700">
                    {r.recommendedQty}
                  </td>
                  <td className="border border-slate-300 p-1.5">
                    {r.recommendedSupplier?.supplierName ?? '—'}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-left font-mono">
                    {formatCurrency(r.estimatedCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Transfers */}
        {topTransfers.length > 0 && (
          <div className="mb-5 overflow-x-auto print:overflow-visible" data-pdf-break>
            <h2 className="mb-2 border-r-4 border-emerald-700 pr-2 text-xs font-bold text-slate-800">
              2. فرص إعادة التوزيع بين الفروع (أهم {topTransfers.length} تحويل)
            </h2>
            <table className="w-full min-w-[460px] border-collapse border border-slate-300 text-xs print:min-w-0 sm:min-w-0">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="border border-slate-300 p-1.5 text-right">الصنف</th>
                  <th className="border border-slate-300 p-1.5 text-right">من فرع</th>
                  <th className="border border-slate-300 p-1.5 text-right">إلى فرع</th>
                  <th className="border border-slate-300 p-1.5 text-center">الكمية</th>
                  <th className="border border-slate-300 p-1.5 text-left">الوفر</th>
                </tr>
              </thead>
              <tbody>
                {topTransfers.map(t => (
                  <tr key={t.id}>
                    <td className="border border-slate-300 p-1.5 font-bold">{t.productName}</td>
                    <td className="border border-slate-300 p-1.5">{t.fromBranchName}</td>
                    <td className="border border-slate-300 p-1.5">{t.toBranchName}</td>
                    <td className="border border-slate-300 p-1.5 text-center font-mono font-bold">
                      {t.recommendedQty}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-left font-mono text-emerald-700">
                      {formatCurrency(t.capitalSaved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Dead & Excess */}
        {topDead.length > 0 && (
          <div className="overflow-x-auto print:overflow-visible" data-pdf-break>
            <h2 className="mb-2 border-r-4 border-amber-700 pr-2 text-xs font-bold text-slate-800">
              3. أعلى الأصناف في المخزون الراكد والفائض
            </h2>
            <table className="w-full min-w-[420px] border-collapse border border-slate-300 text-xs print:min-w-0 sm:min-w-0">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="border border-slate-300 p-1.5 text-right">الصنف</th>
                  <th className="border border-slate-300 p-1.5 text-center">المتاح</th>
                  <th className="border border-slate-300 p-1.5 text-left">القيمة</th>
                  <th className="border border-slate-300 p-1.5 text-right">الإجراء المقترح</th>
                </tr>
              </thead>
              <tbody>
                {topDead.map(d => (
                  <tr key={d.id}>
                    <td className="border border-slate-300 p-1.5 font-bold">{d.productName}</td>
                    <td className="border border-slate-300 p-1.5 text-center font-mono">{d.currentStock}</td>
                    <td className="border border-slate-300 p-1.5 text-left font-mono">
                      {formatCurrency(d.stockValue)}
                    </td>
                    <td className="border border-slate-300 p-1.5">{d.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
);

IntelligenceStudyPrintTemplate.displayName = 'IntelligenceStudyPrintTemplate';
