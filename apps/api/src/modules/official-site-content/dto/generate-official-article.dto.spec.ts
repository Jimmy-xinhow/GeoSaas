import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateOfficialArticleDto } from './generate-official-article.dto';

describe('GenerateOfficialArticleDto', () => {
  it('treats an empty topic as omitted so the service can recommend one', async () => {
    const dto = plainToInstance(GenerateOfficialArticleDto, { topic: '   ' });

    expect(dto.topic).toBeUndefined();
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('still rejects a non-empty topic shorter than eight characters', async () => {
    const dto = plainToInstance(GenerateOfficialArticleDto, { topic: '太短主題' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'topic')).toBe(true);
  });
});
