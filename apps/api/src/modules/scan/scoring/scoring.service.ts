import { Injectable } from '@nestjs/common';
import { SCAN_WEIGHTS, ScanIndicator } from '@geo-saas/shared';
import { IndicatorResult } from '../indicators/indicator.interface';

@Injectable()
export class ScoringService {
  calculateTotalScore(results: Map<string, IndicatorResult>): number {
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const [indicator, result] of results) {
      const weight = SCAN_WEIGHTS[indicator as ScanIndicator] || 10;
      totalWeightedScore += result.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
  }
}
