import type { InspectedEntityData, InspectorTarget } from './types';
import type { InspectContext } from './inspectors/shared';
import { inspectProduct } from './inspectors/inspectProduct';
import { inspectParty } from './inspectors/inspectParty';
import { inspectInvoice } from './inspectors/inspectInvoice';
import { inspectBond } from './inspectors/inspectBond';
import { inspectAccount } from './inspectors/inspectAccount';

export type { InspectContext };

export async function fetchInspectedEntity(
  target: InspectorTarget,
  ctx: InspectContext
): Promise<InspectedEntityData> {
  switch (target.type) {
    case 'product':
      return inspectProduct(target.id, ctx);
    case 'party':
      return inspectParty(target.id, ctx, target.subType);
    case 'invoice':
      return inspectInvoice(target.id);
    case 'bond':
      return inspectBond(target.id);
    case 'account':
      return inspectAccount(target.id);
  }
}
