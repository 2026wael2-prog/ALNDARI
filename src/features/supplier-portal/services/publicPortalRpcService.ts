import { supabase } from '../../../lib/supabaseClient';
import type { Database, Json } from '../../../core/database.types';
import { logger } from '../../../core/utils/logger';
import { parseError } from '../../../core/utils/errorUtils';
import type {
  PublicPortalContext,
  SubmitPortalQuotationPayload,
  SubmitPortalQuotationResult,
} from '../types';

type PortalRpcName =
  | 'get_supplier_portal_context'
  | 'submit_supplier_portal_quotation'
  | 'regenerate_supplier_portal_token';

async function callPortalRpc<Name extends PortalRpcName>(
  fn: Name,
  args: Database['public']['Functions'][Name]['Args']
): Promise<Database['public']['Functions'][Name]['Returns']> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function getPublicPortalContext(token: string): Promise<PublicPortalContext> {
  try {
    const data = await callPortalRpc('get_supplier_portal_context', { p_token: token });
    return data as unknown as PublicPortalContext;
  } catch (err) {
    logger.error(
      'supplierPortalService.getPublicPortalContext',
      'Failed to load public portal context',
      err
    );
    throw parseError(err);
  }
}

export async function submitPublicQuotation(
  token: string,
  payload: SubmitPortalQuotationPayload
): Promise<SubmitPortalQuotationResult> {
  try {
    const data = await callPortalRpc('submit_supplier_portal_quotation', {
      p_token: token,
      p_payload: payload as unknown as Json,
    });
    return data as unknown as SubmitPortalQuotationResult;
  } catch (err) {
    logger.error(
      'supplierPortalService.submitPublicQuotation',
      'Failed to submit public portal quotation',
      err
    );
    throw parseError(err);
  }
}

export async function regeneratePortalToken(partyId: string): Promise<string> {
  try {
    return await callPortalRpc('regenerate_supplier_portal_token', { p_party_id: partyId });
  } catch (err) {
    logger.error(
      'supplierPortalService.regeneratePortalToken',
      'Failed to regenerate supplier portal token',
      err
    );
    throw parseError(err);
  }
}
