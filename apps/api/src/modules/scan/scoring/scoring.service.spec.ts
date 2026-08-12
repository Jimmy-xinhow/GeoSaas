import { ScoringService } from './scoring.service';
import { IndicatorResult } from '../indicators/indicator.interface';
import { SCAN_SCORE_VERSION, SCAN_WEIGHTS } from '@geovault/shared';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  it('should return 0 for empty results', () => {
    const results = new Map<string, IndicatorResult>();
    expect(service.calculateTotalScore(results)).toBe(0);
  });

  it('should calculate weighted score for single indicator', () => {
    const results = new Map<string, IndicatorResult>();
    results.set('json_ld', {
      score: 100,
      status: 'pass',
      details: {},
      autoFixable: false,
    });

    // json_ld weight is 15, score 100 => weighted = 100*15/15 = 100
    expect(service.calculateTotalScore(results)).toBe(100);
  });

  it('should calculate weighted average for multiple indicators', () => {
    const results = new Map<string, IndicatorResult>();
    // json_ld weight=15, llms_txt weight=5
    results.set('json_ld', { score: 100, status: 'pass', details: {}, autoFixable: false });
    results.set('llms_txt', { score: 0, status: 'fail', details: {}, autoFixable: true });

    // Weighted = (100*15 + 0*5) / (15+5) = 75
    expect(service.calculateTotalScore(results)).toBe(75);
  });

  it('defines score version 2 as an auditable 100-point weight set', () => {
    expect(SCAN_SCORE_VERSION).toBe(2);
    expect(Object.values(SCAN_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('should handle all 9 indicators at full score', () => {
    const results = new Map<string, IndicatorResult>();
    const indicators = Object.keys(SCAN_WEIGHTS);

    indicators.forEach((ind) => {
      results.set(ind, { score: 100, status: 'pass', details: {}, autoFixable: false });
    });

    expect(service.calculateTotalScore(results)).toBe(100);
  });

  it('should handle all 9 indicators at zero score', () => {
    const results = new Map<string, IndicatorResult>();
    const indicators = Object.keys(SCAN_WEIGHTS);

    indicators.forEach((ind) => {
      results.set(ind, { score: 0, status: 'fail', details: {}, autoFixable: true });
    });

    expect(service.calculateTotalScore(results)).toBe(0);
  });

  it('should handle mixed scores with correct weighting', () => {
    const results = new Map<string, IndicatorResult>();
    // llms_txt (weight 5) = 80, og_tags (weight 10) = 60, image_alt (weight 10) = 40
    results.set('llms_txt', { score: 80, status: 'warning', details: {}, autoFixable: false });
    results.set('og_tags', { score: 60, status: 'warning', details: {}, autoFixable: true });
    results.set('image_alt', { score: 40, status: 'fail', details: {}, autoFixable: true });

    // Weighted = (80*5 + 60*10 + 40*10) / (5+10+10) = 1400/25 = 56
    expect(service.calculateTotalScore(results)).toBe(56);
  });

  it('should use default weight of 10 for unknown indicators', () => {
    const results = new Map<string, IndicatorResult>();
    results.set('unknown_indicator', { score: 50, status: 'warning', details: {}, autoFixable: false });

    // Unknown weight defaults to 10, so 50*10/10 = 50
    expect(service.calculateTotalScore(results)).toBe(50);
  });
});
