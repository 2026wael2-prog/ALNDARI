import { salesQuotationsApi } from './quotationsApi';
import { invoicesApi } from './invoicesApi';
import { sequenceApi } from './sequenceApi';
import { analyticsApi } from './analyticsApi';
import { navigatorApi } from './navigatorApi';

export { salesQuotationsApi };
export type { InvoiceDetailItem, InvoiceWithDetails, InvoiceNavSummary } from './types';

export const salesApi = {
  ...invoicesApi,
  ...sequenceApi,
  ...analyticsApi,
  ...navigatorApi,
};
