// Category Service - Handles product category operations
import { supabase } from '@/lib/supabaseClient';
import { inventoryApi } from '../api';

interface RawCategory {
    id: string;
    name?: string;
    name_ar?: string;
    productsCount?: number;
    totalStock?: number;
    totalValue?: number;
    hasAlert?: boolean;
}

export const categoryService = {
    /**
     * Get all categories for a company via server-side aggregation RPC
     * (eliminates downloading 45,000+ products & O(C*P) main-thread blocking).
     */
    getCategories: async (companyId: string) => {
        try {
            const { data, error } = await (supabase.rpc as Function)(
                'fn_get_product_categories_with_stats',
                { p_company_id: companyId }
            );
            if (!error && Array.isArray(data)) {
                return data.map((row: RawCategory) => ({
                    id: row.id,
                    name: row.name || row.name_ar || '',
                    productsCount: Number(row.productsCount) || 0,
                    totalStock: Number(row.totalStock) || 0,
                    totalValue: Number(row.totalValue) || 0,
                    hasAlert: Boolean(row.hasAlert),
                }));
            }
        } catch {
            // Fall back to lightweight categories list
        }

        const categoriesResponse = await inventoryApi.getCategories(companyId);
        const categories: RawCategory[] = Array.isArray(categoriesResponse)
            ? categoriesResponse
            : ((categoriesResponse as unknown as { data?: RawCategory[] })?.data ?? []);

        return categories.map((cat: RawCategory) => ({
            id: cat.id,
            name: cat.name || cat.name_ar || '',
            productsCount: 0,
            totalStock: 0,
            totalValue: 0,
            hasAlert: false,
        }));
    },

    /**
     * Create a new category
     */
    createCategory: async (companyId: string, name: string) => {
        const { data, error } = await inventoryApi.createCategory(companyId, name);
        if (error) throw error;
        return data;
    },

    /**
     * Delete a category
     */
    deleteCategory: async (id: string) => {
        const { error } = await inventoryApi.deleteCategory(id);
        if (error) throw error;
    }
};

export default categoryService;
