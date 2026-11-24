import { getVendorProducts, getVendorRFQs } from './supplierCatalogService';
import {
  calculateComparisonMatrix,
  convertQuotationToPO,
  getQuotationRevisions,
  getVendorQuotations,
  submitQuotationRevision,
} from './supplierQuotationService';
import {
  getPublicPortalContext,
  regeneratePortalToken,
  submitPublicQuotation,
} from './publicPortalRpcService';

export const supplierPortalService = {
  getVendorProducts,
  getVendorRFQs,
  getVendorQuotations,
  submitQuotationRevision,
  convertQuotationToPO,
  calculateComparisonMatrix,
  getQuotationRevisions,
  getPublicPortalContext,
  submitPublicQuotation,
  regeneratePortalToken,
};
