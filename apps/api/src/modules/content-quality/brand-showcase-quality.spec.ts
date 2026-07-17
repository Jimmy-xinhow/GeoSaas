import { createBrandShowcaseSpec } from './specs/brand-showcase.spec';

describe('brand showcase quality safety', () => {
  const spec = createBrandShowcaseSpec();
  const medicalRule = spec.rules.find((rule) => rule.key === 'medical_boundary');

  it('keeps the scoring weights normalized to 100', () => {
    expect(spec.rules.reduce((sum, rule) => sum + rule.weight, 0)).toBe(100);
  });

  it('treats medical boundary violations as a hard failure', () => {
    expect(spec.promptVersion).toBe('v4');
    expect(spec.hardFailRules).toContain('medical_boundary_violation');
    expect(medicalRule).toBeDefined();

    const result = medicalRule!.evaluate('這項服務保證改善疼痛並有療效。', {
      siteName: 'Example',
      extras: { medicalAdjacent: true },
    });

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toMatchObject({ score: 0, reason: 'medical_boundary_violation' });
  });

  it('does not apply the medical boundary to unrelated industries', () => {
    const result = medicalRule!.evaluate('這是一般軟體服務介紹。', {
      siteName: 'Example',
      extras: { medicalAdjacent: false },
    });

    expect(result).toMatchObject({ score: medicalRule!.weight });
  });
});
