import { ScoringService } from './scoring.service';
import { IndicatorResult } from '../indicators/indicator.interface';

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
    // json_ld weight=15, llms_txt weight=20
    results.set('json_ld', { score: 100, status: 'pass', details: {}, autoFixable: false });
    results.set('llms_txt', { score: 0, status: 'fail', details: {}, autoFixable: true });

    // Weighted = (100*15 + 0*20) / (15+20) = 1500/35 ≈ 43
    expect(service.calculateTotalScore(results)).toBe(43);
  });

  it('should handle all 8 indicators at full score', () => {
    const results = new Map<string, IndicatorResult>();
    const indicators = ['json_ld', 'llms_txt', 'og_tags', 'meta_description', 'faq_schema', 'title_optimization', 'contact_info', 'image_alt'];

    indicators.forEach((ind) => {
      results.set(ind, { score: 100, status: 'pass', details: {}, autoFixable: false });
    });

    expect(service.calculateTotalScore(results)).toBe(100);
  });

  it('should handle all 8 indicators at zero score', () => {
    const results = new Map<string, IndicatorResult>();
    const indicators = ['json_ld', 'llms_txt', 'og_tags', 'meta_description', 'faq_schema', 'title_optimization', 'contact_info', 'image_alt'];

    indicators.forEach((ind) => {
      results.set(ind, { score: 0, status: 'fail', details: {}, autoFixable: true });
    });

    expect(service.calculateTotalScore(results)).toBe(0);
  });

  it('should handle mixed scores with correct weighting', () => {
    const results = new Map<string, IndicatorResult>();
    // llms_txt (weight 20) = 80, og_tags (weight 10) = 60, image_alt (weight 10) = 40
    results.set('llms_txt', { score: 80, status: 'warning', details: {}, autoFixable: false });
    results.set('og_tags', { score: 60, status: 'warning', details: {}, autoFixable: true });
    results.set('image_alt', { score: 40, status: 'fail', details: {}, autoFixable: true });

    // Weighted = (80*20 + 60*10 + 40*10) / (20+10+10) = (1600+600+400)/40 = 2600/40 = 65
    expect(service.calculateTotalScore(results)).toBe(65);
  });

  it('should use default weight of 10 for unknown indicators', () => {
    const results = new Map<string, IndicatorResult>();
    results.set('unknown_indicator', { score: 50, status: 'warning', details: {}, autoFixable: false });

    // Unknown weight defaults to 10, so 50*10/10 = 50
    expect(service.calculateTotalScore(results)).toBe(50);
  });
});
