import { BadRequestException } from '@nestjs/common';
import { SuccessCasesService } from './success-cases.service';

describe('SuccessCasesService evidence approval gate', () => {
  it('does not approve or generate content for a case without a screenshot', async () => {
    const prisma = {
      geoSuccessCase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'case-1',
          userId: 'user-1',
          title: '缺少證據的案例',
          screenshotUrl: null,
          generatedArticleId: null,
        }),
        update: jest.fn(),
      },
    };
    const notifications = { create: jest.fn() };
    const service = new SuccessCasesService(
      prisma as any,
      { get: jest.fn() } as any,
      notifications as any,
    );
    const generateCaseArticle = jest.spyOn(service, 'generateCaseArticle');

    await expect(service.approve('case-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.geoSuccessCase.update).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(generateCaseArticle).not.toHaveBeenCalled();
  });
});
