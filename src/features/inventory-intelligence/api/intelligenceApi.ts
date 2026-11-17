import { getInventorySnapshot } from './snapshotApi';
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
  getConfig,
  saveConfig,
  getRecommendationHistory,
  getRunHistory,
  recordRecommendationDecision,
  recordRunAndEvaluations,
  reviewCrossReference,
};
