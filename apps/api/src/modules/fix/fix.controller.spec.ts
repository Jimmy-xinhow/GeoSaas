import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from '../billing/credit.service';
import { FixController } from './fix.controller';
import { FixService } from './fix.service';

describe('FixController', () => {
  let controller: FixController;
  let fixService: {
    assertSmartIndicatorSupported: jest.Mock;
    assertSmartGenerateAccess: jest.Mock;
    smartGenerate: jest.Mock;
    generateJsonLd: jest.Mock;
    generateLlmsTxt: jest.Mock;
    generateOgTags: jest.Mock;
    generateFaqSchema: jest.Mock;
    applyFix: jest.Mock;
  };
  let credits: {
    checkAndDeduct: jest.Mock;
    assertAllowed: jest.Mock;
  };

  beforeEach(async () => {
    fixService = {
      assertSmartIndicatorSupported: jest.fn(),
      assertSmartGenerateAccess: jest.fn(),
      smartGenerate: jest.fn(),
      generateJsonLd: jest.fn(),
      generateLlmsTxt: jest.fn(),
      generateOgTags: jest.fn(),
      generateFaqSchema: jest.fn(),
      applyFix: jest.fn(),
    };
    credits = {
      checkAndDeduct: jest.fn().mockResolvedValue({ allowed: true }),
      assertAllowed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FixController],
      providers: [
        { provide: FixService, useValue: fixService },
        { provide: CreditService, useValue: credits },
      ],
    }).compile();

    controller = module.get<FixController>(FixController);
  });

  it('should reject unsupported smart indicators before access checks or credit deduction', async () => {
    fixService.assertSmartIndicatorSupported.mockImplementation(() => {
      throw new NotFoundException('Indicator "unknown" does not support smart generation');
    });

    await expect(
      controller.smartGenerate(
        { siteId: 'site-1', indicator: 'unknown', scanResultId: 'scan-result-1' },
        'user-1',
        'USER',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(fixService.assertSmartGenerateAccess).not.toHaveBeenCalled();
    expect(credits.checkAndDeduct).not.toHaveBeenCalled();
    expect(fixService.smartGenerate).not.toHaveBeenCalled();
  });

  it('should check access before deducting credits for supported smart generation', async () => {
    fixService.smartGenerate.mockResolvedValue({ code: '<script>ok</script>', language: 'html' });

    await controller.smartGenerate(
      { siteId: 'site-1', indicator: 'json_ld', scanResultId: 'scan-result-1' },
      'user-1',
      'USER',
    );

    expect(fixService.assertSmartIndicatorSupported).toHaveBeenCalledWith('json_ld');
    expect(fixService.assertSmartGenerateAccess).toHaveBeenCalledWith(
      'site-1',
      'scan-result-1',
      'user-1',
      'USER',
    );
    expect(credits.checkAndDeduct).toHaveBeenCalledWith('user-1', 1, 'Smart fix generation');
    expect(credits.assertAllowed).toHaveBeenCalledWith({ allowed: true });
    expect(fixService.smartGenerate).toHaveBeenCalledWith(
      'site-1',
      'json_ld',
      'scan-result-1',
      'user-1',
      'USER',
    );
  });
});
