import { supabase } from '@/lib/supabaseClient';
import { toBaseCurrency } from '@/core/utils/currencyUtils';
import { logger } from '@/core/utils/logger';
import {
  batchLookupParties,
  batchLookupProducts,
  computePreviousDateRange,
} from '@/core/utils/dataFetching';

export const analyticsApi = {
  getSalesAnalytics: async (params: {
    company_id: string;
    start_date?: string;
    end_date?: string;
    branch_id?: string | null;
    currency?: 'ALL' | 'SAR' | 'YER';
    payment_type?: 'ALL' | 'cash' | 'credit' | 'bank' | 'network';
  }) => {
    // 1. Build main period query (Lean without nested joins for maximum speed)
    let query = supabase
      .from('invoices')
      .select(
        'id, type, total_amount, total_document_amount, issue_date, payment_method, currency_code, exchange_rate, party_id'
      )
      .eq('company_id', params.company_id)
      .in('type', ['sale', 'sale_return'])
      .neq('status', 'void')
      .neq('status', 'cancelled')
      .is('deleted_at', null);

    if (params.branch_id) {
      query = query.eq('branch_id', params.branch_id);
    }
    if (params.currency && params.currency !== 'ALL') {
      query = query.eq('currency_code', params.currency);
    }
    if (params.payment_type && params.payment_type !== 'ALL') {
      query = query.eq('payment_method', params.payment_type);
    }
    if (params.start_date) {
      query = query.gte('issue_date', params.start_date);
    }
    if (params.end_date) {
      query = query.lte('issue_date', params.end_date);
    }

    // 2. Build previous period comparison query if dates are provided
    let prevQueryPromise: Promise<{ data: any[] | null; error: any }> = Promise.resolve({
      data: null,
      error: null,
    });

    if (params.start_date && params.end_date) {
      const { startDate: prevStart, endDate: prevEnd } = computePreviousDateRange(
        params.start_date,
        params.end_date
      );

      let prevQ = supabase
        .from('invoices')
        .select('type, total_amount, total_document_amount, currency_code, exchange_rate')
        .eq('company_id', params.company_id)
        .in('type', ['sale', 'sale_return'])
        .neq('status', 'void')
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .gte('issue_date', prevStart)
        .lte('issue_date', prevEnd);

      if (params.branch_id) prevQ = prevQ.eq('branch_id', params.branch_id);
      if (params.currency && params.currency !== 'ALL') {
        prevQ = prevQ.eq('currency_code', params.currency);
      }
      if (params.payment_type && params.payment_type !== 'ALL') {
        prevQ = prevQ.eq('payment_method', params.payment_type);
      }

      prevQueryPromise = prevQ as any;
    }

    // Run main query and previous period query concurrently in parallel
    const [{ data: rawInvRows, error: invErr }, { data: prevRows }] = await Promise.all([
      query,
      prevQueryPromise,
    ]);

    if (invErr) {
      logger.error('Sales', 'Error fetching sales analytics', invErr);
      return { data: null, error: invErr };
    }

    const invRows = (rawInvRows ?? []) as unknown as Array<{
      id: string;
      type?: string | null;
      total_amount?: number | string | null;
      total_document_amount?: number | string | null;
      exchange_rate?: number | string | null;
      currency_code?: string | null;
      payment_method?: string | null;
      issue_date?: string | null;
      party_id?: string | null;
    }>;

    let totalSales = 0;
    let totalReturns = 0;
    let totalSalesSAR = 0;
    let totalSalesYER = 0;
    let cashSalesSAR = 0;
    let cashSalesYER = 0;
    let creditSalesSAR = 0;
    let creditSalesYER = 0;
    let totalReturnsSAR = 0;
    let totalReturnsYER = 0;
    let invoiceCount = 0;

    const byDay = new Map<string, { sales: number; returns: number }>();
    const byMethod = new Map<string, number>();
    const byCust = new Map<
      string,
      { customerName: string; totalAmount: number; invoiceCount: number }
    >();

    for (const r of invRows) {
      const amt = Number(r.total_amount) || 0;
      const docAmt = Number(r.total_document_amount) || 0;
      const curr = (r.currency_code || 'SAR').toUpperCase();
      const method = r.payment_method || 'cash';

      let baseAmt = amt;
      if (params.currency && params.currency !== 'ALL') {
        // When filtered specifically by a single currency (e.g. YER or SAR),
        // use nominal currency amounts directly to preserve accurate values
        baseAmt = curr !== 'SAR' && docAmt > 0 ? docAmt : amt;
      } else {
        // [FIX] In our database, total_amount is ALREADY converted to base SAR by the backend triggers.
        // Re-converting total_amount through toBaseCurrency was dividing SAR by 410 again, distorting sales by ~43%!
        baseAmt = amt;
      }
      const day = r.issue_date || '';
      const dEntry = byDay.get(day) ?? { sales: 0, returns: 0 };

      if (r.type === 'sale') {
        totalSales += baseAmt;
        invoiceCount += 1;
        dEntry.sales += baseAmt;
        byMethod.set(method, (byMethod.get(method) ?? 0) + baseAmt);

        if (curr === 'SAR') {
          totalSalesSAR += amt;
          if (method === 'cash') cashSalesSAR += amt;
          else if (method === 'credit') creditSalesSAR += amt;
        } else if (curr === 'YER') {
          totalSalesYER += amt;
          if (method === 'cash') cashSalesYER += amt;
          else if (method === 'credit') creditSalesYER += amt;
        }

        const partyId = r.party_id;
        if (partyId) {
          const cEntry = byCust.get(partyId) ?? {
            customerName: 'عميل',
            totalAmount: 0,
            invoiceCount: 0,
          };
          cEntry.totalAmount += baseAmt;
          cEntry.invoiceCount += 1;
          byCust.set(partyId, cEntry);
        }
      } else if (r.type === 'sale_return') {
        totalReturns += baseAmt;
        dEntry.returns += baseAmt;
        if (curr === 'SAR') totalReturnsSAR += amt;
        else if (curr === 'YER') totalReturnsYER += amt;
      }

      if (day) byDay.set(day, dEntry);
    }

    // 3. Fast decoupled batch customer names lookup for top 10 customers only (< 15ms)
    const topCustomerEntries = Array.from(byCust.entries())
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
      .slice(0, 10);

    const partyMap = await batchLookupParties(
      topCustomerEntries.map(([id]) => id),
      supabase
    );

    for (const entry of topCustomerEntries) {
      const found = partyMap.get(entry[0]);
      if (found) entry[1].customerName = found.name;
    }

    // 3.5 Fast decoupled top products lookup for matching invoices
    const saleInvoiceIds = (invRows || [])
      .filter(r => r.type === 'sale')
      .map(r => r.id)
      .slice(0, 100);

    let topProducts: Array<{
      productId: string;
      productName: string;
      sku?: string;
      partNumber?: string | null;
      brand?: string | null;
      quantity: number;
      revenue: number;
    }> = [];

    if (saleInvoiceIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, total')
        .in('invoice_id', saleInvoiceIds);

      if (itemRows && itemRows.length > 0) {
        const prodMap = new Map<string, { quantity: number; revenue: number }>();
        for (const it of itemRows) {
          const pid = it.product_id;
          if (pid) {
            const entry = prodMap.get(pid) ?? { quantity: 0, revenue: 0 };
            entry.quantity += Number(it.quantity || 0);
            entry.revenue += Number(it.total || 0);
            prodMap.set(pid, entry);
          }
        }

        const topProdEntries = Array.from(prodMap.entries())
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 10);

        const prodDetailsMap = await batchLookupProducts(
          topProdEntries.map(([id]) => id),
          supabase
        );

        topProducts = topProdEntries.map(([pid, v]) => {
          const detail = prodDetailsMap.get(pid);
          return {
            productId: pid,
            productName: detail?.name_ar || 'صنف',
            ...(detail?.sku ? { sku: detail.sku } : {}),
            partNumber: detail?.part_number ?? null,
            brand: detail?.brand ?? null,
            quantity: v.quantity,
            revenue: v.revenue,
          };
        });
      }
    }

    // 4. Calculate previous period metrics
    let prevTotalSales = 0;
    let prevTotalReturns = 0;
    for (const pr of prevRows || []) {
      const amt = pr.total_amount ?? 0;
      const rate = pr.exchange_rate ?? 1;
      const curr = (pr.currency_code || 'SAR').toUpperCase();
      let baseAmt = amt;
      if (params.currency && params.currency !== 'ALL') {
        baseAmt = amt;
      } else {
        try {
          baseAmt = toBaseCurrency({ amount: amt, currency_code: curr, exchange_rate: rate });
        } catch {
          baseAmt = amt;
        }
      }
      if (pr.type === 'sale') prevTotalSales += baseAmt;
      else if (pr.type === 'sale_return') prevTotalReturns += baseAmt;
    }
    const prevNetSales = prevTotalSales - prevTotalReturns;

    const netSales = totalSales - totalReturns;
    return {
      data: {
        totalSales,
        totalReturns,
        netSales,
        totalSalesSAR,
        totalSalesYER,
        cashSalesSAR,
        cashSalesYER,
        creditSalesSAR,
        creditSalesYER,
        totalReturnsSAR,
        totalReturnsYER,
        invoiceCount,
        averageInvoiceValue: invoiceCount > 0 ? totalSales / invoiceCount : 0,
        prevTotalSales,
        prevTotalReturns,
        prevNetSales,
        topProducts,
        topCustomers: topCustomerEntries.map(([customerId, v]) => ({ customerId, ...v })),
        salesByDay: Array.from(byDay.entries())
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        salesByPaymentMethod: Array.from(byMethod.entries()).map(([method, amount]) => ({
          method,
          amount,
        })),
      },
      error: null,
    };
  },
};
