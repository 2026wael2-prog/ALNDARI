import { formatCurrency, formatNumberDisplay } from '../../../../core/utils';
import type { IntelligenceEngineOutput, OrchestrationResult } from '../../types';

export interface CommandReply {
  answer: string;
  suggestedTab?: string;
  suggestedTabLabel?: string;
}

/**
 * Deterministic, read-only conversational command parser for the AI Command Center.
 * Answers manager queries using live orchestrated data without executing unauthorized mutations.
 */
export function parseManagerCommand(
  query: string,
  output: IntelligenceEngineOutput,
  orchestration: OrchestrationResult
): CommandReply {
  const q = query.trim().toLowerCase();
  const k = output.overviewKpis;

  if (!q) {
    return {
      answer: 'يرجى كتابة سؤالك أو أمرك، مثل: "ما هي الأصناف الحرجة؟" أو "فرص التحويل" أو "سلامة البيانات".',
    };
  }

  if (q.includes('نفاد') || q.includes('حرج') || q.includes('stockout')) {
    const critical = orchestration.decisions
      .filter(d => d.riskLevel === 'critical' && d.productId)
      .slice(0, 5);
    const list = critical.map((d, i) => `${i + 1}. ${d.productName} — ${d.recommendedAction}`).join('\n');
    return {
      answer: `تم رصد ${formatNumberDisplay(k.zeroStockAcrossAllBranches)} صنف نافد في جميع الفروع و${formatNumberDisplay(k.productsApproachingStockout)} صنف مهدد بالنفاد.\n\nأهم الحالات الحرجة:\n${list || 'لا توجد حالات حرجة حالياً ✅'}`,
      suggestedTab: 'purchase_recs',
      suggestedTabLabel: 'الانتقال إلى توصيات الشراء',
    };
  }

  if (q.includes('تحويل') || q.includes('فروع') || q.includes('transfer')) {
    const topTr = output.transferRecommendations.slice(0, 5);
    const list = topTr
      .map((t, i) => `${i + 1}. ${t.productName}: ${t.recommendedQty} وحدة (${t.fromBranchName} ⬅️ ${t.toBranchName})`)
      .join('\n');
    return {
      answer: `توجد ${formatNumberDisplay(k.pendingTransferCount)} فرصة تحويل داخلي بين الفروع توفر ${formatCurrency(k.estimatedTransferCapitalSaved)} قبل اللجوء للشراء الخارجي.\n\n${list || 'لا توجد تحويلات مقترحة حالياً.'}`,
      suggestedTab: 'transfers',
      suggestedTabLabel: 'فتح تبويب توصيات التحويل',
    };
  }

  if (q.includes('شراء') || q.includes('مشتريات') || q.includes('buy') || q.includes('po')) {
    const topPo = output.purchaseRecommendations.slice(0, 5);
    const list = topPo
      .map((r, i) => `${i + 1}. ${r.productName}: ${r.recommendedQty} وحدة (${r.recommendedSupplier?.supplierName ?? 'غير محدد'}) — ${formatCurrency(r.estimatedCost)}`)
      .join('\n');
    return {
      answer: `إجمالي توصيات الشراء الصافية: ${formatNumberDisplay(k.productsRequiringPurchase)} صنف بتكلفة تقديرية ${formatCurrency(k.estimatedRecommendedPurchaseValue)}.\n\nأولويات الشراء:\n${list || 'لا توجد توصيات شراء حالياً.'}`,
      suggestedTab: 'purchase_recs',
      suggestedTabLabel: 'فتح تبويب توصيات الشراء',
    };
  }

  if (q.includes('راكد') || q.includes('فائض') || q.includes('dead')) {
    return {
      answer: `يوجد ${formatNumberDisplay(k.deadStockCount)} صنف راكد و${formatNumberDisplay(k.excessStockCount)} صنف فائض بقيمة رأس مال مجمد ${formatCurrency(k.totalExcessInventoryValue)}.`,
      suggestedTab: 'dead_stock',
      suggestedTabLabel: 'فتح تبويب الراكد والفائض',
    };
  }

  if (q.includes('مورد') || q.includes('supplier')) {
    const supAlerts = orchestration.decisions.filter(d => d.agentId === 'supplier_intelligence');
    return {
      answer: `وكيل ذكاء الموردين رصد ${supAlerts.length} تنبيه مورد (نقص مورد مسجل أو بطء توريد أو ارتفاع مرتجعات).`,
      suggestedTab: 'suppliers',
      suggestedTabLabel: 'فتح تبويب الموردين',
    };
  }

  if (q.includes('سلامة') || q.includes('تدقيق') || q.includes('وكلاء') || q.includes('audit') || q.includes('health')) {
    const agentsSummary = orchestration.agentRuns
      .map(a => `• ${a.agentNameAr}: ${a.status === 'healthy' ? '🟢 سليم' : a.status === 'warning' ? '🟡 تحذير' : '🔴 خطأ'} — ${a.summary}`)
      .join('\n');
    return {
      answer: `حالة منظومة الوكلاء الثمانية:\n${agentsSummary}`,
    };
  }

  // Fallback: search by product name / SKU / part number
  const matches = output.products
    .filter(p =>
      `${p.identity.name} ${p.identity.sku} ${p.identity.partNumber}`.toLowerCase().includes(q)
    )
    .slice(0, 3);

  if (matches.length > 0) {
    const details = matches
      .map(
        p =>
          `• ${p.identity.name} (${p.identity.partNumber}): المتاح ${p.companyMetrics.availableStock} | التوقع 30ي: ${p.forecast30d.predictedQty} | المورد: ${p.suppliers[0]?.supplierName ?? '—'}`
      )
      .join('\n');
    return {
      answer: `نتائج البحث في ذكاء المخزون لـ "${query}":\n${details}`,
      suggestedTab: 'top_moving',
      suggestedTabLabel: 'عرض في جدول الأصناف',
    };
  }

  return {
    answer: `ملخص القيادة الذاتية: ${orchestration.summary.totalDecisions} قرار موحد، ${orchestration.summary.criticalRisks} حالة حرجة، ${orchestration.summary.awaitingApproval} بانتظار الاعتماد، و${orchestration.summary.verifiedCount} قرار متحقق من تنفيذه. يمكنك السؤال عن: النفاد، التحويلات، الشراء، الراكد، الموردين، أو حالة الوكلاء.`,
  };
}
