import type { PartyType } from '../../features/parties/types';

/**
 * Resolver for background sync mutations.
 * Maps mutation keys to their respective service calls.
 * All feature services are imported dynamically on-demand so they never bloat
 * the critical initial application bundle.
 */

/** Type-only cast helper — runtime-identical to `as any`, but grep-able and explicit. */
const cast = <T>(value: unknown): T => value as T;

export const processSyncMutation = async (
  mutationKey: readonly unknown[],
  variables: unknown,
  metadata?: unknown
) => {
  const [feature, action] = mutationKey;
  const vars = (variables ?? {}) as Record<string, unknown>;
  const meta = (metadata ?? {}) as { last_updated_at?: string };

  // Inventory Sync
  if (feature === 'products' && action === 'save') {
    const { inventoryApi } = await import('../../features/inventory/api');
    const { inventoryService } = await import('../../features/inventory/service');
    const { id, company_id, user_id, ...data } = vars;

    if (typeof id === 'string' && id !== '') {
      // Conflict Detection: Fetch current state
      const { data: current } = await inventoryApi.getProductById(id);
      if (current !== null && current !== undefined && typeof meta.last_updated_at === 'string' && meta.last_updated_at !== '') {
        const serverTime = new Date(current.updated_at).getTime();
        const clientTime = new Date(meta.last_updated_at).getTime();

        if (serverTime > clientTime) {
          throw new Error(
            `CONFLICT: تم تعديل هذا المنتج في المتجر من جهاز آخر. (خادم: ${current.updated_at}, محلي: ${meta.last_updated_at})`
          );
        }
      }
      return inventoryService.updateProduct(
        id as string,
        cast<Parameters<typeof inventoryService.updateProduct>[1]>(data),
        company_id as string
      );
    }
    return inventoryService.createProduct(
      cast<Parameters<typeof inventoryService.createProduct>[0]>(data),
      company_id as string,
      user_id as string
    );
  }

  if (feature === 'inventory' && action === 'transfer') {
    const { inventoryService } = await import('../../features/inventory/service');
    return inventoryService.createTransfer(
      cast<Parameters<typeof inventoryService.createTransfer>[0]>(vars)
    );
  }

  if (feature === 'inventory' && action === 'start_audit') {
    const { inventoryService } = await import('../../features/inventory/service');
    const { company_id, user_id, ...data } = vars;
    return inventoryService.startAudit(
      cast<Parameters<typeof inventoryService.startAudit>[0]>(data),
      company_id as string,
      user_id as string
    );
  }

  if (feature === 'inventory' && (action === 'save_audit_progress' || action === 'audit')) {
    const { inventoryService } = await import('../../features/inventory/service');
    const items = Array.isArray(variables) ? variables : vars.items;
    return inventoryService.saveAuditProgress(
      cast<Parameters<typeof inventoryService.saveAuditProgress>[0]>(items)
    );
  }

  // Parties Sync
  if (feature === 'parties' && action === 'save') {
    const { partiesService } = await import('../../features/parties/service');
    const { company_id, id, branch_id, branchId, ...data } = vars;
    const effectiveBranchId = (branch_id ?? branchId ?? null) as string | null;
    return partiesService.saveParty(
      company_id as string,
      cast<Parameters<typeof partiesService.saveParty>[1]>(data),
      cast<Parameters<typeof partiesService.saveParty>[2]>(id),
      effectiveBranchId
    );
  }

  if (feature === 'parties' && action === 'save_category') {
    const { partiesService } = await import('../../features/parties/service');
    const { company_id, name, type, id } = vars;
    return partiesService.saveCategory(
      company_id as string,
      { name: name as string, type: type as PartyType },
      cast<Parameters<typeof partiesService.saveCategory>[2]>(id)
    );
  }

  // Sales Sync
  if (feature === 'sales' && action === 'create') {
    const { salesService } = await import('../../features/sales/service');
    const { company_id, user_id, ...data } = vars;
    return salesService.processNewSale(
      company_id as string,
      user_id as string,
      cast<Parameters<typeof salesService.processNewSale>[2]>(data)
    );
  }

  // Expenses Sync
  if (feature === 'expenses' && action === 'create') {
    const { expensesService } = await import('../../features/expenses/service');
    const { company_id, user_id, ...data } = vars;
    return expensesService.processNewExpense(
      cast<Parameters<typeof expensesService.processNewExpense>[0]>(data),
      company_id as string,
      user_id as string
    );
  }

  // Purchases Sync
  if (feature === 'purchases' && action === 'create') {
    const { purchasesService } = await import('../../features/purchases/service');
    const { company_id, user_id, ...data } = vars;
    return purchasesService.processPurchase(
      cast<Parameters<typeof purchasesService.processPurchase>[0]>(data),
      company_id as string,
      user_id as string
    );
  }

  if (feature === 'purchases' && action === 'payment') {
    const { purchasesApi } = await import('../../features/purchases/service');
    const { company_id, user_id, ...data } = vars;
    return purchasesApi.createSupplierPayment(
      cast<Parameters<typeof purchasesApi.createSupplierPayment>[0]>(data),
      company_id as string,
      user_id as string
    );
  }

  // Accounting Sync
  if (feature === 'accounting' && action === 'create_account') {
    const { accountsService } = await import('../../features/accounting/services/accountsService');
    const { company_id, ...data } = vars;
    return accountsService.createAccount(
      cast<Parameters<typeof accountsService.createAccount>[0]>(data),
      company_id as string
    );
  }

  if (feature === 'accounting' && action === 'journal') {
    const { journalService } = await import('../../features/accounting/services/journalService');
    const { companyId, company_id, userId, user_id, branchId, branch_id, data } = vars;
    const effectiveBranchId = (branchId ?? branch_id ?? null) as string | null;
    return journalService.createJournal(
      cast<Parameters<typeof journalService.createJournal>[0]>(data ?? vars),
      (companyId ?? company_id) as string,
      (userId ?? user_id) as string,
      effectiveBranchId
    );
  }

  if (feature === 'bonds' && action === 'create') {
    const { bondsService } = await import('../../features/bonds/service');
    const { company_id, user_id, branch_id, branchId, ...data } = vars;
    const effectiveBranchId = (branchId ?? branch_id) as string | undefined;
    return bondsService.createBond(
      company_id as string,
      user_id as string,
      cast<Parameters<typeof bondsService.createBond>[2]>({
        ...data,
        ...(typeof effectiveBranchId === 'string' && effectiveBranchId !== '' ? { branchId: effectiveBranchId } : {}),
      })
    );
  }

  // Add more handlers as needed
  throw new Error(`No sync handler found for mutation key: ${mutationKey.join(':')}`);
};
