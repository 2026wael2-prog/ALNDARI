// Warehouse Service - Handles all warehouse-related operations
import { supabase } from '../../../lib/supabaseClient';
import { inventoryApi } from '../api';

interface WarehouseStockRow {
    quantity: number;
    product: {
        name_ar: string;
        sale_price: number | null;
        location?: string | null;
    } | null;
    warehouse: { name_ar?: string | null; location?: string | null } | null;
}

export const warehouseService = {
    /**
     * Get all warehouses for a company (optionally scoped to a specific branch)
     */
    getWarehouses: async (companyId: string, branchId?: string | null) => {
        const [{ data, error }, { data: metaRows }] = await Promise.all([
            inventoryApi.getWarehouses(companyId, branchId),
            supabase
                .from('warehouses')
                .select('id, branch_id, is_primary, branches(id, name)')
                .eq('company_id', companyId)
                .is('deleted_at', null),
        ]);
        if (error) throw error;

        const metaMap = new Map<
            string,
            {
                branch_id: string | null;
                branch_name: string | null;
                is_primary: boolean;
            }
        >();

        for (const row of metaRows || []) {
            const rawBranch = (row as unknown as { branches?: { name?: string } | Array<{ name?: string }> | null }).branches;
            const branchObj = Array.isArray(rawBranch) ? (rawBranch[0] ?? null) : (rawBranch ?? null);
            metaMap.set(row.id, {
                branch_id: row.branch_id ?? null,
                branch_name: branchObj?.name ?? null,
                is_primary: row.is_primary ?? false,
            });
        }

        const enriched = (data || []).map((w) => {
            const meta = metaMap.get(w.id);
            return {
                ...w,
                branch_id: meta?.branch_id ?? null,
                branch_name: meta?.branch_name ?? null,
                is_primary: meta?.is_primary ?? false,
            };
        });

        if (branchId) {
            return enriched.filter((w) => w.branch_id === branchId);
        }
        return enriched;
    },

    /**
     * Get products for a specific warehouse
     */
    getProductsForWarehouse: async (warehouseId: string) => {
        const { data, error } = await supabase
            .from('product_stock')
            .select(`
                quantity,
                product:products!inner(id, name_ar, sale_price, location),
                warehouse:warehouses(name_ar, location)
            `)
            .eq('warehouse_id', warehouseId)
            .is('products.deleted_at', null);

        if (error) throw error;

        // cast صريح: النوع المستنتج من الاستعلام قد يكون {} رغم تحديد الحقول
        return (data || []).map((item) => {
            const typed = item as unknown as WarehouseStockRow;
            const product = typed.product ?? { name_ar: '', sale_price: null, location: null };
            const warehouse = typed.warehouse ?? { name_ar: null, location: null };
            
            // Combine Warehouse Name and Product Shelf Location
            const warehouseName = warehouse.name_ar || '';
            const shelfLocation = product.location || '';
            const compositeLocation = shelfLocation 
                ? `${warehouseName} / ${shelfLocation}`
                : warehouseName;

            return {
                ...product,
                stock_quantity: typed.quantity || 0,
                name_ar: product.name_ar || '',
                sale_price: Number(product.sale_price) || 0,
                location: compositeLocation
            };
        });
    }
};

export default warehouseService;
