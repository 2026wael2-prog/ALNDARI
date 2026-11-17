import { supabase } from '../../../lib/supabaseClient';

/** Analytics and reporting functions */
export const analyticsApi = {
  getInventoryAnalytics: async (companyId: string, from?: string, to?: string) => {
    let query = supabase
      .from('invoice_items')
      .select(
        `
        quantity,
        unit_price,
        total,
        product_id,
        products!inner(id, name_ar, sku, purchase_price, cost_price),
        invoices!inner(id, issue_date, type, status)
      `
      )
      .eq('invoices.company_id', companyId)
      .neq('invoices.status', 'void')
      .in('invoices.type', ['sale', 'sale_return', 'return_sale', 'sales_return']);

    if (from) {
      query = query.gte('invoices.issue_date', from);
    }
    if (to) {
      query = query.lte('invoices.issue_date', to);
    }

    return await query;
  },

  getDeadStock: async (companyId: string, daysThreshold: number) => {
    return await supabase.rpc('get_dead_stock', {
      p_company_id: companyId,
      days_threshold: daysThreshold,
    });
  },

  getProductAnalytics: async (productId: string) => {
    const { data, error } = await supabase
      .from('invoice_items')
      .select(
        `
                quantity,
                total,
                cost_price,
                invoices!inner(issue_date, type, status, currency_code, exchange_rate)
            `
      )
      .eq('product_id', productId)
      .in('invoices.status', ['posted', 'paid', 'confirmed', 'partially_paid']);

    if (error) return { data: null, error };

    const rows = (data || []) as Array<{
      quantity?: number | null;
      total?: number | null;
      cost_price?: number | null;
      invoices?: {
        issue_date?: string | null;
        type?: string | null;
        currency_code?: string | null;
        exchange_rate?: number | null;
      } | null;
    }>;

    let totalQuantitySold = 0;
    let totalPurchasesQty = 0;
    let totalRevenue = 0;
    let totalCogs = 0;
    let saleTxCount = 0;
    let lastSaleDate: string | null = null;

    rows.forEach(row => {
      const invType = row.invoices?.type;
      const qty = Number(row.quantity) || 0;
      const lineTotal = Number(row.total) || 0;
      const lineCost = Number(row.cost_price) || 0;
      const rate = Number(row.invoices?.exchange_rate) || 1;
      const isYer = row.invoices?.currency_code === 'YER' && rate > 1;
      const toBase = (val: number) => (isYer ? val / rate : row.invoices?.currency_code && row.invoices.currency_code !== 'SAR' ? val * rate : val);

      if (invType === 'sale' || invType === 'sale_return' || invType === 'return_sale') {
        const mult = invType === 'sale' ? 1 : -1;
        totalQuantitySold += qty * mult;
        totalRevenue += toBase(lineTotal) * mult;
        totalCogs += toBase(lineCost) * qty * mult;
        saleTxCount += 1;

        if (invType === 'sale' && row.invoices?.issue_date && (!lastSaleDate || row.invoices.issue_date > lastSaleDate)) {
          lastSaleDate = row.invoices.issue_date;
        }
      } else if (invType === 'purchase' || invType === 'purchase_return' || invType === 'return_purchase') {
        const mult = invType === 'purchase' ? 1 : -1;
        totalPurchasesQty += qty * mult;
      }
    });

    return {
      data: {
        total_quantity_sold: totalQuantitySold,
        total_purchases_qty: totalPurchasesQty,
        total_revenue: totalRevenue,
        total_profit: totalRevenue - totalCogs,
        transaction_count: saleTxCount,
        last_sale_date: lastSaleDate,
      },
      error: null,
    };
  },

  getLowStockProducts: async (companyId: string) => {
    return await supabase.rpc('get_low_stock_products', { p_company_id: companyId });
  },
};
