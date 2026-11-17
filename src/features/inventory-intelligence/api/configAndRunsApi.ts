import { supabase } from '../../../lib/supabaseClient';
import {
  DEFAULT_ENGINE_CONFIG,
  type EngineConfig,
  type IntelligenceRunSummary,
} from '../types';

export async function getConfig(companyId: string): Promise<EngineConfig> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('inv_intelligence_config')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !data) return DEFAULT_ENGINE_CONFIG;
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...(data as Partial<EngineConfig>),
  };
}

export async function saveConfig(
  companyId: string,
  userId: string,
  config: EngineConfig
): Promise<EngineConfig> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('inv_intelligence_config')
    .upsert(
      {
        company_id: companyId,
        ...config,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return { ...DEFAULT_ENGINE_CONFIG, ...(data as Partial<EngineConfig>) };
}

export async function getRunHistory(companyId: string): Promise<IntelligenceRunSummary[]> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('inv_intelligence_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return (data ?? []) as IntelligenceRunSummary[];
}

export async function recordRunAndEvaluations(
  companyId: string,
  summary: {
    productsAnalyzed: number;
    forecastsGenerated: number;
    transferCount: number;
    purchaseCount: number;
    championModel: string;
    leaderboard: Array<{
      modelName: string;
      avgMae: number;
      avgWape: number;
      avgBias: number;
      sampleCount: number;
      isChampion: boolean;
    }>;
    forecasts?: Array<{
      productId: string;
      horizonDays: number;
      demandPattern: string;
      selectedModel: string;
      predictedQty: number;
      dailyRate: number;
      confidenceScore: number;
      mae: number;
      wape: number;
      forecastBias: number;
      stockoutAdjusted: boolean;
    }>;
  }
): Promise<void> {
  try {
    const { data: runRow, error: runErr } = await (supabase as unknown as { from: (t: string) => any })
      .from('inv_intelligence_runs')
      .insert({
        company_id: companyId,
        status: 'completed',
        products_analyzed: summary.productsAnalyzed,
        forecasts_generated: summary.forecastsGenerated,
        transfer_recommendations_count: summary.transferCount,
        purchase_recommendations_count: summary.purchaseCount,
        champion_model: summary.championModel,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (!runErr && runRow?.id) {
      if (summary.leaderboard.length > 0) {
        await (supabase as unknown as { from: (t: string) => any })
          .from('inv_model_evaluations')
          .insert(
            summary.leaderboard.map(m => ({
              company_id: companyId,
              run_id: runRow.id,
              model_name: m.modelName,
              mae: m.avgMae,
              wape: m.avgWape,
              forecast_bias: m.avgBias,
              sample_count: m.sampleCount,
              is_champion: m.isChampion,
            }))
          );
      }

      if (summary.forecasts && summary.forecasts.length > 0) {
        const topForecasts = summary.forecasts.slice(0, 300);
        await (supabase as unknown as { from: (t: string) => any })
          .from('inv_demand_forecasts')
          .insert(
            topForecasts.map(f => ({
              company_id: companyId,
              run_id: runRow.id,
              product_id: f.productId,
              branch_id: null,
              horizon_days: f.horizonDays,
              demand_pattern: f.demandPattern,
              selected_model: f.selectedModel,
              predicted_qty: f.predictedQty,
              daily_rate: f.dailyRate,
              confidence_score: f.confidenceScore,
              mae: f.mae,
              wape: f.wape,
              forecast_bias: f.forecastBias,
              stockout_adjusted: f.stockoutAdjusted,
            }))
          );
      }
    }
  } catch {
    // Non-blocking audit persistence
  }
}

export async function reviewCrossReference(
  id: string,
  userId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from('product_cross_references')
    .update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}
