import { formatCurrency, formatNumberDisplay } from '../../../core/utils';
import type { IntelligenceEngineOutput, PurchaseRecommendation } from '../types';

export type DigestScope = 'executive' | 'critical_stockout' | 'purchase' | 'transfers' | 'dead_stock';

export function buildExecutiveDigestMessage(
  output: IntelligenceEngineOutput,
  scope: DigestScope = 'executive',
  companyName = 'منظومة النظاري لقطع الغيار'
): string {
  const k = output.overviewKpis;
  const dateStr = new Date(output.generatedAt).toLocaleDateString('ar-YE');

  if (scope === 'critical_stockout') {
    const critical = output.purchaseRecommendations
      .filter(r => r.urgency === 'critical' || r.urgency === 'high')
      .slice(0, 12);
    const lines = critical.map(
      (r, idx) =>
        `${idx + 1}. ${r.productName} (${r.sku}) — المتاح: ${r.availableStock} | المطلوب: ${r.recommendedQty}`
    );
    return [
      `🚨 *تنبيه النفاد الحرج — ${companyName}*`,
      `📅 التاريخ: ${dateStr}`,
      `⚠️ أصناف مهددة بالنفاد: ${k.productsApproachingStockout} | نافدة بالكامل: ${k.zeroStockAcrossAllBranches}`,
      '',
      ...(lines.length > 0 ? lines : ['لا توجد أصناف حرجة حالياً ✅']),
    ].join('\n');
  }

  if (scope === 'purchase') {
    const topPo = output.purchaseRecommendations.slice(0, 12);
    const lines = topPo.map(
      (r, idx) =>
        `${idx + 1}. ${r.productName} | كمية: ${r.recommendedQty} | المورد: ${r.recommendedSupplier?.supplierName ?? 'غير محدد'} | ${formatCurrency(r.estimatedCost)}`
    );
    return [
      `🛒 *ملخص توصيات الشراء الصافية — ${companyName}*`,
      `📅 ${dateStr} | إجمالي الأصناف: ${k.productsRequiringPurchase} | التكلفة التقديرية: ${formatCurrency(k.estimatedRecommendedPurchaseValue)}`,
      '',
      ...(lines.length > 0 ? lines : ['لا توجد توصيات شراء حالياً ✅']),
    ].join('\n');
  }

  if (scope === 'transfers') {
    const topTr = output.transferRecommendations.slice(0, 12);
    const lines = topTr.map(
      (t, idx) =>
        `${idx + 1}. ${t.productName}: ${t.recommendedQty} وحدة (${t.fromBranchName} ⬅️ ${t.toBranchName})`
    );
    return [
      `🔄 *ملخص التحويلات الداخلية بين الفروع — ${companyName}*`,
      `📅 ${dateStr} | عدد الفرص: ${k.pendingTransferCount} | الوفر المالي: ${formatCurrency(k.estimatedTransferCapitalSaved)}`,
      '',
      ...(lines.length > 0 ? lines : ['لا توجد تحويلات مقترحة حالياً ✅']),
    ].join('\n');
  }

  if (scope === 'dead_stock') {
    const topDead = output.deadExcessRecommendations.slice(0, 12);
    const lines = topDead.map(
      (d, idx) =>
        `${idx + 1}. ${d.productName} — المتاح: ${d.currentStock} | القيمة: ${formatCurrency(d.stockValue)}`
    );
    return [
      `🧊 *ملخص المخزون الراكد والفائض — ${companyName}*`,
      `📅 ${dateStr} | الأصناف الراكدة: ${k.deadStockCount} | رأس المال المجمد: ${formatCurrency(k.totalExcessInventoryValue)}`,
      '',
      ...(lines.length > 0 ? lines : ['لا توجد أصناف راكدة كبيرة ✅']),
    ].join('\n');
  }

  // Executive comprehensive summary
  const top3Po = output.purchaseRecommendations
    .slice(0, 5)
    .map((r, i) => `  ${i + 1}. ${r.productName}: ${r.recommendedQty} (${r.recommendedSupplier?.supplierName ?? '—'})`)
    .join('\n');

  return [
    `📊 *الملخص التنفيذي لذكاء المخزون — ${companyName}*`,
    `📅 التاريخ: ${dateStr}`,
    `━━━━━━━━━━━━━━`,
    `• إجمالي الأصناف المحللة: ${formatNumberDisplay(k.totalAnalyzedProducts)}`,
    `• أصناف تتطلب شراءً: ${formatNumberDisplay(k.productsRequiringPurchase)} (${formatCurrency(k.estimatedRecommendedPurchaseValue)})`,
    `• مهددة بالنفاد / نافدة: ${formatNumberDisplay(k.productsApproachingStockout)} / ${formatNumberDisplay(k.zeroStockAcrossAllBranches)}`,
    `• تحويلات داخلية مقترحة: ${formatNumberDisplay(k.pendingTransferCount)} (وفر: ${formatCurrency(k.estimatedTransferCapitalSaved)})`,
    `• المخزون الراكد والفائض: ${formatNumberDisplay(k.deadStockCount)} (${formatCurrency(k.totalExcessInventoryValue)})`,
    '',
    '🔝 *أهم أولويات الشراء:*',
    top3Po || 'لا توجد توصيات شراء عاجلة',
  ].join('\n');
}

export function buildPurchaseOrderShareMessage(
  rec: PurchaseRecommendation,
  companyName = 'منظومة النظاري لقطع الغيار'
): string {
  return [
    `📦 *طلب تسعير / شراء مقترح — ${companyName}*`,
    `• الصنف: ${rec.productName}`,
    `• رقم القطعة / SKU: ${rec.partNumber} / ${rec.sku}`,
    `• الكمية المطلوبة: ${rec.recommendedQty} وحدة`,
    `• المورد المرشح: ${rec.recommendedSupplier?.supplierName ?? 'غير محدد'}`,
    `• السعر المرجعي: ${rec.recommendedSupplier ? formatCurrency(rec.recommendedSupplier.lastUnitPrice) : '—'}`,
    `• الإجمالي التقديري: ${formatCurrency(rec.estimatedCost)}`,
  ].join('\n');
}
