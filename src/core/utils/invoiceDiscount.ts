/**
 * [AUDIT-FIX] توزيع خصم فاتورة على البنود بشكل تناسبي وتحويل أسعار الوحدات إلى
 * صافية قبل الإرسال إلى commit_sales_invoice_v2.
 *
 * الخلفية: دالة الاعتماد الخادمية لا تقبل `discount` إطلاقاً وتُهمله، فكان
 * الإجمالي المخزَّن أعلى من «الصافي» الذي تعرضه الواجهة. بتوزيع الخصم على
 * unit_price للبنود (بعد تقريب 4 منازل) يطابق المبلغ المخزَّن إجمالي الواجهة.
 */

export interface NetUnitLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export const roundTo4 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000;

/**
 * توزيع الخصم الكلي على البنود بنسبة (قيمة البند / الإجمالي) مع سقف للخصم عند
 * قيمة الفاتورة كاملة (لا يمكن أن يصبح إجمالي البند سالباً).
 *
 * @returns نسخة جديدة من البنود بأسعار وحدات صافية (تُترك البنود بلا خصم كما هي)
 */
export const netUnitPrices = (
  items: readonly NetUnitLine[],
  invoiceDiscount: number
): NetUnitLine[] => {
  const safeDiscount =
    Number.isFinite(invoiceDiscount) && invoiceDiscount > 0 ? invoiceDiscount : 0;

  if (safeDiscount <= 0) return items.map(item => ({ ...item }));

  const subtotal = items.reduce((sum, item) => {
    const qty = item.quantity > 0 ? item.quantity : 0;
    const unit = item.unitPrice > 0 ? item.unitPrice : 0;
    return sum + qty * unit;
  }, 0);

  if (subtotal <= 0) return items.map(item => ({ ...item }));

  const cappedDiscount = Math.min(safeDiscount, subtotal);
  const targetNetTotal = Math.max(0, subtotal - cappedDiscount);

  const adjusted = items.map(item => {
    const qty = item.quantity > 0 ? item.quantity : 0;
    const unit = item.unitPrice > 0 ? item.unitPrice : 0;
    const lineGross = qty * unit;
    if (qty <= 0 || lineGross <= 0) return { ...item };
    const lineShare = lineGross / subtotal;
    const netLine = lineGross - cappedDiscount * lineShare;
    return { ...item, unitPrice: roundTo4(Math.max(0, netLine) / qty) };
  });

  // [AUDIT FIX 12] Reconcile rounding drift (e.g. 300 × 1 with 0.01 discount)
  const actualNetTotal = adjusted.reduce(
    (sum, item) => sum + (item.quantity > 0 ? item.quantity : 0) * Math.max(0, item.unitPrice),
    0
  );
  const residual = targetNetTotal - actualNetTotal;
  if (Math.abs(residual) >= 0.005) {
    // Pick the eligible line with the smallest quantity (best unit-price granularity)
    let bestIdx = -1;
    let bestQty = Infinity;
    adjusted.forEach((item, idx) => {
      if (item.quantity > 0 && item.unitPrice > 0 && item.quantity < bestQty) {
        bestQty = item.quantity;
        bestIdx = idx;
      }
    });
    if (bestIdx !== -1) {
      const targetLine = adjusted[bestIdx];
      const deltaPerUnit = residual / targetLine.quantity;
      const newUnit = Math.max(0, targetLine.unitPrice + deltaPerUnit);
      adjusted[bestIdx] = {
        ...targetLine,
        // Use up to 6 decimals only when 4 decimals would lose the residual on large quantities
        unitPrice:
          Math.abs(roundTo4(newUnit) * targetLine.quantity - (targetLine.unitPrice * targetLine.quantity + residual)) < 0.005
            ? roundTo4(newUnit)
            : Math.round((newUnit + Number.EPSILON) * 1_000_000) / 1_000_000,
      };
    }
  }

  return adjusted;
};
