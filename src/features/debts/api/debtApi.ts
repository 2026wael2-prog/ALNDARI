/**
 * Debt & Collection module — API facade.
 * Composes domain-specific API modules while preserving 100% backwards-compatible exports.
 */
import {
  DEBT_ENGINE_DEFAULTS,
  debtApi,
  type DebtEngineParams,
} from './debtCoreApi';
import { EMPTY_CHANNEL_CONFIG, debtMessagingApi } from './debtMessagingApi';
import { debtQueueApi } from './debtQueueApi';

export { DEBT_ENGINE_DEFAULTS, EMPTY_CHANNEL_CONFIG, debtApi };
export type { DebtEngineParams };

export const debtMessageApi = {
  ...debtMessagingApi,
  ...debtQueueApi,
};
