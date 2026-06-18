import type { Question, Response, RiskLevel } from '@/types';
import { scoreToLevel } from '@/lib/risk';

export type SupplierType = 'IT' | 'Non-IT';

// Different weights per sector — IT suppliers have direct system access, so
// Access Control and Data Protection matter more; Non-IT suppliers carry higher
// operational and regulatory exposure (Business Continuity, Compliance, Personnel).
const CATEGORY_MULTIPLIERS: Record<SupplierType, Record<string, number>> = {
  'IT': {
    'Access Control':      1.4,
    'Data Protection':     1.3,
    'Incident Response':   1.2,
    'Business Continuity': 1.0,
    'Compliance':          1.0,
    'Personnel':           0.8,
    'Vendor Management':   1.1,
  },
  'Non-IT': {
    'Access Control':      0.9,
    'Data Protection':     1.1,
    'Incident Response':   0.9,
    'Business Continuity': 1.2,
    'Compliance':          1.3,
    'Personnel':           1.4,
    'Vendor Management':   0.8,
  },
};

export interface AdaptiveScoringResult {
  score: number;
  level: RiskLevel;
  weightedAchieved: number;
  weightedMax: number;
  byCategory: Record<string, { score: number; level: RiskLevel }>;
  supplierType: SupplierType;
}

const ANSWER_FACTOR: Record<string, number | null> = {
  yes: 1, partial: 0.5, no: 0, na: null,
};

export function computeAdaptiveScore(
  questions: Question[],
  responses: Response[],
  supplierType: SupplierType,
): AdaptiveScoringResult {
  const responseMap = new Map(responses.map(r => [r.questionId, r.answer]));
  let weightedAchieved = 0;
  let weightedMax = 0;
  const cat: Record<string, { achieved: number; max: number }> = {};

  for (const q of questions) {
    const ans = responseMap.get(q.id);
    if (!ans) continue;
    const factor = ANSWER_FACTOR[ans];
    if (factor === null) continue;
    const multiplier = CATEGORY_MULTIPLIERS[supplierType][q.category] ?? 1.0;
    const adaptedWeight = q.weight * multiplier;
    weightedMax += adaptedWeight;
    weightedAchieved += adaptedWeight * factor;
    cat[q.category] ??= { achieved: 0, max: 0 };
    cat[q.category].max += adaptedWeight;
    cat[q.category].achieved += adaptedWeight * factor;
  }

  const score = weightedMax === 0 ? 0 : Math.round((weightedAchieved / weightedMax) * 100);
  const byCategory: Record<string, { score: number; level: RiskLevel }> = {};
  for (const [k, v] of Object.entries(cat)) {
    const s = v.max === 0 ? 0 : Math.round((v.achieved / v.max) * 100);
    byCategory[k] = { score: s, level: scoreToLevel(s) };
  }

  return { score, level: scoreToLevel(score), weightedAchieved, weightedMax, byCategory, supplierType };
}
