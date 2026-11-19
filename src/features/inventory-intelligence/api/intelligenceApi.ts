import { getInventorySnapshot, getInventorySummary, getInventoryProductsPage } from './snapshotApi';
import { getRecommendationHistory, recordRecommendationDecision } from './decisionsApi';
import {
  getConfig,
  getRunHistory,
  recordRunAndEvaluations,
  reviewCrossReference,
  saveConfig,
} from './configAndRunsApi';

export const intelligenceApi = {
  getSnapshot: getInventorySnapshot,
  getSummary: getInventorySummary,
  getProductsPage: getInventoryProductsPage,
  getConfig,
  saveConfig,
  getRecommendationHistory,
  getRunHistory,
  recordRecommendationDecision,
  recordRunAndEvaluations,
  reviewCrossReference,
};
